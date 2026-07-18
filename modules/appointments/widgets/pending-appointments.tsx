import { DashboardCardList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const pendingAppointmentsWidget = {
  defaultSize: "md",
  description: "Appointment requests that need confirmation.",
  id: "appointments.pending",
  moduleId: "appointments",
  sizes: ["sm", "md", "lg"],
  title: "Pending appointments",
  async render({ siteId, size, timezone }) {
    const limit = widgetItemLimit(size);
    const [count, bookings] = await Promise.all([
      prisma.booking.count({ where: { siteId, status: "PENDING" } }),
      prisma.booking.findMany({
        include: { service: true },
        orderBy: { startsAt: "asc" },
        take: limit,
        where: { siteId, status: "PENDING" }
      })
    ]);

    return (
      <>
        <DashboardMetric detail="requests waiting for confirmation" label="Needs review" value={count} />
        {size !== "sm" ? (
          <DashboardCardList
            empty="No appointment requests need review."
            items={bookings.map((booking) => ({
              detail: booking.service.name,
              href: `/admin/appointments/${booking.id}`,
              id: booking.id,
              meta: widgetShortDateLabel(booking.startsAt, timezone),
              title: booking.customerName
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
