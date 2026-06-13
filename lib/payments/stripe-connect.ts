import "server-only";

import crypto from "node:crypto";
import { PaymentProvider, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { upsertConnectedGatewayCredential } from "@/lib/payments/credentials";

const stateTtlSeconds = 10 * 60;

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function requireStripeConnectClientId() {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID || "";
  if (!clientId) throw new Error("STRIPE_CONNECT_CLIENT_ID is required before Stripe Connect onboarding can start.");
  return clientId;
}

function requireStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required before Stripe Connect onboarding can complete.");
  return secretKey;
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function connectStateSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before Stripe Connect onboarding can start.");
  }

  return secret || "local-dev-stripe-connect-state-secret";
}

function redirectUri() {
  return process.env.STRIPE_CONNECT_REDIRECT_URI || `${appBaseUrl()}/api/payments/stripe/connect/callback`;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", connectStateSecret()).update(payload).digest("base64url");
}

export function createStripeConnectState(siteId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + stateTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
      siteId
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function verifyStripeConnectState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Stripe Connect state is invalid.");

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Stripe Connect state signature is invalid.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    exp?: number;
    siteId?: string;
  };
  if (!decoded.siteId || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Stripe Connect state has expired.");
  }

  return decoded.siteId;
}

export function createStripeConnectAuthorizeUrl(siteId: string) {
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requireStripeConnectClientId());
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", createStripeConnectState(siteId));
  return url.toString();
}

export async function completeStripeConnectOnboarding(input: { code: string; expectedSiteId?: string; state: string }) {
  const siteId = verifyStripeConnectState(input.state);
  if (input.expectedSiteId && input.expectedSiteId !== siteId) {
    throw new Error("Stripe Connect state does not match the current site.");
  }

  const stripe = new Stripe(requireStripeSecretKey());
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code: input.code
  });

  const stripeUserId = response.stripe_user_id || "";
  if (!stripeUserId) throw new Error("Stripe Connect did not return a connected account id.");

  await upsertConnectedGatewayCredential({
    accessToken: response.access_token || "",
    displayName: stripeUserId,
    encryptedMetadata: {
      livemode: response.livemode,
      scope: response.scope || "",
      tokenType: response.token_type || ""
    } satisfies Prisma.InputJsonObject,
    externalAccountId: stripeUserId,
    provider: PaymentProvider.STRIPE,
    refreshToken: response.refresh_token || "",
    siteId,
    supportedWallets: ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"]
  });

  return siteId;
}
