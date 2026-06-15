import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, requestOrigin } from "@/lib/embed/gateway";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

// Foundation health check for the embed/public-API gateway. Proves the full chain in one call:
// key -> site resolution, origin allowlist, CORS headers, and per-site rate limiting.
export async function GET(request: NextRequest) {
  try {
    const context = await authorizeEmbedRequest(request, { rateLimit: { limit: 60, windowMinutes: 1 } });
    return embedJson(
      {
        ok: true,
        siteId: context.siteId,
        scopes: context.scopes,
        now: new Date().toISOString()
      },
      context
    );
  } catch (error) {
    return embedError(error, { origin: requestOrigin(request) });
  }
}
