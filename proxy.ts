import { NextRequest, NextResponse } from "next/server";

const visitorCookie = "sr_visitor";
const sessionCookie = "sr_session";
const landingCookie = "sr_landing_page";
const consentCookie = "sr_tracking_consent";
const cookieMaxAge = 60 * 60 * 24 * 400;
const sessionMaxAge = 60 * 30;

function shouldSkip(pathname: string) {
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/internal")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return /\.[a-z0-9]{2,8}$/i.test(pathname);
}

function isSensitiveOAuthPath(pathname: string) {
  return pathname.startsWith("/api/payments/connect/");
}

function cleanValue(value: string | null) {
  return (value || "").trim().slice(0, 160);
}

function cookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:"
  };
}

function setAttributionCookie(response: NextResponse, request: NextRequest, name: string, value: string, first = false) {
  if (!value) return;
  if (first && request.cookies.get(name)?.value) return;
  response.cookies.set(name, value, cookieOptions(request, cookieMaxAge));
}

export function proxy(request: NextRequest) {
  if (shouldSkip(request.nextUrl.pathname)) return NextResponse.next();

  if (isSensitiveOAuthPath(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  const consent = request.cookies.get(consentCookie)?.value || "unset";
  requestHeaders.set("x-showrunner-consent", consent);

  if (consent === "denied") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const visitorId = request.cookies.get(visitorCookie)?.value || crypto.randomUUID();
  const sessionId = request.cookies.get(sessionCookie)?.value || crypto.randomUUID();
  const landingPage = request.cookies.get(landingCookie)?.value || `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const utmSource = cleanValue(request.nextUrl.searchParams.get("utm_source"));
  const utmMedium = cleanValue(request.nextUrl.searchParams.get("utm_medium"));
  const utmCampaign = cleanValue(request.nextUrl.searchParams.get("utm_campaign"));
  const source = utmSource || request.cookies.get("sr_last_source")?.value || "";
  const medium = utmMedium || request.cookies.get("sr_last_medium")?.value || "";
  const campaign = utmCampaign || request.cookies.get("sr_last_campaign")?.value || "";

  requestHeaders.set("x-showrunner-visitor", visitorId);
  requestHeaders.set("x-showrunner-session", sessionId);
  requestHeaders.set("x-showrunner-landing", landingPage);
  if (source) requestHeaders.set("x-showrunner-source", source);
  if (medium) requestHeaders.set("x-showrunner-medium", medium);
  if (campaign) requestHeaders.set("x-showrunner-campaign", campaign);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(visitorCookie, visitorId, cookieOptions(request, cookieMaxAge));
  response.cookies.set(sessionCookie, sessionId, cookieOptions(request, sessionMaxAge));
  setAttributionCookie(response, request, landingCookie, landingPage, true);
  setAttributionCookie(response, request, "sr_last_source", utmSource);
  setAttributionCookie(response, request, "sr_last_medium", utmMedium);
  setAttributionCookie(response, request, "sr_last_campaign", utmCampaign);
  setAttributionCookie(response, request, "sr_first_source", utmSource, true);
  setAttributionCookie(response, request, "sr_first_medium", utmMedium, true);
  setAttributionCookie(response, request, "sr_first_campaign", utmCampaign, true);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
