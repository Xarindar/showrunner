import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completeSquareConnectOnboarding } from "@/lib/payments/square-connect";
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
    const description = request.nextUrl.searchParams.get("error_description") || "Square Connect was canceled.";
    return settingsRedirect(request, "error", description);
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  if (!code || !state) {
    return settingsRedirect(request, "error", "Square Connect returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completeSquareConnectOnboarding({ code, expectedSiteId: siteId, state });
    return settingsRedirect(request, "saved", "payments");
  } catch (connectError) {
    const message = connectError instanceof Error ? connectError.message : "Square Connect could not be completed.";
    return settingsRedirect(request, "error", message);
  }
}
