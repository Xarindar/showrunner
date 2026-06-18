import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { completePayPalConnectOnboarding } from "@/lib/payments/paypal-connect";
import { getCurrentSiteId } from "@/lib/site";

function settingsRedirect(key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/settings", publicAppBaseUrl());
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await requireAdmin("settings:update");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const description = request.nextUrl.searchParams.get("error_description") || "PayPal Connect was canceled.";
    return settingsRedirect("error", description);
  }

  const state = request.nextUrl.searchParams.get("state") || "";
  if (!state) {
    return settingsRedirect("error", "PayPal Connect returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completePayPalConnectOnboarding({
      expectedSiteId: siteId,
      searchParams: request.nextUrl.searchParams,
      state
    });
    return settingsRedirect("saved", "payments");
  } catch (connectError) {
    const message = connectError instanceof Error ? connectError.message : "PayPal Connect could not be completed.";
    return settingsRedirect("error", message);
  }
}
