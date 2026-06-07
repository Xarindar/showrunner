import { NextResponse } from "next/server";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateKey } from "@/lib/timezone";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");

  if (!serviceId || !date) {
    return NextResponse.json({ slots: [] });
  }

  const settings = await getSiteSettings();
  const day = parseZonedDateKey(date, settings.timezone);
  if (!day) {
    return NextResponse.json({ slots: [] });
  }

  const slots = await nativeSchedulingAdapter.getAvailableSlots(serviceId, day);

  return NextResponse.json({
    slots: slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      label: slot.label
    }))
  });
}
