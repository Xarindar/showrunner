import crypto from "node:crypto";

// Signed-token helpers for the AdmitOne Connect wire protocol. These MUST stay
// byte-for-byte compatible with the broker (AdmitOneConnect/src/lib/tokens.ts):
//   enc = base64url(utf8(JSON.stringify(payload)))
//   sig = base64url(HMAC_SHA256(secret, enc))   // HMAC over the ASCII bytes of `enc`
//   token = enc + "." + sig

export function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlDecode(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4;
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(b64, "base64");
}

function hmac(secret: string, enc: string): Buffer {
  return crypto.createHmac("sha256", secret).update(enc, "ascii").digest();
}

export function signConnectToken(payload: unknown, secret: string): string {
  const enc = base64urlEncode(JSON.stringify(payload));
  return `${enc}.${base64urlEncode(hmac(secret, enc))}`;
}

export class ConnectTokenError extends Error {}

// Verify signature (timing-safe) and `exp`, returning the payload. Throws
// ConnectTokenError on any malformed token, bad signature, or expired payload.
export function verifyConnectToken<T = Record<string, unknown>>(token: string, secret: string): T {
  if (typeof token !== "string" || token.length === 0) throw new ConnectTokenError("missing token");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new ConnectTokenError("malformed token");
  const [enc, sig] = parts;

  const expected = base64urlEncode(hmac(secret, enc));
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new ConnectTokenError("bad signature");
  }

  let payload: T;
  try {
    payload = JSON.parse(base64urlDecode(enc).toString("utf8")) as T;
  } catch {
    throw new ConnectTokenError("invalid payload");
  }

  const exp = (payload as { exp?: unknown }).exp;
  if (typeof exp === "number" && exp <= Math.floor(Date.now() / 1000)) {
    throw new ConnectTokenError("token expired");
  }

  return payload;
}

export function signRawBody(rawBody: string, secret: string): string {
  return base64urlEncode(crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest());
}
