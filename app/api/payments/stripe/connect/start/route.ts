import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createStripeConnectAuthorizeUrl } from "@/lib/payments/stripe-connect";
import { getCurrentSiteId } from "@/lib/site";

function settingsRedirect(request: NextRequest, key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/settings", request.nextUrl.origin);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await requireAdmin("settings:update");
  const siteId = await getCurrentSiteId();

  try {
    return NextResponse.redirect(createStripeConnectAuthorizeUrl(siteId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe Connect could not start.";
    return settingsRedirect(request, "error", message);
  }
}
