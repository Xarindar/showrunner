import { Check } from "lucide-react";
import { DashboardMetric, DashboardTimeline } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getZonedDayBounds } from "@/lib/timezone";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetTimeLabel } from "@/shell/dashboard-widget-utils";

export const todaysAppointmentsWidget = {
  defaultSize: "lg",
  description: "The day's appointment queue with more detail at larger sizes.",
  id: "appointments.today",
  moduleId: "appointments",
  sizes: ["sm", "md", "lg"],
  title: "Today's appointments",
  async render({ siteId, size, timezone }) {
    const { start, end } = getZonedDayBounds(new Date(), timezone);
    const limit = widgetItemLimit(size);
    const [count, pendingCount, bookings] = await Promise.all([
      prisma.booking.count({
        where: {
          siteId,
          startsAt: { gte: start, lt: end },
          status: { not: "CANCELED" }
        }
      }),
      prisma.booking.count({
        where: {
          siteId,
          startsAt: { gte: start, lt: end },
          status: "PENDING"
        }
      }),
      prisma.booking.findMany({
        include: { service: true, staff: true },
        orderBy: { startsAt: "asc" },
        take: limit,
        where: {
          siteId,
          startsAt: { gte: start, lt: end },
          status: { not: "CANCELED" }
        }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${pendingCount} pending`} label="Appointments today" value={count} />
        {size === "lg" && !bookings.length ? (
          <div className="dashboard-widget-empty-focus">
            <span aria-hidden="true">
              <Check size={18} />
            </span>
            <strong>Today is clear</strong>
            <small>No appointments are scheduled.</small>
          </div>
        ) : size !== "sm" ? (
          <DashboardTimeline
            empty="No appointments are scheduled for today."
            items={bookings.map((booking) => ({
              detail: booking.service.name,
              href: `/admin/appointments/${booking.id}`,
              id: booking.id,
              time: widgetTimeLabel(booking.startsAt, timezone),
              title: booking.customerName
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
