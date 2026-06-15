import type { NextRequest } from "next/server";
import { EmbedRequestError, embedError, embedJson } from "@/lib/embed/gateway";
import { verifyIframeEmbedSession, type IframeEmbedSession } from "@/lib/embed/iframe-session";
import {
  createPublicSchedulingBooking,
  getPublicSchedulingDiagnostics,
  hasPublicSchedulingBookingHoneypot,
  listPublicSchedulingServices
} from "@/lib/embed/public-scheduling";
import { type EmbedScope } from "@/lib/embed/scopes";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";
import { getSiteSettingsForSite } from "@/lib/site";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

type IframeProxyContext = {
  origin: string;
  session: IframeEmbedSession;
};

function routePath(path?: string[]) {
  return `/${(path || []).join("/")}`;
}

async function authorizeIframeProxy(
  request: NextRequest,
  options: { rateLimit?: { limit?: number; windowMinutes?: number }; scope: EmbedScope }
): Promise<IframeProxyContext> {
  const token = request.headers.get("x-showrunner-iframe-session") || "";
  const session = await verifyIframeEmbedSession(token);

  if (!session.scopes.includes(options.scope)) {
    throw new EmbedRequestError("This iframe session is not authorized for that action.", 403);
  }

  const settings = await getSiteSettingsForSite(session.siteId);
  if (!settings.enabledModuleIds.includes("scheduling")) {
    throw new EmbedRequestError("That module is not available on this site.", 404);
  }

  const limited = await publicRateLimitForSite(
    session.siteId,
    `embed:iframe:${options.scope}:${session.keyId}`,
    options.rateLimit
  );
  if (limited) throw new EmbedRequestError(limited, 429);

  return { origin: session.origin, session };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type, X-Showrunner-Iframe-Session",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    }
  });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  let context: IframeProxyContext | null = null;
  try {
    const path = routePath((await params).path);
    if (path === "/api/public/v1/services") {
      context = await authorizeIframeProxy(request, {
        scope: "scheduling:read",
        rateLimit: { limit: 60, windowMinutes: 1 }
      });
      return embedJson({ services: await listPublicSchedulingServices(context.session.siteId) }, context);
    }

    if (path === "/api/public/v1/availability") {
      context = await authorizeIframeProxy(request, {
        scope: "scheduling:read",
        rateLimit: { limit: 60, windowMinutes: 1 }
      });
      const { searchParams } = request.nextUrl;
      const diagnostics = await getPublicSchedulingDiagnostics({
        date: searchParams.get("date"),
        resourceId: searchParams.get("resourceId") || undefined,
        serviceId: searchParams.get("serviceId"),
        siteId: context.session.siteId,
        staffId: searchParams.get("staffId") || undefined
      });
      return embedJson({ diagnostics }, context);
    }

    throw new EmbedRequestError("Not found.", 404);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let context: IframeProxyContext | null = null;
  try {
    const path = routePath((await params).path);
    if (path !== "/api/public/v1/bookings") throw new EmbedRequestError("Not found.", 404);

    context = await authorizeIframeProxy(request, {
      scope: "scheduling:write",
      rateLimit: { limit: 20, windowMinutes: 10 }
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new EmbedRequestError("Send a valid JSON booking request.", 400);
    }

    if (hasPublicSchedulingBookingHoneypot(body)) {
      return embedJson({ ok: true, booking: null }, context, { status: 201 });
    }

    const limited = await publicRateLimitForSite(context.session.siteId, "booking_submission", {
      limit: 6,
      windowMinutes: 10
    });
    if (limited) throw new EmbedRequestError(limited, 429);

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    return embedJson(
      await createPublicSchedulingBooking({ body, searchParams, siteId: context.session.siteId }),
      context,
      { status: 201 }
    );
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
