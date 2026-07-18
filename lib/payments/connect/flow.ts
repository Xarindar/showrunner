import "server-only";

import crypto from "node:crypto";
import { PaymentGatewayConnectionStatus, PaymentProvider, type Prisma } from "@prisma/client";
import Stripe from "stripe";
import { publicAppBaseUrl } from "@/lib/env";
import { encryptGatewaySecret, upsertConnectedGatewayCredential } from "@/lib/payments/credentials";
import { secretHint, squareApiVersion, squareVerify, type SquareEnvironment } from "@/lib/payments/provider-onboarding";
import { prisma } from "@/lib/prisma";
import { brokerRequest, revokeOAuthProvider } from "./broker-client";
import { getConnectBrokerConfig } from "./config";
import { ConnectTokenError, signConnectToken, verifyConnectToken } from "./tokens";

// The AdmitOne Connect wire protocol (documented in the broker repo's README):
// - start:   redirect the admin's browser to {broker}/connect/{provider}/start?client_id&state
//            where `state` is signed with this deployment's shared secret and a nonce is bound
//            to the browser via a signed httpOnly cookie.
// - handoff: the broker returns an opaque one-time code in the browser. This server redeems
//            it over an authenticated back channel, verifies provider/site/browser binding,
//            then stores merchant tokens encrypted.

export type OAuthConnectProvider = "stripe" | "square";

export const CONNECT_NONCE_COOKIE = "connect_nonce";
const STATE_TTL_SECONDS = 10 * 60;
const CLIENT_STATE_TYPE = "admitone.client_state";
const NONCE_COOKIE_TYPE = "admitone.nonce";
const HANDOFF_TYPE = "admitone.handoff";

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
      typ: CLIENT_STATE_TYPE,
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
    nonceCookie: signConnectToken({ typ: NONCE_COOKIE_TYPE, v: 1, nonce, iat, exp: iat + STATE_TTL_SECONDS }, broker.sharedSecret),
    nonceCookieMaxAge: STATE_TTL_SECONDS,
    redirectUrl: redirectUrl.toString()
  };
}

// ---------------------------------------------------------------------------
// Handoff verification + storage
// ---------------------------------------------------------------------------

type HandoffPayload = {
  typ: string;
  v: number;
  clientId: string;
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
  handoffCode: string;
  nonceCookie: string | undefined;
  provider: OAuthConnectProvider;
  siteId: string;
}) {
  const broker = getConnectBrokerConfig();
  if (!broker) throw new Error("One-click connect is not configured for this deployment.");

  let cookie: { nonce?: unknown };
  try {
    if (!input.nonceCookie) throw new ConnectTokenError("missing nonce cookie");
    cookie = verifyConnectToken<{ nonce?: unknown }>(input.nonceCookie, broker.sharedSecret, NONCE_COOKIE_TYPE);
  } catch (error) {
    if (error instanceof ConnectTokenError) {
      throw new Error("The connect handoff could not be verified (it may have expired). Try connecting again.");
    }
    throw error;
  }

  if (typeof cookie.nonce !== "string" || cookie.nonce.trim() === "") {
    throw new Error("The connect handoff did not come from this browser session. Try connecting again.");
  }

  const redeemed = await brokerRequest<{ handoff?: HandoffPayload }>({
    path: "/connect/handoff/redeem",
    provider: input.provider,
    siteId: input.siteId,
    fields: { code: input.handoffCode, nonce: cookie.nonce }
  });
  const handoff = redeemed.handoff;
  if (!handoff) throw new Error("The connect handoff is invalid, expired, or already used. Try connecting again.");

  if (handoff.typ !== HANDOFF_TYPE || handoff.v !== 1 || handoff.clientId !== broker.clientId || handoff.provider !== input.provider) {
    throw new Error("The connect handoff does not match this provider. Try connecting again.");
  }
  if (handoff.siteId !== input.siteId) {
    throw new Error("The connect handoff belongs to a different site. Try connecting again.");
  }
  if (!handoff.nonce || cookie.nonce !== handoff.nonce) {
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
  return { id: endpoint.id, secret: endpoint.secret };
}

async function completeStripeHandoff(siteId: string, data: Record<string, unknown>) {
  const accessToken = requireString(data, "accessToken");
  const stripeUserId = requireString(data, "stripeUserId");
  const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : "";
  const scope = typeof data.scope === "string" ? data.scope : "";
  const livemode = data.livemode === true;

  const stripe = new Stripe(accessToken, { maxNetworkRetries: 2, timeout: 10_000 });
  let webhookEndpointId = "";
  try {
    const account = await stripe.accounts.retrieveCurrent();
    if (!account.charges_enabled) {
      throw new Error("This Stripe account cannot accept charges yet. Finish Stripe's account activation, then connect again.");
    }

    const webhook = await provisionStripeWebhook(stripe);
    webhookEndpointId = webhook.id;
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
        webhookAutoCreated: true,
        webhookEndpointId
      } satisfies Prisma.InputJsonObject,
      externalAccountId: stripeUserId,
      provider: PaymentProvider.STRIPE,
      refreshToken,
      secretKey: accessToken,
      siteId,
      supportedWallets: stripeWallets,
      webhookSecret: webhook.secret,
      webhookSecretHint: secretHint(webhook.secret)
    });

    return { displayName, provider: PaymentProvider.STRIPE, webhookAutoCreated: true, pendingLocationSelection: false };
  } catch (error) {
    if (webhookEndpointId) {
      await stripe.webhookEndpoints.del(webhookEndpointId).catch(() => undefined);
    }
    await revokeOAuthProvider({ provider: "stripe", siteId, externalAccountId: stripeUserId }).catch((revokeError) => {
      console.error("[payments:connect] Stripe compensation failed", {
        name: revokeError instanceof Error ? revokeError.name : "UnknownError",
        siteId
      });
    });
    const message = error instanceof Stripe.errors.StripeError ? error.message : error instanceof Error ? error.message : "Stripe setup failed.";
    throw new Error(`Stripe connect could not be completed and was rolled back: ${message}`);
  }
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

  try {
    const locations = await squareVerify(environment, accessToken);
    const usable = locations.filter((location): location is { id: string; name?: string; status?: string } =>
      Boolean(location.id) && location.status !== "INACTIVE"
    );
    if (!usable.length) throw new Error("Square did not return an active location for the connected account.");
    const pendingLocations = usable.map((location) => ({ id: location.id, name: location.name || location.id }));

    await prisma.paymentGatewayCredential.upsert({
      where: { siteId_provider: { siteId, provider: PaymentProvider.SQUARE } },
      update: {
        connectedAt: null,
        displayName: merchantId,
        encryptedAccessToken: encryptGatewaySecret(accessToken),
        encryptedRefreshToken: encryptGatewaySecret(refreshToken),
        expiresAt,
        externalAccountId: merchantId,
        lastVerifiedAt: new Date(),
        merchantId,
        metadata: { environment, onboarding: "oauth", pendingLocations, squareVersion: squareApiVersion },
        status: PaymentGatewayConnectionStatus.PENDING,
        supportedWallets: stripeWallets
      },
      create: {
        displayName: merchantId,
        encryptedAccessToken: encryptGatewaySecret(accessToken),
        encryptedRefreshToken: encryptGatewaySecret(refreshToken),
        expiresAt,
        externalAccountId: merchantId,
        lastVerifiedAt: new Date(),
        merchantId,
        metadata: { environment, onboarding: "oauth", pendingLocations, squareVersion: squareApiVersion },
        provider: PaymentProvider.SQUARE,
        siteId,
        status: PaymentGatewayConnectionStatus.PENDING,
        supportedWallets: stripeWallets
      }
    });

    return {
      displayName: merchantId,
      provider: PaymentProvider.SQUARE,
      webhookAutoCreated: false,
      pendingLocationSelection: true
    };
  } catch (error) {
    await revokeOAuthProvider({ provider: "square", siteId, externalAccountId: merchantId }).catch((revokeError) => {
      console.error("[payments:connect] Square compensation failed", {
        name: revokeError instanceof Error ? revokeError.name : "UnknownError",
        siteId
      });
    });
    throw error;
  }
}

export async function completeSquareLocationSelection(input: { siteId: string; locationId: string }) {
  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: { siteId_provider: { siteId: input.siteId, provider: PaymentProvider.SQUARE } }
  });
  if (!credential || credential.status !== PaymentGatewayConnectionStatus.PENDING) {
    throw new Error("There is no pending Square connection to finish.");
  }
  const metadata = isRecord(credential.metadata) ? credential.metadata : {};
  const locations = Array.isArray(metadata.pendingLocations) ? metadata.pendingLocations : [];
  const selected = locations.find((value) => isRecord(value) && value.id === input.locationId);
  if (!isRecord(selected) || typeof selected.id !== "string" || typeof selected.name !== "string") {
    throw new Error("Choose one of the active Square locations returned for this account.");
  }
  const completedMetadata = { ...metadata };
  delete completedMetadata.pendingLocations;
  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      connectedAt: new Date(),
      displayName: selected.name,
      lastVerifiedAt: new Date(),
      metadata: { ...completedMetadata, locationId: selected.id } as Prisma.InputJsonObject,
      status: PaymentGatewayConnectionStatus.CONNECTED
    }
  });
  return { displayName: selected.name };
}
