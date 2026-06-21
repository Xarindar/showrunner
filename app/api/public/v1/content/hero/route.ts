import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getSiteSettingsForSite } from "@/lib/site";
import { getHeroPresentationForSite } from "@/modules/content/hero-presentation.server";
import { toHeroCanvasPayload } from "@/modules/content/hero-presentation";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "content",
      scope: "content:read",
      rateLimit: { limit: 60, windowMinutes: 1 }
    });
    const settings = await getSiteSettingsForSite(context.siteId);
    const presentation = await getHeroPresentationForSite(context.siteId, settings);

    return embedJson(toHeroCanvasPayload(presentation), context);
  } catch (error) {
    return embedError(error, context);
  }
}
