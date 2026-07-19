import { prisma } from "@/lib/prisma";
import {
  addDaysToDateKey,
  getTodayDateKey,
  getZonedDateKey,
  parseZonedDateKey
} from "@/lib/timezone";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { RevenueTrendsChart, type RevenueTrendWeek } from "./revenue-trends-chart";

const visibleWeekCount = 52;
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDaysToDateKey(dateKey, -((weekday + 6) % 7));
}

function utcDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function weekLabel(startKey: string) {
  const start = utcDateFromKey(startKey);
  const end = utcDateFromKey(addDaysToDateKey(startKey, 6));
  const startMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  return startMonth === endMonth ? `${startMonth} ${startDay} – ${endDay}` : `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

function sampleWeeks(): RevenueTrendWeek[] {
  return [
    [62000, 84000, 51000, 116000, 98000, 144000, 72000],
    [78000, 93000, 126000, 88000, 164000, 191000, 105000],
    [112000, 86000, 147000, 121000, 178000, 204000, 94000]
  ].map((days, index) => ({
    days: days.map((cents, dayIndex) => ({ cents, label: weekdayLabels[dayIndex] })),
    label: ["Jun 29 – Jul 5", "Jul 6 – 12", "Jul 13 – 19"][index],
    totalCents: days.reduce((sum, cents) => sum + cents, 0)
  }));
}

export const revenueTrendsWidget = {
  defaultSize: "lg",
  description: "Daily revenue by week, with controls to move through recent weeks.",
  id: "products.revenue-trends",
  moduleId: "products",
  sizes: ["md", "lg"],
  title: "Revenue trends",
  async render({ preview, siteId, timezone }) {
    if (preview) return <RevenueTrendsChart currency="USD" weeks={sampleWeeks()} />;

    const currentWeekStart = mondayForDateKey(getTodayDateKey(timezone));
    const weekStarts = Array.from({ length: visibleWeekCount }, (_, index) =>
      addDaysToDateKey(currentWeekStart, (index - visibleWeekCount + 1) * 7)
    );
    const firstDay = parseZonedDateKey(weekStarts[0], timezone) || new Date();
    const orders = await prisma.order.findMany({
      orderBy: [{ placedAt: "asc" }, { createdAt: "asc" }],
      select: { createdAt: true, currency: true, placedAt: true, totalCents: true },
      where: {
        OR: [{ placedAt: { gte: firstDay } }, { placedAt: null, createdAt: { gte: firstDay } }],
        siteId,
        status: { in: ["PAID", "FULFILLED"] }
      }
    });
    const totalsByDay = new Map<string, number>();

    for (const order of orders) {
      const dateKey = getZonedDateKey(order.placedAt || order.createdAt, timezone);
      totalsByDay.set(dateKey, (totalsByDay.get(dateKey) || 0) + order.totalCents);
    }

    const weeks = weekStarts.map((startKey) => {
      const days = weekdayLabels.map((label, index) => ({
        cents: totalsByDay.get(addDaysToDateKey(startKey, index)) || 0,
        label
      }));
      return {
        days,
        label: weekLabel(startKey),
        totalCents: days.reduce((sum, day) => sum + day.cents, 0)
      };
    });

    return <RevenueTrendsChart currency={orders.at(-1)?.currency || "USD"} weeks={weeks} />;
  }
} satisfies DashboardWidgetDefinition;
