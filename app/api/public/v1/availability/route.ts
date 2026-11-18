import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { getPublicSchedulingDiagnostics, getPublicNextAvailability } from "@/lib/embed/public-scheduling";

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
    const { searchParams } = request.nextUrl;
    const input = {
      date: searchParams.get("date"),
      tierId: searchParams.get("tierId") || undefined,
      durationMinutes: searchParams.has("durationMinutes") ? Number(searchParams.get("durationMinutes")) : undefined,
      resourceId: searchParams.get("resourceId") || undefined,
      serviceId: searchParams.get("serviceId"),
      siteId: context.siteId,
      staffId: searchParams.get("staffId") || undefined
    };
    if (searchParams.has("days")) return embedJson({ nextAvailable: await getPublicNextAvailability(input, Number(searchParams.get("days"))) }, context);
    const diagnostics = await getPublicSchedulingDiagnostics(input);
    return embedJson({ diagnostics }, context);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
