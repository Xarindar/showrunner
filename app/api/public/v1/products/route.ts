import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { listPublicCommerceProducts } from "@/lib/embed/public-commerce";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "products",
      scope: "commerce:read"
    });
    return embedJson({ products: await listPublicCommerceProducts(context.siteId) }, context);
  } catch (error) {
    return embedError(error, context);
  }
}
