import crypto from "node:crypto";
import type { PaymentGatewayCredential, Prisma as PrismaTypes } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { decryptGatewaySecret, encryptGatewaySecret } from "@/lib/payments/credential-crypto";
import { prisma } from "@/lib/prisma";

// Square PKCE keeps the application secret out of every Showrunner deployment.
// Connect is used only for the browser authorization redirect; Showrunner exchanges
// the short-lived code and rotates its own single-use refresh token directly.

export type SquareOAuthEnvironment = "production" | "sandbox";

export type SquarePkceTokenSet = {
  accessToken: string;
  expiresAt: Date;
  merchantId: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type SquareTokenResponse = {
  access_token?: unknown;
  errors?: unknown;
  expires_at?: unknown;
  merchant_id?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_at?: unknown;
};

const DEFAULT_SQUARE_VERSION = "2026-05-20";
const REFRESH_CADENCE_MS = 7 * 24 * 60 * 60 * 1000;

function metadataObject(value: PrismaTypes.JsonValue): PrismaTypes.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PrismaTypes.JsonObject)
    : {};
}

function metadataString(metadata: PrismaTypes.JsonObject, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function squareOAuthBaseUrl(environment: SquareOAuthEnvironment) {
  return environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function requiredTokenField(body: SquareTokenResponse, field: keyof SquareTokenResponse): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Square token response is missing ${field}.`);
  }
  return value;
}

function tokenDate(body: SquareTokenResponse, field: "expires_at" | "refresh_token_expires_at") {
  const value = requiredTokenField(body, field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Square token response has an unreadable ${field}.`);
  }
  return parsed;
}

function providerError(body: SquareTokenResponse) {
  if (!Array.isArray(body.errors)) return "";
  return body.errors
    .map((error) => {
      if (!error || typeof error !== "object" || Array.isArray(error)) return "";
      const detail = (error as { detail?: unknown }).detail;
      return typeof detail === "string" ? detail.trim() : "";
    })
    .filter(Boolean)
    .join("; ");
}

async function squarePkceTokenRequest(input: {
  environment: SquareOAuthEnvironment;
  fields: Record<string, string>;
  squareVersion?: string;
}): Promise<SquarePkceTokenSet> {
  const response = await fetch(`${squareOAuthBaseUrl(input.environment)}/oauth2/token`, {
    body: JSON.stringify(input.fields),
    headers: {
      "Content-Type": "application/json",
      "Square-Version": input.squareVersion || DEFAULT_SQUARE_VERSION
    },
    method: "POST",
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  let body: SquareTokenResponse = {};
  try {
    body = text ? (JSON.parse(text) as SquareTokenResponse) : {};
  } catch {
    throw new Error("Square token endpoint returned an unreadable response.");
  }
  if (!response.ok) {
    throw new Error(providerError(body) || `Square token request failed with status ${response.status}.`);
  }

  return {
    accessToken: requiredTokenField(body, "access_token"),
    expiresAt: tokenDate(body, "expires_at"),
    merchantId: requiredTokenField(body, "merchant_id"),
    refreshToken: requiredTokenField(body, "refresh_token"),
    refreshTokenExpiresAt: tokenDate(body, "refresh_token_expires_at")
  };
}

export function createSquarePkcePair() {
  const verifier = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const challenge = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { challenge, verifier };
}

export async function exchangeSquarePkceCode(input: {
  authorizationCode: string;
  clientId: string;
  codeVerifier: string;
  environment: SquareOAuthEnvironment;
  redirectUri: string;
  squareVersion?: string;
}) {
  return squarePkceTokenRequest({
    environment: input.environment,
    fields: {
      client_id: input.clientId,
      code: input.authorizationCode,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri
    },
    squareVersion: input.squareVersion
  });
}

export async function refreshSquarePkceToken(input: {
  clientId: string;
  environment: SquareOAuthEnvironment;
  refreshToken: string;
  squareVersion?: string;
}) {
  return squarePkceTokenRequest({
    environment: input.environment,
    fields: {
      client_id: input.clientId,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken
    },
    squareVersion: input.squareVersion
  });
}

export function isOAuthSquareCredential(
  credential: Pick<PaymentGatewayCredential, "metadata">
) {
  const metadata = metadataObject(credential.metadata);
  return metadata.onboarding === "oauth" && metadata.tokenFlow === "pkce";
}

export function squareTokenRefreshedAt(
  credential: Pick<PaymentGatewayCredential, "metadata">
) {
  const value = metadataString(metadataObject(credential.metadata), "tokenRefreshedAt");
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

export async function refreshSquareCredentialDirect(
  credential: Pick<PaymentGatewayCredential, "id" | "siteId">
) {
  return prisma.$transaction(
    async (tx) => {
      const lockKey = `square-pkce-refresh:${credential.siteId}`;
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS acquired`
      );
      if (!lock[0]?.acquired) return null;

      const current = await tx.paymentGatewayCredential.findUnique({ where: { id: credential.id } });
      if (!current || !isOAuthSquareCredential(current)) return null;
      const refreshedAt = squareTokenRefreshedAt(current);
      if (refreshedAt && refreshedAt.getTime() > Date.now() - REFRESH_CADENCE_MS) {
        return null;
      }

      const metadata = metadataObject(current.metadata);
      const clientId = metadataString(metadata, "oauthClientId");
      const environment: SquareOAuthEnvironment =
        metadataString(metadata, "environment") === "sandbox" ? "sandbox" : "production";
      const squareVersion = metadataString(metadata, "squareVersion") || DEFAULT_SQUARE_VERSION;
      const refreshToken = current.encryptedRefreshToken
        ? decryptGatewaySecret(current.encryptedRefreshToken)
        : "";
      if (!clientId || !refreshToken) {
        throw new Error("Square PKCE credential is incomplete. Reconnect Square.");
      }

      const refreshed = await refreshSquarePkceToken({
        clientId,
        environment,
        refreshToken,
        squareVersion
      });
      if (current.merchantId && refreshed.merchantId !== current.merchantId) {
        throw new Error("Square refreshed a different merchant account.");
      }

      await tx.paymentGatewayCredential.update({
        data: {
          encryptedAccessToken: encryptGatewaySecret(refreshed.accessToken),
          encryptedRefreshToken: encryptGatewaySecret(refreshed.refreshToken),
          expiresAt: refreshed.expiresAt,
          lastVerifiedAt: new Date(),
          metadata: {
            ...metadata,
            refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt.toISOString(),
            tokenRefreshedAt: new Date().toISOString()
          } as PrismaTypes.InputJsonObject
        },
        where: { id: current.id }
      });

      return refreshed;
    },
    { maxWait: 5_000, timeout: 20_000 }
  );
}
