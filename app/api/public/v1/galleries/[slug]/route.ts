import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getPublicGallery } from "@/lib/embed/public-galleries";

export const dynamic = "force-dynamic";

type PublicGalleryRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest, { params }: PublicGalleryRouteProps) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "portfolio",
      scope: "galleries:read"
    });
    return embedJson(
      await getPublicGallery({
        accessToken: url.searchParams.get("access") || url.searchParams.get("token") || "",
        siteId: context.siteId,
        slug
      }),
      context
    );
  } catch (error) {
    return embedError(error, context);
  }
}
