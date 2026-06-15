import type { NextRequest } from "next/server";
import { EmbedRequestError, authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { createPublicCommerceCheckout } from "@/lib/embed/public-commerce";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function POST(request: NextRequest) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "products",
      scope: "commerce:write"
    });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new EmbedRequestError("Invalid JSON body.", 400);
    const limited = await publicRateLimitForSite(context.siteId, "checkout_prepare", { limit: 6, windowMinutes: 10 });
    if (limited) throw new EmbedRequestError(limited, 429);
    return embedJson(
      await createPublicCommerceCheckout({
        body,
        searchParams: Object.fromEntries(new URL(request.url).searchParams),
        siteId: context.siteId
      }),
      context,
      { status: 201 }
    );
  } catch (error) {
    return embedError(error, context);
  }
}
