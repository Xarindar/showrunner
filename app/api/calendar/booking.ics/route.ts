import {
  calendarResponse,
  findCalendarBooking,
  renderBookingsIcs,
  verifyBookingCalendarToken
} from "@/lib/scheduling/calendar";
import { getSiteSettingsForSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get("bookingId")?.trim() || "";
  const token = searchParams.get("token")?.trim() || "";

  if (!bookingId || !token) {
    return new Response("Calendar file not found.", { status: 404 });
  }

  const booking = await findCalendarBooking(bookingId);
  if (!booking) {
    return new Response("Calendar file not found.", { status: 404 });
  }

  if (!verifyBookingCalendarToken({ bookingId: booking.id, siteId: booking.siteId, token })) {
    return new Response("Unauthorized.", { status: 401 });
  }
  const settings = await getSiteSettingsForSite(booking.siteId);
  if (!settings.enabledModuleIds.includes("scheduling")) {
    return new Response("Calendar file not found.", { status: 404 });
  }

  return calendarResponse(
    renderBookingsIcs({ bookings: [booking], calendarName: `${booking.service.name} appointment` }),
    `booking-${booking.id}.ics`
  );
}
