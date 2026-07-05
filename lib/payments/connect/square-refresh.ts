import type { PaymentGatewayCredential, Prisma } from "@prisma/client";
import { decryptGatewaySecret, encryptGatewaySecret } from "@/lib/payments/credential-crypto";
import { prisma } from "@/lib/prisma";
import { getConnectBrokerConfig } from "./config";
import { signRawBody } from "./tokens";

// Square OAuth tokens expire (~30 days). Refresh goes through the AdmitOne Connect
// broker (which holds the Square app secret), but it sits OFF the payment path: the
// stored access token keeps charging until its real expiry even if the broker is
// down, because we refresh with a several-day buffer instead of at expiry.
//
// No "server-only" guard here: scripts/refresh-square-tokens.ts runs this with tsx
// outside Next, where that import cannot resolve.

const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;

function metadataObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

export function isOAuthSquareCredential(credential: Pick<PaymentGatewayCredential, "metadata">) {
  return metadataObject(credential.metadata).onboarding === "oauth";
}

// Exchange the stored refresh token for fresh Square tokens via the broker, then
// persist them encrypted. Throws when the broker is unreachable or rejects the call.
export async function refreshSquareCredentialViaBroker(credential: PaymentGatewayCredential) {
  const broker = getConnectBrokerConfig();
  if (!broker) {
    throw new Error("Square token refresh needs the AdmitOne Connect broker vars (ADMITONE_CONNECT_BASE_URL / _CLIENT_ID / _SHARED_SECRET).");
  }

  const refreshToken = credential.encryptedRefreshToken ? decryptGatewaySecret(credential.encryptedRefreshToken) : "";
  if (!refreshToken) throw new Error("No stored Square refresh token. Reconnect Square to refresh it.");

  const body = JSON.stringify({ client_id: broker.clientId, refreshToken });
  const response = await fetch(`${broker.baseUrl}/connect/square/refresh`, {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-AdmitOne-Signature": signRawBody(body, broker.sharedSecret)
    },
    method: "POST"
  });

  const text = await response.text();
  let parsed: { accessToken?: string; expiresAt?: string; message?: string; refreshToken?: string } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // fall through to the status check below with an empty body
  }
  if (!response.ok || !parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
    throw new Error(parsed.message || `Square token refresh failed (broker status ${response.status}).`);
  }

  const expiresAt = new Date(parsed.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new Error("Square token refresh returned an unreadable expiry.");

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      encryptedAccessToken: encryptGatewaySecret(parsed.accessToken),
      encryptedRefreshToken: encryptGatewaySecret(parsed.refreshToken),
      expiresAt,
      lastVerifiedAt: new Date()
    }
  });

  return { accessToken: parsed.accessToken, expiresAt };
}

// Refresh-on-expiry guard for the charge/refund/webhook paths: returns a fresh access
// token when an OAuth credential is inside the refresh buffer, or null to keep using
// the stored one. Pasted (non-OAuth) tokens always pass straight through as null.
export async function maybeRefreshSquareAccessToken(credential: PaymentGatewayCredential): Promise<string | null> {
  if (!isOAuthSquareCredential(credential) || !credential.expiresAt) return null;

  const expiresAtMs = credential.expiresAt.getTime();
  if (expiresAtMs - Date.now() > REFRESH_BUFFER_MS) return null;

  try {
    const refreshed = await refreshSquareCredentialViaBroker(credential);
    return refreshed.accessToken;
  } catch (error) {
    // Inside the buffer the old token is still valid — charge with it and let the
    // next call (or the refresh worker) retry, so a broker outage never blocks payment.
    if (expiresAtMs > Date.now()) {
      console.warn("[payments:square-refresh] refresh failed, using still-valid token", {
        error: error instanceof Error ? error.message : String(error),
        siteId: credential.siteId
      });
      return null;
    }
    throw new Error("The Square connection has expired and could not be refreshed. Reconnect Square in Settings → Payments.");
  }
}
