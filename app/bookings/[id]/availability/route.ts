import { NextRequest, NextResponse } from "next/server";
import { verifyBookingSelfServiceToken } from "@/lib/bookings/self-service";
import { prisma } from "@/lib/prisma";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateKey } from "@/lib/timezone";

type BookingAvailabilityRouteProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: BookingAvailabilityRouteProps) {
  const { id } = await params;
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("scheduling")) {
    return NextResponse.json({ slots: [] }, { status: 404 });
  }

  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const date = request.nextUrl.searchParams.get("date")?.trim() || "";
  if (!token || !date) {
    return NextResponse.json({ slots: [] }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id, siteId: settings.siteId },
    select: {
      customerEmail: true,
      id: true,
      serviceId: true,
      siteId: true,
      staffId: true
    }
  });

  if (
    !booking ||
    !verifyBookingSelfServiceToken({
      bookingId: booking.id,
      customerEmail: booking.customerEmail,
      siteId: booking.siteId,
      token
    })
  ) {
    return NextResponse.json({ slots: [] }, { status: 401 });
  }

  const day = parseZonedDateKey(date, settings.timezone);
  if (!day) {
    return NextResponse.json({ slots: [] }, { status: 400 });
  }

  const slots = await nativeSchedulingAdapter.getAvailableSlots(booking.serviceId, day, {
    excludeBookingId: booking.id,
    staffId: booking.staffId || undefined
  });

  return NextResponse.json({
    slots: slots.map((slot) => ({
      endsAt: slot.endsAt.toISOString(),
      label: slot.label,
      resourceIds: slot.resourceIds,
      resourceNames: slot.resourceNames,
      staffId: slot.staffId || "",
      staffName: slot.staffName || "",
      startsAt: slot.startsAt.toISOString()
    }))
  });
}
