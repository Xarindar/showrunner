import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite } from "@/lib/site";
import {
  calendarResponse,
  listFeedBookings,
  renderBookingsIcs,
  verifyCalendarFeedToken
} from "@/lib/scheduling/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId")?.trim() || "";
  const staffId = searchParams.get("staffId")?.trim() || "";
  const token = searchParams.get("token")?.trim() || "";

  if (!siteId || !token || !verifyCalendarFeedToken({ siteId, staffId: staffId || undefined, token })) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const [site, staff] = await Promise.all([
    prisma.site.findUnique({
      where: { id: siteId },
      include: { settings: true }
    }),
    staffId ? prisma.staffMember.findFirst({ where: { id: staffId, siteId }, select: { name: true } }) : null
  ]);

  if (!site || (staffId && !staff)) {
    return new Response("Calendar feed not found.", { status: 404 });
  }
  const settings = await getSiteSettingsForSite(site.id);
  if (!settings.enabledModuleIds.includes("scheduling")) {
    return new Response("Calendar feed not found.", { status: 404 });
  }

  const bookings = await listFeedBookings({ siteId, staffId: staffId || undefined });
  const calendarName = staff?.name
    ? `${settings.businessName || site.name} - ${staff.name}`
    : `${settings.businessName || site.name} appointments`;

  return calendarResponse(renderBookingsIcs({ bookings, calendarName }), staff?.name ? "staff-bookings.ics" : "site-bookings.ics", "inline");
}
