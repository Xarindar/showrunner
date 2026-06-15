import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, EmbedRequestError, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { createPublicSchedulingBooking } from "@/lib/embed/public-scheduling";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function POST(request: NextRequest) {
  let context: EmbedContext | null = null;
  try {
    context = await authorizeEmbedRequest(request, {
      scope: "scheduling:write",
      requireModuleId: "scheduling",
      rateLimit: { limit: 20, windowMinutes: 10 }
    });

    const limited = await publicRateLimitForSite(context.siteId, "booking_submission", {
      limit: 6,
      windowMinutes: 10
    });
    if (limited) throw new EmbedRequestError(limited, 429);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new EmbedRequestError("Send a valid JSON booking request.", 400);
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    return embedJson(await createPublicSchedulingBooking({ body, searchParams, siteId: context.siteId }), context, { status: 201 });
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
