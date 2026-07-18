import { DashboardKpiRow, DashboardMetric, DashboardSparkline } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetWeekdayLabel } from "@/shell/dashboard-widget-utils";

export const analyticsActivityWidget = {
  defaultSize: "lg",
  description: "Standard analytics activity trend for the last seven days.",
  id: "analytics.activity",
  moduleId: "analytics",
  sizes: ["sm", "md", "lg"],
  title: "Analytics activity",
  async render({ siteId, size, timezone }) {
    const todayKey = getTodayDateKey(timezone);
    const dayKeys = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(todayKey, index - 6));
    const windows = dayKeys.map((dateKey) => {
      const start = parseZonedDateKey(dateKey, timezone) || new Date();
      const end = parseZonedDateKey(addDaysToDateKey(dateKey, 1), timezone) || new Date();
      return { end, start };
    });
    const sevenDaysAgo = windows[0]?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [eventCount, bookingCount, leadCount, dayCounts] = await Promise.all([
      prisma.analyticsEvent.count({ where: { siteId, occurredAt: { gte: sevenDaysAgo } } }),
      prisma.analyticsEvent.count({ where: { siteId, eventType: "BOOKING_COMPLETED", occurredAt: { gte: sevenDaysAgo } } }),
      prisma.analyticsEvent.count({ where: { siteId, eventType: "LEAD_SUBMITTED", occurredAt: { gte: sevenDaysAgo } } }),
      Promise.all(
        windows.map((window) =>
          prisma.analyticsEvent.count({
            where: {
              siteId,
              occurredAt: { gte: window.start, lt: window.end }
            }
          })
        )
      )
    ]);

    return (
      <>
        <DashboardMetric detail={`${bookingCount} bookings, ${leadCount} leads`} label="Events this week" value={eventCount} />
        {size === "lg" ? (
          <DashboardSparkline
            ariaLabel="Analytics events over the last seven days"
            labels={windows.map((window) => widgetWeekdayLabel(window.start, timezone))}
            points={dayCounts}
          />
        ) : size === "md" ? (
          <DashboardKpiRow
            items={[
              { label: "Bookings", value: bookingCount },
              { label: "Leads", value: leadCount },
              { label: "Daily avg", value: Math.round(eventCount / 7) }
            ]}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
