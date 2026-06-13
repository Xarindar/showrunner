import "server-only";

import crypto from "node:crypto";

const fallbackSecret = "dev-client-portal-secret-change-before-deploying";

type ClientPortalTokenInput = {
  clientId: string;
  email: string;
  siteId: string;
};

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function clientPortalSecret() {
  const secret = process.env.CLIENT_PORTAL_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("CLIENT_PORTAL_SECRET or AUTH_SECRET must be strong before client portal links can be used.");
  }

  return secret || fallbackSecret;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function tokenPayload(input: ClientPortalTokenInput) {
  return ["client-portal", "v1", input.siteId, input.clientId, normalizedEmail(input.email)].join(":");
}

export function clientPortalToken(input: ClientPortalTokenInput) {
  return crypto.createHmac("sha256", clientPortalSecret()).update(tokenPayload(input)).digest("base64url");
}

export function verifyClientPortalToken(input: ClientPortalTokenInput & { token: string }) {
  if (!input.token) return false;

  const expected = clientPortalToken(input);
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const tokenHash = crypto.createHash("sha256").update(input.token).digest();
  return crypto.timingSafeEqual(expectedHash, tokenHash);
}

export function clientPortalPath(input: ClientPortalTokenInput) {
  const params = new URLSearchParams({ token: clientPortalToken(input) });
  return `/portal/${encodeURIComponent(input.clientId)}?${params.toString()}`;
}
