import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { completeGoogleCalendarOnboarding } from "@/lib/scheduling/google-calendar";
import { getCurrentSiteId } from "@/lib/site";

function schedulingRedirect(key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/appointments", publicAppBaseUrl());
  url.searchParams.set("panel", "rules");
  url.searchParams.set("tab", "calendar");
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await requireAdmin("scheduling:manage");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const description = request.nextUrl.searchParams.get("error_description") || "Google Calendar connect was canceled.";
    return schedulingRedirect("error", description);
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  if (!code || !state) {
    return schedulingRedirect("error", "Google Calendar returned an incomplete response.");
  }

  try {
    const siteId = await getCurrentSiteId();
    await completeGoogleCalendarOnboarding({ code, expectedSiteId: siteId, state });
    return schedulingRedirect("saved", "google-calendar");
  } catch (connectError) {
    const message = connectError instanceof Error ? connectError.message : "Google Calendar connect could not be completed.";
    return schedulingRedirect("error", message);
  }
}
