import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, EmbedRequestError, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getPortfolioHeader } from "@/lib/embed/portfolio-header";

export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) { return handleEmbedPreflight(request); }
export async function GET(request: NextRequest) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    context = await authorizeEmbedRequest(request, { requireModuleId: "portfolio", scope: "galleries:read", rateLimit: { limit: 60, windowMinutes: 1 } });
    const orientation = request.nextUrl.searchParams.get("orientation");
    if (orientation !== "desktop" && orientation !== "mobile") throw new EmbedRequestError("Choose desktop or mobile orientation.", 400);
    return embedJson({ header: await getPortfolioHeader(context.siteId, orientation) }, context);
  } catch (error) { return embedError(error, context); }
}
