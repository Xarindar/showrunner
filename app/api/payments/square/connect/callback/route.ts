import { NextRequest, NextResponse } from "next/server";
import { PaymentProvider } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { sanitizePaymentOnboardingError } from "@/lib/payments/onboarding-status";
import { completeSquareConnectOnboarding } from "@/lib/payments/square-connect";
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
    const description = request.nextUrl.searchParams.get("error_description") || "Square Connect was canceled.";
    return settingsRedirect("error", description);
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  if (!code || !state) {
    return settingsRedirect("error", "Square Connect returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completeSquareConnectOnboarding({ code, expectedSiteId: siteId, state });
    return settingsRedirect("saved", "payments");
  } catch (connectError) {
    const message = sanitizePaymentOnboardingError(connectError, PaymentProvider.SQUARE, "Square Connect could not be completed.");
    return settingsRedirect("error", message);
  }
}
