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
  settings: [
    { defaultValue: true, description: "Show the seven-day activity chart.", id: "showTrend", label: "Activity trend" },
    { defaultValue: true, description: "Include completed bookings.", id: "showBookings", label: "Bookings" },
    { defaultValue: true, description: "Include submitted leads.", id: "showLeads", label: "Leads" },
    { defaultValue: true, description: "Include the average events per day.", id: "showDailyAverage", label: "Daily average" }
  ],
  sizes: ["sm", "md", "lg"],
  title: "Analytics activity",
  async render({ preview, settings, siteId, size, timezone }) {
    const showTrend = settings.showTrend !== false;
    const showBookings = settings.showBookings !== false;
    const showLeads = settings.showLeads !== false;
    const showDailyAverage = settings.showDailyAverage !== false;

    if (preview) {
      const previewDetail = [
        showBookings ? "12 bookings" : null,
        showLeads ? "24 leads" : null,
        showDailyAverage ? "61 daily avg" : null
      ]
        .filter(Boolean)
        .join(", ");
      const previewKpis = [
        showBookings ? { label: "Bookings", value: 12 } : null,
        showLeads ? { label: "Leads", value: 24 } : null,
        showDailyAverage ? { label: "Daily avg", value: 61 } : null
      ].filter((item): item is { label: string; value: number } => Boolean(item));

      return (
        <>
          <DashboardMetric detail={previewDetail || "Last seven days"} label="Events this week" value={428} />
          {size === "lg" && showTrend ? (
            <DashboardSparkline
              ariaLabel="Sample analytics events over seven days"
              labels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
              points={[34, 52, 41, 68, 57, 82, 94]}
            />
          ) : size !== "sm" && previewKpis.length ? (
            <DashboardKpiRow items={previewKpis} />
          ) : null}
        </>
      );
    }

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
    const dailyAverage = Math.round(eventCount / 7);
    const metricDetail = [
      showBookings ? `${bookingCount} bookings` : null,
      showLeads ? `${leadCount} leads` : null,
      showDailyAverage ? `${dailyAverage} daily avg` : null
    ]
      .filter(Boolean)
      .join(", ");
    const kpis = [
      showBookings ? { label: "Bookings", value: bookingCount } : null,
      showLeads ? { label: "Leads", value: leadCount } : null,
      showDailyAverage ? { label: "Daily avg", value: dailyAverage } : null
    ].filter((item): item is { label: string; value: number } => Boolean(item));

    return (
      <>
        <DashboardMetric detail={metricDetail || "Last seven days"} label="Events this week" value={eventCount} />
        {size === "lg" && showTrend ? (
          <DashboardSparkline
            ariaLabel="Analytics events over the last seven days"
            labels={windows.map((window) => widgetWeekdayLabel(window.start, timezone))}
            points={dayCounts}
          />
        ) : size !== "sm" && kpis.length ? (
          <DashboardKpiRow items={kpis} />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
