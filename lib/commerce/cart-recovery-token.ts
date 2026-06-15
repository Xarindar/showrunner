import "server-only";

import crypto from "node:crypto";

type CartRecoveryPayload = {
  cartId: string;
  exp: number;
  siteId: string;
};

const tokenVersion = "v1";
const recoveryTtlMs = 14 * 24 * 60 * 60 * 1000;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function recoverySecret() {
  const secret = process.env.CART_RECOVERY_SIGNING_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("CART_RECOVERY_SIGNING_SECRET or AUTH_SECRET must be strong before cart recovery links can be used.");
  }

  return secret || "local-dev-cart-recovery-secret";
}

function sign(value: string) {
  return crypto.createHmac("sha256", recoverySecret()).update(value).digest("base64url");
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createCartRecoveryToken(input: { cartId: string; siteId: string; expiresAt?: Date | null }) {
  const defaultExpiry = Date.now() + recoveryTtlMs;
  const expiresAt = input.expiresAt ? Math.min(input.expiresAt.getTime(), defaultExpiry) : defaultExpiry;
  const payload = base64Url(
    JSON.stringify({
      cartId: input.cartId,
      exp: Math.floor(expiresAt / 1000),
      siteId: input.siteId
    } satisfies CartRecoveryPayload)
  );
  const signed = `${tokenVersion}.${payload}`;
  return `${signed}.${sign(signed)}`;
}

export function verifyCartRecoveryToken(token: string, now = new Date()): CartRecoveryPayload | null {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== tokenVersion || !payload || !signature || extra) return null;

  const signed = `${version}.${payload}`;
  if (!signaturesMatch(sign(signed), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CartRecoveryPayload>;
    if (!parsed.cartId || !parsed.siteId || !parsed.exp) return null;
    if (parsed.exp * 1000 < now.getTime()) return null;
    return {
      cartId: parsed.cartId,
      exp: parsed.exp,
      siteId: parsed.siteId
    };
  } catch {
    return null;
  }
}
