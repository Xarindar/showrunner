import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { listPublicSchedulingServices } from "@/lib/embed/public-scheduling";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext | null = null;
  try {
    context = await authorizeEmbedRequest(request, {
      scope: "scheduling:read",
      requireModuleId: "scheduling",
      rateLimit: { limit: 60, windowMinutes: 1 }
    });
    return embedJson({ services: await listPublicSchedulingServices(context.siteId) }, context);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
