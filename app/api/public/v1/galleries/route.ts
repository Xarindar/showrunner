import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { listPublicGalleries } from "@/lib/embed/public-galleries";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "portfolio",
      scope: "galleries:read"
    });
    return embedJson({ galleries: await listPublicGalleries(context.siteId) }, context);
  } catch (error) {
    return embedError(error, context);
  }
}
