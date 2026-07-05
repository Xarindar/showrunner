import "server-only";

import crypto from "node:crypto";
import { PaymentProvider, type Prisma } from "@prisma/client";
import Stripe from "stripe";
import { publicAppBaseUrl } from "@/lib/env";
import { upsertConnectedGatewayCredential } from "@/lib/payments/credentials";
import { secretHint, squareApiVersion, squareVerify, type SquareEnvironment } from "@/lib/payments/provider-onboarding";
import { getConnectBrokerConfig } from "./config";
import { ConnectTokenError, signConnectToken, verifyConnectToken } from "./tokens";

// The AdmitOne Connect wire protocol (documented in the broker repo's README):
// - start:   redirect the admin's browser to {broker}/connect/{provider}/start?client_id&state
//            where `state` is signed with this deployment's shared secret and a nonce is bound
//            to the browser via a signed httpOnly cookie.
// - handoff: the broker returns to /api/payments/connect/{provider}/callback?handoff={token},
//            signed with the same shared secret; we verify signature + expiry + nonce, then
//            store the merchant tokens encrypted and charge the provider directly from then on.

export type OAuthConnectProvider = "stripe" | "square";

export const CONNECT_NONCE_COOKIE = "connect_nonce";
const STATE_TTL_SECONDS = 10 * 60;

const stripeWallets = ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"];

// The same checkout lifecycle events the paste-keys wizard asks merchants to select manually.
const stripeWebhookEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded"
];

export function isOAuthConnectProvider(value: string): value is OAuthConnectProvider {
  return value === "stripe" || value === "square";
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function callbackUrl(provider: OAuthConnectProvider) {
  return `${publicAppBaseUrl()}/api/payments/connect/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// Start: build the broker redirect + the nonce cookie that binds the round-trip
// ---------------------------------------------------------------------------

export function createConnectStart(input: { provider: OAuthConnectProvider; siteId: string }) {
  const broker = getConnectBrokerConfig();
  if (!broker) {
    throw new Error("One-click connect is not configured for this deployment. Set ADMITONE_CONNECT_BASE_URL, ADMITONE_CONNECT_CLIENT_ID, and ADMITONE_CONNECT_SHARED_SECRET.");
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const iat = nowSeconds();
  const state = signConnectToken(
    {
      v: 1,
      siteId: input.siteId,
      provider: input.provider,
      returnUrl: callbackUrl(input.provider),
      nonce,
      iat,
      exp: iat + STATE_TTL_SECONDS
    },
    broker.sharedSecret
  );

  const redirectUrl = new URL(`${broker.baseUrl}/connect/${input.provider}/start`);
  redirectUrl.searchParams.set("client_id", broker.clientId);
  redirectUrl.searchParams.set("state", state);

  return {
    nonceCookie: signConnectToken({ v: 1, nonce, iat, exp: iat + STATE_TTL_SECONDS }, broker.sharedSecret),
    nonceCookieMaxAge: STATE_TTL_SECONDS,
    redirectUrl: redirectUrl.toString()
  };
}

// ---------------------------------------------------------------------------
// Handoff verification + storage
// ---------------------------------------------------------------------------

type HandoffPayload = {
  v: number;
  provider: string;
  siteId: string;
  nonce: string;
  data: unknown;
  iat: number;
  exp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(data: Record<string, unknown>, field: string) {
  const value = data[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`The connect handoff is missing ${field}. Try connecting again.`);
  }
  return value;
}

export async function completeConnectHandoff(input: {
  handoffToken: string;
  nonceCookie: string | undefined;
  provider: OAuthConnectProvider;
  siteId: string;
}) {
  const broker = getConnectBrokerConfig();
  if (!broker) throw new Error("One-click connect is not configured for this deployment.");

  let handoff: HandoffPayload;
  let cookie: { nonce?: unknown };
  try {
    handoff = verifyConnectToken<HandoffPayload>(input.handoffToken, broker.sharedSecret);
    if (!input.nonceCookie) throw new ConnectTokenError("missing nonce cookie");
    cookie = verifyConnectToken<{ nonce?: unknown }>(input.nonceCookie, broker.sharedSecret);
  } catch (error) {
    if (error instanceof ConnectTokenError) {
      throw new Error("The connect handoff could not be verified (it may have expired). Try connecting again.");
    }
    throw error;
  }

  if (handoff.v !== 1 || handoff.provider !== input.provider) {
    throw new Error("The connect handoff does not match this provider. Try connecting again.");
  }
  if (handoff.siteId !== input.siteId) {
    throw new Error("The connect handoff belongs to a different site. Try connecting again.");
  }
  if (typeof cookie.nonce !== "string" || !handoff.nonce || cookie.nonce !== handoff.nonce) {
    throw new Error("The connect handoff did not come from this browser session. Try connecting again.");
  }
  if (!isRecord(handoff.data)) {
    throw new Error("The connect handoff is missing provider tokens. Try connecting again.");
  }

  if (input.provider === "stripe") {
    return completeStripeHandoff(input.siteId, handoff.data);
  }
  return completeSquareHandoff(input.siteId, handoff.data);
}

// ---------------------------------------------------------------------------
// Stripe (Connect Standard OAuth): the access token acts as the merchant's own
// secret key, so it is stored in the same fields the paste flow uses and every
// existing charge/refund/reverify path keeps working unchanged. We also create
// the checkout webhook endpoint on the merchant account automatically — that is
// the whole point of one-click connect.
// ---------------------------------------------------------------------------

async function provisionStripeWebhook(stripe: Stripe) {
  const url = `${publicAppBaseUrl()}/api/webhooks/stripe`;

  // Re-connecting must not pile up dead endpoints: drop any prior endpoint we
  // created for this URL (its secret is unrecoverable anyway), then make a fresh one.
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const endpoint of existing.data) {
    if (endpoint.url === url) await stripe.webhookEndpoints.del(endpoint.id);
  }

  const endpoint = await stripe.webhookEndpoints.create({
    description: "Showrunner checkout events (created by one-click connect)",
    enabled_events: stripeWebhookEvents,
    url
  });
  if (!endpoint.secret) throw new Error("Stripe did not return a webhook signing secret.");
  return endpoint.secret;
}

async function completeStripeHandoff(siteId: string, data: Record<string, unknown>) {
  const accessToken = requireString(data, "accessToken");
  const stripeUserId = requireString(data, "stripeUserId");
  const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : "";
  const scope = typeof data.scope === "string" ? data.scope : "";
  const livemode = data.livemode === true;

  const stripe = new Stripe(accessToken);
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieveCurrent();
  } catch (error) {
    const message = error instanceof Stripe.errors.StripeError ? error.message : "Stripe rejected the connected account token.";
    throw new Error(`Stripe connect finished but the account could not be verified: ${message}`);
  }
  if (!account.charges_enabled) {
    throw new Error("This Stripe account cannot accept charges yet. Finish Stripe's account activation, then connect again.");
  }

  let webhookSecret = "";
  let webhookError = "";
  try {
    webhookSecret = await provisionStripeWebhook(stripe);
  } catch (error) {
    webhookError = error instanceof Error ? error.message : "Stripe webhook setup failed.";
    console.warn("[payments:connect] Stripe webhook auto-setup failed", { siteId, webhookError });
  }

  const displayName = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || stripeUserId;

  await upsertConnectedGatewayCredential({
    accessToken,
    displayName,
    encryptedMetadata: {
      chargesEnabled: account.charges_enabled,
      country: account.country || "",
      defaultCurrency: account.default_currency || "",
      keyMode: livemode ? "live" : "test",
      onboarding: "oauth",
      scope,
      webhookAutoCreated: Boolean(webhookSecret),
      ...(webhookError ? { webhookError } : {})
    } satisfies Prisma.InputJsonObject,
    externalAccountId: stripeUserId,
    provider: PaymentProvider.STRIPE,
    refreshToken,
    secretKey: accessToken,
    siteId,
    supportedWallets: stripeWallets,
    webhookSecret: webhookSecret || undefined,
    webhookSecretHint: webhookSecret ? secretHint(webhookSecret) : undefined
  });

  return { displayName, provider: PaymentProvider.STRIPE, webhookAutoCreated: Boolean(webhookSecret) };
}

// ---------------------------------------------------------------------------
// Square OAuth: tokens expire (~30 days) and are refreshed through the broker,
// off the payment path. The location is resolved here so checkout works
// immediately. Square webhook subscriptions are app-level and cannot be created
// with the merchant token — the signature key is added separately (see docs).
// ---------------------------------------------------------------------------

async function completeSquareHandoff(siteId: string, data: Record<string, unknown>) {
  const accessToken = requireString(data, "accessToken");
  const refreshToken = requireString(data, "refreshToken");
  const merchantId = requireString(data, "merchantId");
  const expiresAtText = requireString(data, "expiresAt");
  const environment: SquareEnvironment = data.environment === "sandbox" ? "sandbox" : "production";

  const expiresAt = new Date(expiresAtText);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Square connect finished but returned an unreadable token expiry. Try connecting again.");
  }

  const locations = await squareVerify(environment, accessToken);
  const usable = locations.filter((location) => location.id && location.status !== "INACTIVE");
  const location = usable[0] || locations.find((item) => item.id);
  if (!location?.id) throw new Error("Square did not return an active location for the connected account.");

  await upsertConnectedGatewayCredential({
    accessToken,
    displayName: location.name || merchantId || "Square",
    encryptedMetadata: {
      environment,
      locationId: location.id,
      onboarding: "oauth",
      squareVersion: squareApiVersion
    } satisfies Prisma.InputJsonObject,
    expiresAt,
    externalAccountId: merchantId,
    merchantId,
    provider: PaymentProvider.SQUARE,
    refreshToken,
    siteId,
    supportedWallets: stripeWallets
    // webhookSecret intentionally omitted so a previously pasted signature key survives re-connects.
  });

  return { displayName: location.name || merchantId || "Square", provider: PaymentProvider.SQUARE, webhookAutoCreated: false };
}
