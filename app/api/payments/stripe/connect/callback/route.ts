import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completeStripeConnectOnboarding } from "@/lib/payments/stripe-connect";
import { getCurrentSiteId } from "@/lib/site";

function settingsRedirect(request: NextRequest, key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/settings", request.nextUrl.origin);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await requireAdmin("settings:update");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const description = request.nextUrl.searchParams.get("error_description") || "Stripe Connect was canceled.";
    return settingsRedirect(request, "error", description);
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  if (!code || !state) {
    return settingsRedirect(request, "error", "Stripe Connect returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completeStripeConnectOnboarding({ code, expectedSiteId: siteId, state });
    return settingsRedirect(request, "saved", "payments");
  } catch (connectError) {
    const message = connectError instanceof Error ? connectError.message : "Stripe Connect could not be completed.";
    return settingsRedirect(request, "error", message);
  }
}
