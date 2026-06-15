import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getPublicFormDefinition } from "@/lib/embed/public-forms";

export const dynamic = "force-dynamic";

type PublicFormRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest, { params }: PublicFormRouteProps) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    const { slug } = await params;
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "forms",
      scope: "forms:write"
    });
    return embedJson(await getPublicFormDefinition({ siteId: context.siteId, slug }), context);
  } catch (error) {
    return embedError(error, context);
  }
}
