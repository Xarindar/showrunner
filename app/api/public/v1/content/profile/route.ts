import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getPublicContentProfilePayload } from "@/modules/content/content-profiles";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext | null = null;
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "content",
      scope: "content:read",
      rateLimit: { limit: 60, windowMinutes: 1 }
    });
    return embedJson(await getPublicContentProfilePayload(context.siteId, request.nextUrl.searchParams.get("profile")), context);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
