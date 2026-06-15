import "server-only";

import type { NextRequest } from "next/server";
import type { SiteApiKey } from "@prisma/client";
import {
  normalizeOrigin,
  normalizeOrigins,
  isPublicKeyFormatValid,
  resolveActiveSiteApiKey,
  touchSiteApiKeyUsage
} from "@/lib/embed/keys";
import { normalizeScopes, type EmbedScope } from "@/lib/embed/scopes";
import { publicGlobalRateLimitMessage, publicRateLimitForSite } from "@/lib/public-rate-limit";
import { getSiteSettingsForSite } from "@/lib/site";

export class EmbedRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmbedRequestError";
    this.status = status;
  }
}

const ALLOW_METHODS = "GET,POST,OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization, X-Showrunner-Key";
const PREFLIGHT_MAX_AGE = "600";

export type EmbedContext = {
  key: SiteApiKey;
  siteId: string;
  scopes: EmbedScope[];
  origin: string | null;
};

type AuthorizeOptions = {
  scope?: EmbedScope;
  requireModuleId?: string;
  rateLimit?: { limit?: number; windowMinutes?: number };
};

type ParsedOrigin =
  | { state: "absent"; origin: null }
  | { state: "valid"; origin: string }
  | { state: "invalid"; origin: null };

function readKeyFromRequest(request: NextRequest): string {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const headerKey = request.headers.get("x-showrunner-key");
  if (headerKey) return headerKey.trim();
  return request.nextUrl.searchParams.get("key")?.trim() || "";
}

export function embedCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    Vary: "Origin"
  };
  // Only ever reflect a concrete origin, never "*", so the allowlist stays meaningful.
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function requestOrigin(request: NextRequest): string | null {
  const parsed = parseRequestOrigin(request);
  return parsed.state === "valid" ? parsed.origin : null;
}

export function parseRequestOrigin(request: NextRequest): ParsedOrigin {
  const rawOrigin = request.headers.get("origin");
  if (rawOrigin === null) return { state: "absent", origin: null };
  const origin = normalizeOrigin(rawOrigin);
  return origin ? { state: "valid", origin } : { state: "invalid", origin: null };
}

async function enforcePreAuthKeyProtection(request: NextRequest, publicKey: string) {
  const limited = await publicGlobalRateLimitMessage("embed_api_key_attempt", request.headers, {
    limit: 60,
    windowMinutes: 1
  });
  if (limited) throw new EmbedRequestError(limited, 429);

  if (!publicKey) throw new EmbedRequestError("Missing API key.", 401);
  if (!isPublicKeyFormatValid(publicKey)) throw new EmbedRequestError("Invalid API key.", 401);
}

function enforceOriginBoundary(key: SiteApiKey, parsedOrigin: ParsedOrigin) {
  if (parsedOrigin.state === "invalid") {
    throw new EmbedRequestError("Invalid Origin header.", 403);
  }

  if (parsedOrigin.state === "absent") {
    if (key.allowServerToServer) return null;
    throw new EmbedRequestError("Origin header is required for this publishable API key.", 403);
  }

  const allowedOrigins = normalizeOrigins(key.allowedOrigins);
  if (!allowedOrigins.length || !allowedOrigins.includes(parsedOrigin.origin)) {
    throw new EmbedRequestError("Origin not allowed for this API key.", 403);
  }

  return parsedOrigin.origin;
}

async function resolveEmbedKeyForRequest(request: NextRequest) {
  const publicKey = readKeyFromRequest(request);
  await enforcePreAuthKeyProtection(request, publicKey);
  const key = await resolveActiveSiteApiKey(publicKey);
  if (!key) throw new EmbedRequestError("Invalid or revoked API key.", 401);
  return key;
}

// Resolve + authorize an embed/public-API request:
//   key -> site, origin allowlist, optional scope + module-enabled checks, per-site rate limit.
export async function authorizeEmbedRequest(request: NextRequest, options: AuthorizeOptions = {}): Promise<EmbedContext> {
  const key = await resolveEmbedKeyForRequest(request);
  const origin = enforceOriginBoundary(key, parseRequestOrigin(request));

  const scopes = normalizeScopes(key.scopes);
  if (options.scope && !scopes.includes(options.scope)) {
    throw new EmbedRequestError("This API key is not authorized for that action.", 403);
  }

  if (options.requireModuleId) {
    const settings = await getSiteSettingsForSite(key.siteId);
    if (!settings.enabledModuleIds.includes(options.requireModuleId)) {
      throw new EmbedRequestError("That module is not available on this site.", 404);
    }
  }

  const limited = await publicRateLimitForSite(
    key.siteId,
    `embed:${options.scope || "request"}:${key.id}`,
    options.rateLimit
  );
  if (limited) throw new EmbedRequestError(limited, 429);

  void touchSiteApiKeyUsage(key.id);

  return { key, siteId: key.siteId, scopes, origin };
}

export function embedJson(data: unknown, context: { origin: string | null }, init: { status?: number } = {}) {
  return Response.json({ data }, { status: init.status ?? 200, headers: embedCorsHeaders(context.origin) });
}

export function embedError(error: unknown, context: { origin: string | null }) {
  const status = error instanceof EmbedRequestError ? error.status : 500;
  const message = error instanceof EmbedRequestError ? error.message : "Request failed.";
  return Response.json({ error: message }, { status, headers: embedCorsHeaders(context.origin) });
}

// CORS preflight is a browser handshake, not a security boundary. If the request supplies a key
// (for example during diagnostics), enforce the same key + origin boundary without touching usage.
export async function handleEmbedPreflight(request: NextRequest) {
  try {
    const parsedOrigin = parseRequestOrigin(request);
    const publicKey = readKeyFromRequest(request);
    if (publicKey) {
      const key = await resolveEmbedKeyForRequest(request);
      const origin = enforceOriginBoundary(key, parsedOrigin);
      return new Response(null, { status: 204, headers: embedCorsHeaders(origin) });
    }

    if (parsedOrigin.state === "invalid") throw new EmbedRequestError("Invalid Origin header.", 403);
    return new Response(null, {
      status: 204,
      headers: embedCorsHeaders(parsedOrigin.state === "valid" ? parsedOrigin.origin : null)
    });
  } catch (error) {
    return embedError(error, { origin: null });
  }
}
