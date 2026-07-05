import "server-only";

import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import Stripe from "stripe";
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

export async function saveStripeCredentials(input: { apiKey: string; siteId: string; webhookSecret: string }) {
  const apiKey = requireValue(input.apiKey, "Paste your Stripe secret key (starts with sk_ or rk_).");
  if (!/^(sk|rk)_(test|live)_/.test(apiKey)) {
    throw new Error("That does not look like a Stripe secret key. It should start with sk_live_, sk_test_, rk_live_, or rk_test_.");
  }
  const webhookSecret = requireValue(input.webhookSecret, "Paste your Stripe webhook signing secret (starts with whsec_).");
  if (!webhookSecret.startsWith("whsec_")) {
    throw new Error("That does not look like a Stripe webhook signing secret. It should start with whsec_.");
  }

  let account: Stripe.Account;
  try {
    account = await new Stripe(apiKey).accounts.retrieveCurrent();
  } catch (error) {
    const message = error instanceof Stripe.errors.StripeError ? error.message : "Stripe rejected that secret key.";
    throw new Error(`Stripe could not verify that secret key: ${message}`);
  }

  if (!account.charges_enabled) {
    throw new Error("This Stripe account cannot accept charges yet. Finish Stripe's account activation, then save again.");
  }

  const displayName = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || account.id;
  const livemode = apiKey.includes("_live_");

  await upsertConnectedGatewayCredential({
    displayName,
    encryptedMetadata: {
      chargesEnabled: account.charges_enabled,
      country: account.country || "",
      defaultCurrency: account.default_currency || "",
      keyMode: livemode ? "live" : "test",
      onboarding: "stripe_api_key"
    } satisfies Prisma.InputJsonObject,
    externalAccountId: account.id,
    provider: PaymentProvider.STRIPE,
    secretKey: apiKey,
    siteId: input.siteId,
    supportedWallets: stripeWallets,
    webhookSecret,
    webhookSecretHint: secretHint(webhookSecret)
  });

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
    }
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
  webhookSignatureKey: string;
}) {
  const accessToken = requireValue(input.accessToken, "Paste your Square access token.");
  const webhookSignatureKey = requireValue(input.webhookSignatureKey, "Paste your Square webhook signature key.");
  const environment: SquareEnvironment = input.environment === "sandbox" ? "sandbox" : "production";

  const locations = await squareVerify(environment, accessToken);
  const usable = locations.filter((location) => location.id && location.status !== "INACTIVE");
  const requestedLocationId = (input.locationId || "").trim();
  const location =
    (requestedLocationId ? usable.find((item) => item.id === requestedLocationId) : undefined) || usable[0] || locations.find((item) => item.id);
  if (!location?.id) throw new Error("Square did not return an active location for that access token.");

  await upsertConnectedGatewayCredential({
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
    method: "POST"
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { access_token?: string; error_description?: string }) : {};
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "PayPal rejected that client ID / secret pair.");
  }
}

export async function savePayPalCredentials(input: {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
  siteId: string;
  webhookId: string;
}) {
  const clientId = requireValue(input.clientId, "Paste your PayPal app client ID.");
  const clientSecret = requireValue(input.clientSecret, "Paste your PayPal app secret.");
  const webhookId = requireValue(input.webhookId, "Paste your PayPal webhook ID so we can verify payment notifications.");
  const environment: PayPalEnvironment = input.environment === "live" ? "live" : "sandbox";

  await paypalVerify(environment, clientId, clientSecret);

  await upsertConnectedGatewayCredential({
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

  return { environment };
}

// ---------------------------------------------------------------------------
// Disconnect / reverify
// ---------------------------------------------------------------------------

export async function disconnectPaymentProvider(input: { provider: PaymentProvider; siteId: string }) {
  await prisma.paymentGatewayCredential.updateMany({
    where: { provider: input.provider, siteId: input.siteId },
    data: {
      connectedAt: null,
      encryptedAccessToken: "",
      encryptedRefreshToken: "",
      encryptedSecretKey: "",
      encryptedWebhookSecret: "",
      externalAccountId: "",
      lastVerifiedAt: null,
      merchantId: "",
      status: PaymentGatewayConnectionStatus.DISCONNECTED,
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
      const apiKey = credential.encryptedSecretKey ? decryptGatewaySecret(credential.encryptedSecretKey) : "";
      if (!apiKey) throw new Error("No stored Stripe secret key to re-check.");
      const account = await new Stripe(apiKey).accounts.retrieveCurrent();
      if (!account.charges_enabled) throw new Error("Stripe account can no longer accept charges.");
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
