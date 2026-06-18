import "server-only";

import crypto from "node:crypto";
import { PaymentProvider, Prisma } from "@prisma/client";
import { publicAppBaseUrl } from "@/lib/env";
import { decryptGatewaySecret, upsertConnectedGatewayCredential } from "@/lib/payments/credentials";
import { prisma } from "@/lib/prisma";

const stateTtlSeconds = 10 * 60;
const squareApiVersion = process.env.SQUARE_API_VERSION || "2026-05-20";

type SquareTokenResponse = {
  access_token?: string;
  expires_at?: string;
  merchant_id?: string;
  refresh_token?: string;
  token_type?: string;
};

type SquareLocation = {
  id?: string;
  name?: string;
  status?: string;
};

function squareEnvironment() {
  return (process.env.SQUARE_ENVIRONMENT || "production").trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function squareApiBaseUrl() {
  return squareEnvironment() === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

function squareAuthorizeBaseUrl() {
  return squareEnvironment() === "sandbox" ? "https://connect.squareupsandbox.com/oauth2/authorize" : "https://connect.squareup.com/oauth2/authorize";
}

function requireSquareApplicationId() {
  const applicationId = process.env.SQUARE_APPLICATION_ID || "";
  if (!applicationId) throw new Error("SQUARE_APPLICATION_ID is required before Square Connect onboarding can start.");
  return applicationId;
}

function requireSquareApplicationSecret() {
  const applicationSecret = process.env.SQUARE_APPLICATION_SECRET || "";
  if (!applicationSecret) throw new Error("SQUARE_APPLICATION_SECRET is required before Square Connect onboarding can complete.");
  return applicationSecret;
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function connectStateSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before Square Connect onboarding can start.");
  }

  return secret || "local-dev-square-connect-state-secret";
}

function redirectUri() {
  return process.env.SQUARE_CONNECT_REDIRECT_URI || `${publicAppBaseUrl()}/api/payments/square/connect/callback`;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", connectStateSecret()).update(payload).digest("base64url");
}

export function createSquareConnectState(siteId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + stateTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
      siteId
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function verifySquareConnectState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Square Connect state is invalid.");

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Square Connect state signature is invalid.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    exp?: number;
    siteId?: string;
  };
  if (!decoded.siteId || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Square Connect state has expired.");
  }

  return decoded.siteId;
}

export function createSquareConnectAuthorizeUrl(siteId: string) {
  const url = new URL(squareAuthorizeBaseUrl());
  url.searchParams.set("client_id", requireSquareApplicationId());
  url.searchParams.set("scope", ["MERCHANT_PROFILE_READ", "ORDERS_READ", "ORDERS_WRITE", "PAYMENTS_READ", "PAYMENTS_WRITE"].join(" "));
  url.searchParams.set("session", "false");
  url.searchParams.set("state", createSquareConnectState(siteId));
  url.searchParams.set("redirect_uri", redirectUri());
  return url.toString();
}

async function squareFetch<T>(path: string, init: RequestInit & { accessToken?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Square-Version", squareApiVersion);
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);

  const response = await fetch(`${squareApiBaseUrl()}${path}`, {
    ...init,
    headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = Array.isArray(body.errors) ? body.errors.map((error: { detail?: string }) => error.detail).filter(Boolean).join("; ") : "";
    throw new Error(detail || `Square request failed with status ${response.status}.`);
  }

  return body as T;
}

async function exchangeSquareAuthorizationCode(code: string) {
  return squareFetch<SquareTokenResponse>("/oauth2/token", {
    body: JSON.stringify({
      client_id: requireSquareApplicationId(),
      client_secret: requireSquareApplicationSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri()
    }),
    method: "POST"
  });
}

async function getPrimarySquareLocation(accessToken: string) {
  const response = await squareFetch<{ locations?: SquareLocation[] }>("/v2/locations", {
    accessToken,
    method: "GET"
  });
  const activeLocations = (response.locations || []).filter((location) => location.id && location.status !== "INACTIVE");
  return activeLocations[0] || response.locations?.find((location) => location.id);
}

export async function completeSquareConnectOnboarding(input: { code: string; expectedSiteId?: string; state: string }) {
  const siteId = verifySquareConnectState(input.state);
  if (input.expectedSiteId && input.expectedSiteId !== siteId) {
    throw new Error("Square Connect state does not match the current site.");
  }

  const token = await exchangeSquareAuthorizationCode(input.code);
  if (!token.access_token) throw new Error("Square Connect did not return an access token.");
  if (!token.merchant_id) throw new Error("Square Connect did not return a merchant id.");

  const location = await getPrimarySquareLocation(token.access_token);
  if (!location?.id) throw new Error("Square Connect did not return an active seller location.");

  await upsertConnectedGatewayCredential({
    accessToken: token.access_token,
    displayName: location.name || token.merchant_id,
    encryptedMetadata: {
      environment: squareEnvironment(),
      locationId: location.id,
      squareVersion: squareApiVersion,
      tokenType: token.token_type || ""
    } satisfies Prisma.InputJsonObject,
    expiresAt: token.expires_at ? new Date(token.expires_at) : undefined,
    externalAccountId: token.merchant_id,
    merchantId: token.merchant_id,
    provider: PaymentProvider.SQUARE,
    refreshToken: token.refresh_token || "",
    siteId,
    supportedWallets: ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"]
  });

  return siteId;
}

export async function getSquareAccessToken(siteId: string) {
  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: PaymentProvider.SQUARE,
        siteId
      }
    }
  });
  if (!credential?.encryptedAccessToken) throw new Error("Connect Square before using Square checkout.");

  return {
    accessToken: decryptGatewaySecret(credential.encryptedAccessToken),
    credential
  };
}
