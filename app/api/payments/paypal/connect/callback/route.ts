import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completePayPalConnectOnboarding } from "@/lib/payments/paypal-connect";
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
    const description = request.nextUrl.searchParams.get("error_description") || "PayPal Connect was canceled.";
    return settingsRedirect(request, "error", description);
  }

  const state = request.nextUrl.searchParams.get("state") || "";
  if (!state) {
    return settingsRedirect(request, "error", "PayPal Connect returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completePayPalConnectOnboarding({
      expectedSiteId: siteId,
      searchParams: request.nextUrl.searchParams,
      state
    });
    return settingsRedirect(request, "saved", "payments");
  } catch (connectError) {
    const message = connectError instanceof Error ? connectError.message : "PayPal Connect could not be completed.";
    return settingsRedirect(request, "error", message);
  }
}
