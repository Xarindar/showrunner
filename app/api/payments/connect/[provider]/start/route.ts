import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { CONNECT_NONCE_COOKIE, createConnectStart, isOAuthConnectProvider } from "@/lib/payments/connect/flow";
import { getCurrentSiteId } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConnectRouteProps = { params: Promise<{ provider: string }> };

function paymentsRedirect(key: "connectError" | "connected", value: string) {
  const url = new URL("/admin/modules/payments", publicAppBaseUrl());
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(_request: NextRequest, { params }: ConnectRouteProps) {
  await requireAdmin("settings:update");
  const { provider } = await params;
  if (!isOAuthConnectProvider(provider)) {
    return paymentsRedirect("connectError", "That provider does not support one-click connect.");
  }

  try {
    const siteId = await getCurrentSiteId();
    const start = createConnectStart({ provider, siteId });

    const response = NextResponse.redirect(start.redirectUrl);
    response.cookies.set(CONNECT_NONCE_COOKIE, start.nonceCookie, {
      httpOnly: true,
      maxAge: start.nonceCookieMaxAge,
      path: "/api/payments/connect",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "One-click connect could not start.";
    return paymentsRedirect("connectError", message);
  }
}
