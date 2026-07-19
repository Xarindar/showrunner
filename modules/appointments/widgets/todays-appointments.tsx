import { Check } from "lucide-react";
import { DashboardIdentityList, DashboardMetric } from "@/components/ui";
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
  async render({ preview, siteId, size, timezone }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="1 pending" label="Appointments today" value={4} />
          {size !== "sm" ? (
            <DashboardIdentityList
              empty=""
              items={[
                { detail: "Maya Chen", id: "preview-1", meta: "9:00 AM", title: "Portrait session" },
                { detail: "Jordan Lee", id: "preview-2", meta: "11:30 AM", title: "Consultation" },
                { detail: "The Martins", id: "preview-3", meta: "2:00 PM", title: "Family session" }
              ]}
              showAvatar={false}
            />
          ) : null}
        </>
      );
    }

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
          <DashboardIdentityList
            empty="No appointments are scheduled for today."
            items={bookings.map((booking) => ({
              detail: booking.customerName,
              href: `/admin/appointments/${booking.id}`,
              id: booking.id,
              meta: widgetTimeLabel(booking.startsAt, timezone),
              title: booking.service.name
            }))}
            showAvatar={false}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
