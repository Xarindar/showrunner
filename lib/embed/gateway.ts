import "server-only";

import type { NextRequest } from "next/server";
import type { SiteApiKey } from "@prisma/client";
import {
  normalizeOrigin,
  normalizeOrigins,
  resolveActiveSiteApiKey,
  touchSiteApiKeyUsage
} from "@/lib/embed/keys";
import { normalizeScopes, type EmbedScope } from "@/lib/embed/scopes";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";
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
  return normalizeOrigin(request.headers.get("origin") || "");
}

// Resolve + authorize an embed/public-API request:
//   key -> site, origin allowlist, optional scope + module-enabled checks, per-site rate limit.
export async function authorizeEmbedRequest(request: NextRequest, options: AuthorizeOptions = {}): Promise<EmbedContext> {
  const publicKey = readKeyFromRequest(request);
  if (!publicKey) throw new EmbedRequestError("Missing API key.", 401);

  const key = await resolveActiveSiteApiKey(publicKey);
  if (!key) throw new EmbedRequestError("Invalid or revoked API key.", 401);

  const allowedOrigins = normalizeOrigins(key.allowedOrigins);
  const origin = requestOrigin(request);

  // A browser request always carries Origin; if present it MUST be on the key's allowlist.
  // Requests without an Origin header (server-to-server) are allowed — the key is the credential.
  if (origin && (!allowedOrigins.length || !allowedOrigins.includes(origin))) {
    throw new EmbedRequestError("Origin not allowed for this API key.", 403);
  }

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
  const message = error instanceof Error ? error.message : "Request failed.";
  return Response.json({ error: message }, { status, headers: embedCorsHeaders(context.origin) });
}

// CORS preflight is a browser handshake, not a security boundary — the actual request still
// enforces key + origin allowlist. Reflect the requested origin so the real call can proceed.
export function handleEmbedPreflight(request: NextRequest) {
  return new Response(null, { status: 204, headers: embedCorsHeaders(requestOrigin(request)) });
}
