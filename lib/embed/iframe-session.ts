import "server-only";

import crypto from "node:crypto";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { normalizeOrigin, normalizeOrigins, resolveActiveSiteApiKey } from "@/lib/embed/keys";
import { normalizeScopes, type EmbedScope } from "@/lib/embed/scopes";

const SESSION_TTL_SECONDS = 10 * 60;

type IframeSessionPayload = {
  exp: number;
  keyId: string;
  origin: string;
  publicKey: string;
  scopes: EmbedScope[];
  siteId: string;
};

export type IframeEmbedSession = IframeSessionPayload;

function isWeakProductionSecret(value: string) {
  return value.length < 32 || /replace-with|local-dev|change-me|change-before-deploying/i.test(value);
}

function iframeSessionSecret() {
  const secret = process.env.EMBED_IFRAME_SESSION_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("EMBED_IFRAME_SESSION_SECRET or AUTH_SECRET must be strong before iframe embeds can be used.");
  }
  return secret || "local-dev-iframe-session-secret";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return crypto.createHmac("sha256", iframeSessionSecret()).update(value).digest("base64url");
}

function signaturesMatch(expected: string, actual: string) {
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const actualHash = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(expectedHash, actualHash);
}

export function actualEmbeddingOrigin(input: { parentOrigin: string; referer: string }) {
  const refererOrigin = normalizeOrigin(input.referer);
  const parentOrigin = normalizeOrigin(input.parentOrigin);
  if (!refererOrigin) return null;
  if (parentOrigin && parentOrigin !== refererOrigin) return null;
  return refererOrigin;
}

export async function createIframeEmbedSession(input: { embeddingOrigin: string; publicKey: string }) {
  const key = await resolveActiveSiteApiKey(input.publicKey);
  if (!key) throw new EmbedRequestError("Invalid or revoked API key.", 401);

  const origin = normalizeOrigin(input.embeddingOrigin);
  if (!origin) throw new EmbedRequestError("Valid embedding origin is required.", 403);

  const allowedOrigins = normalizeOrigins(key.allowedOrigins);
  if (!allowedOrigins.length || !allowedOrigins.includes(origin)) {
    throw new EmbedRequestError("Embedding origin not allowed for this API key.", 403);
  }

  const payload: IframeSessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    keyId: key.id,
    origin,
    publicKey: key.publicKey,
    scopes: normalizeScopes(key.scopes),
    siteId: key.siteId
  };
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export async function verifyIframeEmbedSession(token: string): Promise<IframeEmbedSession> {
  const [body, signature] = token.split(".");
  if (!body || !signature || !signaturesMatch(sign(body), signature)) {
    throw new EmbedRequestError("Invalid iframe session.", 401);
  }

  let payload: IframeSessionPayload;
  try {
    payload = JSON.parse(decode(body)) as IframeSessionPayload;
  } catch {
    throw new EmbedRequestError("Invalid iframe session.", 401);
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new EmbedRequestError("Iframe session expired.", 401);
  }

  const key = await resolveActiveSiteApiKey(payload.publicKey);
  if (!key || key.id !== payload.keyId || key.siteId !== payload.siteId) {
    throw new EmbedRequestError("Invalid or revoked API key.", 401);
  }

  const origin = normalizeOrigin(payload.origin);
  if (!origin || !normalizeOrigins(key.allowedOrigins).includes(origin)) {
    throw new EmbedRequestError("Embedding origin not allowed for this API key.", 403);
  }

  return {
    ...payload,
    origin,
    scopes: normalizeScopes(payload.scopes)
  };
}
