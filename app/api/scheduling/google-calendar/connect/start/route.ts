import { SchedulingCalendarOwnerType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createGoogleCalendarAuthorizeUrl } from "@/lib/scheduling/google-calendar";
import { getCurrentSiteId } from "@/lib/site";

function schedulingRedirect(key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/services", publicAppBaseUrl());
  url.searchParams.set("tab", "calendar");
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await requireAdmin("scheduling:manage");
  const siteId = await getCurrentSiteId();
  const ownerType = request.nextUrl.searchParams.get("ownerType") === SchedulingCalendarOwnerType.STAFF
    ? SchedulingCalendarOwnerType.STAFF
    : SchedulingCalendarOwnerType.SITE;
  const staffId = request.nextUrl.searchParams.get("staffId") || "";

  try {
    if (ownerType === SchedulingCalendarOwnerType.STAFF) {
      const staff = await prisma.staffMember.findFirst({ where: { id: staffId, siteId }, select: { id: true } });
      if (!staff) throw new Error("Choose a valid staff member before connecting Google Calendar.");
    }

    return NextResponse.redirect(createGoogleCalendarAuthorizeUrl({ ownerId: staffId, ownerType, siteId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar connect could not start.";
    return schedulingRedirect("error", message);
  }
}
