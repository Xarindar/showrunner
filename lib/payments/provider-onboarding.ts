import "server-only";

import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { provisionStripeWebhook } from "./stripe-webhook-setup";
import { publicAppBaseUrl } from "@/lib/env";
import { revokeStripeOAuthProvider } from "@/lib/payments/connect/broker-client";
import { decryptGatewaySecret, encryptGatewaySecret, getConnectedGatewayCredential, upsertConnectedGatewayCredential } from "@/lib/payments/credentials";
import { prisma } from "@/lib/prisma";

// Self-hosted, bring-your-own-credentials onboarding. Each merchant pastes their own provider keys;
// we verify them live against the provider before storing them encrypted, then charge directly on
// the merchant's own account. No Cosmic platform secret and no OAuth/Connect is involved.

export const squareApiVersion = process.env.SQUARE_API_VERSION || "2026-05-20";

export type SquareEnvironment = "production" | "sandbox";
export type PayPalEnvironment = "live" | "sandbox";

const stripeWallets = ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"];

export function secretHint(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed ? "••••" : "";
  return `••••${trimmed.slice(-4)}`;
}

function requireValue(value: string | undefined, message: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export function squareApiBaseUrl(environment: SquareEnvironment) {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

export function paypalApiBaseUrl(environment: PayPalEnvironment) {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

export async function saveStripeCredentials(input: { apiKey: string; siteId: string; webhookSecret?: string; useForCheckout?: boolean }) {
  const apiKey = requireValue(input.apiKey, "Paste your Stripe secret key (starts with sk_ or rk_).");
  if (!/^(sk|rk)_(test|live)_/.test(apiKey)) {
    throw new Error("That does not look like a Stripe secret key. It should start with sk_live_, sk_test_, rk_live_, or rk_test_.");
  }
  let webhookSecret = (input.webhookSecret || "").trim();
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    throw new Error("That does not look like a Stripe webhook signing secret. It should start with whsec_.");
  }

  encryptGatewaySecret(apiKey); // Check deployment encryption before creating anything at the provider.
  const stripe = new Stripe(apiKey, { maxNetworkRetries: 2, timeout: 10_000 });
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieveCurrent();
  } catch (error) {
    const message = error instanceof Stripe.errors.StripeError ? error.message : "Stripe rejected that secret key.";
    throw new Error(`Stripe could not verify that secret key: ${message}`);
  }

  const livemode = apiKey.includes("_live_");
  if (livemode && !account.charges_enabled) {
    throw new Error("This Stripe account cannot accept charges yet. Finish Stripe's account activation, then save again.");
  }

  const displayName = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || account.id;

  const previous = await getConnectedGatewayCredential(input.siteId, PaymentProvider.STRIPE);
  const metadata = metadataObject(previous?.metadata ?? {});
  const reuse = metadata.onboarding === "stripe_api_key" && previous?.externalAccountId === account.id && metadata.keyMode === (livemode ? "live" : "test") &&
    typeof metadata.webhookEndpointId === "string" && previous.encryptedWebhookSecret
    ? { id: metadata.webhookEndpointId, secret: decryptGatewaySecret(previous.encryptedWebhookSecret) } : null;
  const webhook = webhookSecret ? null : await provisionStripeWebhook(stripe, reuse);
  webhookSecret = webhook?.secret || webhookSecret;
  try {
    await upsertConnectedGatewayCredential({
      accessToken: "", refreshToken: "", expiresAt: null,
      useForCheckout: input.useForCheckout,
      displayName,
      encryptedMetadata: {
        ...(previous?.externalAccountId === account.id && metadata.keyMode === (livemode ? "live" : "test") && metadata.paymentMethods ? { paymentMethods: metadata.paymentMethods } : {}),
        chargesEnabled: account.charges_enabled,
        country: account.country || "",
        defaultCurrency: account.default_currency || "",
        keyMode: livemode ? "live" : "test",
        onboarding: "stripe_api_key",
        webhookEndpointId: webhook?.id || ""
      } satisfies Prisma.InputJsonObject,
      externalAccountId: account.id,
      provider: PaymentProvider.STRIPE,
      secretKey: apiKey,
      siteId: input.siteId,
      supportedWallets: stripeWallets,
      webhookSecret,
      webhookSecretHint: secretHint(webhookSecret)
    });
  } catch (error) {
    if (webhook?.created) await stripe.webhookEndpoints.del(webhook.id).catch(() => undefined);
    throw error;
  }

  return { displayName, livemode };
}

// ---------------------------------------------------------------------------
// Square
// ---------------------------------------------------------------------------

export type SquareLocation = {
  id?: string;
  merchant_id?: string;
  name?: string;
  status?: string;
};

// Fetch the account's locations, which doubles as a live check that the access token works.
// Shared by the paste flow, re-verify, and the one-click OAuth handoff.
export async function squareVerify(environment: SquareEnvironment, accessToken: string) {
  const response = await fetch(`${squareApiBaseUrl(environment)}/v2/locations`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": squareApiVersion
    },
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { errors?: { detail?: string }[]; locations?: SquareLocation[] }) : {};
  if (!response.ok) {
    const detail = Array.isArray(body.errors) ? body.errors.map((error) => error.detail).filter(Boolean).join("; ") : "";
    throw new Error(detail || `Square rejected that access token (status ${response.status}).`);
  }

  return body.locations || [];
}

export async function saveSquareCredentials(input: {
  accessToken: string;
  environment: SquareEnvironment;
  locationId?: string;
  siteId: string;
  webhookSignatureKey?: string;
  useForCheckout?: boolean;
}) {
  const accessToken = requireValue(input.accessToken, "Paste your Square access token.");
  const webhookSignatureKey = (input.webhookSignatureKey || "").trim();
  const environment: SquareEnvironment = input.environment === "sandbox" ? "sandbox" : "production";

  const locations = await squareVerify(environment, accessToken);
  const usable = locations.filter((location) => location.id && location.status !== "INACTIVE");
  const requestedLocationId = (input.locationId || "").trim();
  const location = requestedLocationId ? usable.find((item) => item.id === requestedLocationId) : usable.length === 1 ? usable[0] : undefined;
  if (!location?.id) throw new Error(requestedLocationId ? "That Square location is not active on this account." : "Choose an active Square location before connecting.");
  if (!location.merchant_id) throw new Error("Square did not return a merchant for this location. Check the account and try again.");

  await upsertConnectedGatewayCredential({
    refreshToken: "", secretKey: "", expiresAt: null,
    useForCheckout: input.useForCheckout,
    displayName: location.name || location.merchant_id || "Square",
    encryptedMetadata: {
      environment,
      locationId: location.id,
      onboarding: "square_access_token",
      squareVersion: squareApiVersion
    } satisfies Prisma.InputJsonObject,
    accessToken,
    externalAccountId: location.merchant_id || "",
    merchantId: location.merchant_id || "",
    provider: PaymentProvider.SQUARE,
    siteId: input.siteId,
    supportedWallets: stripeWallets,
    webhookSecret: webhookSignatureKey,
    webhookSecretHint: secretHint(webhookSignatureKey)
  });

  return { displayName: location.name || location.merchant_id || "Square", environment };
}

// One-click (OAuth) Square connections store tokens without a webhook signature key, because
// Square webhook subscriptions are app-level and cannot be created with a merchant token. This
// lets the merchant paste just the signature key afterwards without disturbing the OAuth tokens.
export async function saveSquareWebhookSignatureKey(input: { siteId: string; webhookSignatureKey: string }) {
  const webhookSignatureKey = requireValue(input.webhookSignatureKey, "Paste the Square webhook signature key.");
  const credential = await getConnectedGatewayCredential(input.siteId, PaymentProvider.SQUARE);
  if (!credential || credential.status !== PaymentGatewayConnectionStatus.CONNECTED) {
    throw new Error("Connect Square before adding its webhook signature key.");
  }

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      encryptedWebhookSecret: encryptGatewaySecret(webhookSignatureKey),
      webhookSecretHint: secretHint(webhookSignatureKey)
    }
  });
}

// ---------------------------------------------------------------------------
// PayPal
// ---------------------------------------------------------------------------

async function paypalVerify(environment: PayPalEnvironment, clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${paypalApiBaseUrl(environment)}/v1/oauth2/token`, {
    body: "grant_type=client_credentials",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST",
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { access_token?: string; error_description?: string }) : {};
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "PayPal rejected that client ID / secret pair.");
  }
  return body.access_token;
}

export async function savePayPalCredentials(input: {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
  siteId: string;
  webhookId?: string;
  useForCheckout?: boolean;
}) {
  const clientId = requireValue(input.clientId, "Paste your PayPal app client ID.");
  const clientSecret = requireValue(input.clientSecret, "Paste your PayPal app secret.");
  let webhookId = (input.webhookId || "").trim();
  const environment: PayPalEnvironment = input.environment === "live" ? "live" : "sandbox";

  encryptGatewaySecret(clientSecret);
  const token = await paypalVerify(environment, clientId, clientSecret);
  const url = `${publicAppBaseUrl().replace(/\/$/, "")}/api/webhooks/paypal`;
  let created = false;
  if (!webhookId) {
    if (new URL(url).protocol !== "https:") throw new Error("PayPal needs a public HTTPS Showrunner address for payment updates. Configure the deployment address, then try again.");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const listed = await fetch(`${paypalApiBaseUrl(environment)}/v1/notifications/webhooks`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!listed.ok) throw new Error("PayPal could not check payment notifications. Check this app's permissions and try again.");
    const body = await listed.json() as { webhooks?: { id: string; url: string; event_types?: { name: string }[] }[] };
    const events = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"];
    const existing = body.webhooks?.find((item) => item.url === url);
    if (existing && events.every((name) => existing.event_types?.some((event) => event.name === name || event.name === "*"))) webhookId = existing.id;
    else if (existing) {
      const names = [...new Set([...(existing.event_types || []).map((event) => event.name), ...events])];
      const response = await fetch(`${paypalApiBaseUrl(environment)}/v1/notifications/webhooks/${encodeURIComponent(existing.id)}`, { method: "PATCH", headers,
        body: JSON.stringify([{ op: "replace", path: "/event_types", value: names.map((name) => ({ name })) }]), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("PayPal could not update payment notifications. Check this app's permissions and try again.");
      webhookId = existing.id;
    }
    else {
      const response = await fetch(`${paypalApiBaseUrl(environment)}/v1/notifications/webhooks`, { method: "POST", headers,
        body: JSON.stringify({ url, event_types: events.map((name) => ({ name })) }), signal: AbortSignal.timeout(10_000) });
      const webhook = await response.json() as { id?: string };
      if (!response.ok || !webhook.id) throw new Error("PayPal could not create payment notifications. Check this app's permissions and try again.");
      webhookId = webhook.id;
      created = true;
    }
  }
  try {
    await upsertConnectedGatewayCredential({
      accessToken: "", refreshToken: "", expiresAt: null,
      useForCheckout: input.useForCheckout,
      displayName: `PayPal (${environment})`,
      encryptedMetadata: {
        environment,
        onboarding: "paypal_rest_app",
        webhookId
      } satisfies Prisma.InputJsonObject,
      externalAccountId: clientId,
      merchantId: clientId,
      provider: PaymentProvider.PAYPAL,
      secretKey: clientSecret,
      siteId: input.siteId,
      supportedWallets: [],
      webhookSecret: "",
      webhookSecretHint: secretHint(webhookId)
    });
  } catch (error) {
    if (created) await fetch(`${paypalApiBaseUrl(environment)}/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined);
    throw error;
  }
  return { environment };
}

// ---------------------------------------------------------------------------
// Disconnect / reverify
// ---------------------------------------------------------------------------

export async function disconnectPaymentProvider(input: { provider: PaymentProvider; siteId: string }) {
  const credential = await getConnectedGatewayCredential(input.siteId, input.provider);
  if (!credential) return;
  const metadata = metadataObject(credential.metadata);
  const isOAuth = metadata.onboarding === "oauth";

  if (isOAuth && input.provider === PaymentProvider.STRIPE) {
    await prisma.paymentGatewayCredential.update({
      where: { id: credential.id },
      data: { status: PaymentGatewayConnectionStatus.DISCONNECTING }
    });
    try {
      const accessToken = credential.encryptedAccessToken ? decryptGatewaySecret(credential.encryptedAccessToken) : "";
      if (!accessToken || !credential.externalAccountId) throw new Error("Stripe OAuth credentials are incomplete.");
      const stripe = new Stripe(accessToken, { maxNetworkRetries: 2, timeout: 10_000 });
      const webhookUrl = `${publicAppBaseUrl()}/api/webhooks/stripe`;
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      for (const endpoint of endpoints.data) {
        if (endpoint.url === webhookUrl) await stripe.webhookEndpoints.del(endpoint.id);
      }
      await revokeStripeOAuthProvider({
        siteId: input.siteId,
        externalAccountId: credential.externalAccountId
      });
    } catch (error) {
      await prisma.paymentGatewayCredential.update({
        where: { id: credential.id },
        data: {
          metadata: { ...metadata, disconnectFailure: error instanceof Error ? error.name : "UnknownError" },
          status: PaymentGatewayConnectionStatus.ERROR
        }
      });
      throw new Error(`Could not revoke ${input.provider} access. Credentials were retained so the disconnect can be retried safely.`);
    }
  }

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      connectedAt: null,
      encryptedAccessToken: "",
      encryptedRefreshToken: "",
      encryptedSecretKey: "",
      encryptedWebhookSecret: "",
      externalAccountId: "",
      lastVerifiedAt: null,
      merchantId: "",
      status: isOAuth ? PaymentGatewayConnectionStatus.REVOKED : PaymentGatewayConnectionStatus.DISCONNECTED,
      webhookSecretHint: ""
    }
  });
}

function metadataObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

// Re-run the same live check used at save time, then update status/lastVerifiedAt. Throws (and flips
// the credential to ERROR) if the provider no longer accepts the stored credentials.
export async function reverifyPaymentProvider(input: { provider: PaymentProvider; siteId: string }) {
  const credential = await getConnectedGatewayCredential(input.siteId, input.provider);
  if (!credential || credential.status === PaymentGatewayConnectionStatus.DISCONNECTED) {
    throw new Error("Connect this provider before re-checking it.");
  }

  const metadata = metadataObject(credential.metadata);
  try {
    if (input.provider === PaymentProvider.STRIPE) {
      const apiKey = metadata.onboarding === "oauth"
        ? (credential.encryptedAccessToken ? decryptGatewaySecret(credential.encryptedAccessToken) : "")
        : (credential.encryptedSecretKey ? decryptGatewaySecret(credential.encryptedSecretKey) : "");
      if (!apiKey) throw new Error("No stored Stripe secret key to re-check.");
      const account = await new Stripe(apiKey).accounts.retrieveCurrent();
      if (!account.charges_enabled && (metadata.keyMode === "live" || apiKey.includes("_live_"))) throw new Error("Stripe account can no longer accept charges.");
    } else if (input.provider === PaymentProvider.SQUARE) {
      const accessToken = credential.encryptedAccessToken ? decryptGatewaySecret(credential.encryptedAccessToken) : "";
      if (!accessToken) throw new Error("No stored Square access token to re-check.");
      const environment: SquareEnvironment = metadata.environment === "sandbox" ? "sandbox" : "production";
      await squareVerify(environment, accessToken);
    } else if (input.provider === PaymentProvider.PAYPAL) {
      const clientId = credential.externalAccountId.trim();
      const clientSecret = credential.encryptedSecretKey ? decryptGatewaySecret(credential.encryptedSecretKey) : "";
      if (!clientId || !clientSecret) throw new Error("No stored PayPal credentials to re-check.");
      const environment: PayPalEnvironment = metadata.environment === "live" ? "live" : "sandbox";
      await paypalVerify(environment, clientId, clientSecret);
    } else {
      throw new Error("This provider cannot be re-checked.");
    }
  } catch (error) {
    await prisma.paymentGatewayCredential.update({
      where: { id: credential.id },
      data: { status: PaymentGatewayConnectionStatus.ERROR }
    });
    throw error;
  }

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: { lastVerifiedAt: new Date(), status: PaymentGatewayConnectionStatus.CONNECTED }
  });
}
