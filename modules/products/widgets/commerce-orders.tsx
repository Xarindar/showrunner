import { DashboardKpiRow, DashboardMetric } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import type { DashboardWidgetDateRangeValue, DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";

function dateKeyFromSetting(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  return `20${match[3]}-${match[1]}-${match[2]}`;
}

function mondayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDaysToDateKey(dateKey, -((weekday + 6) % 7));
}

function dateRangeLabel(startKey: string, endKey: string) {
  const short = (key: string) => {
    const [year, month, day] = key.split("-");
    return `${month}/${day}/${year.slice(-2)}`;
  };
  return `${short(startKey)} – ${short(endKey)}`;
}

function commerceRange(value: unknown, timezone: string) {
  const todayKey = getTodayDateKey(timezone);
  const saved = value && typeof value === "object" ? (value as DashboardWidgetDateRangeValue) : null;
  const requestedStart = dateKeyFromSetting(saved?.start || "");
  const requestedEnd = dateKeyFromSetting(saved?.end || "");
  const customRange = Boolean(requestedStart && requestedEnd && requestedStart <= requestedEnd);
  const startKey = customRange ? requestedStart! : mondayForDateKey(todayKey);
  const endKey = customRange ? requestedEnd! : todayKey;

  return {
    end: parseZonedDateKey(addDaysToDateKey(endKey, 1), timezone) || new Date(),
    label: customRange ? dateRangeLabel(startKey, endKey) : "This week",
    start: parseZonedDateKey(startKey, timezone) || new Date()
  };
}

export const commerceOrdersWidget = {
  defaultSize: "md",
  description: "Revenue, placed orders, and completed fulfillment for a date range you control.",
  id: "products.orders",
  moduleId: "products",
  settings: [
    {
      defaultValue: { end: "", start: "" },
      description: "Enter both dates as MM/DD/YY. Leave both blank to use the current week.",
      id: "dateRange",
      label: "Order date range",
      type: "date-range"
    }
  ],
  sizes: ["sm", "md", "lg"],
  title: "Commerce orders",
  async render({ preview, settings, siteId, size, timezone }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="This week" label="Revenue" value="$8,420.00" />
          {size !== "sm" ? (
            <DashboardKpiRow items={[{ label: "Orders placed", value: 28 }, { label: "Fulfilled", value: 19 }]} />
          ) : null}
        </>
      );
    }

    const range = commerceRange(settings.dateRange, timezone);
    const placedWindow = {
      OR: [
        { placedAt: { gte: range.start, lt: range.end } },
        { placedAt: null, createdAt: { gte: range.start, lt: range.end } }
      ],
      siteId
    };
    const [revenue, placedOrders, fulfilledOrders, currencyOrder] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { ...placedWindow, status: { in: ["PAID", "FULFILLED"] } }
      }),
      prisma.order.count({
        where: { ...placedWindow, status: { not: "DRAFT" } }
      }),
      prisma.order.count({
        where: { siteId, fulfilledAt: { gte: range.start, lt: range.end } }
      }),
      prisma.order.findFirst({
        orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
        select: { currency: true },
        where: { ...placedWindow, status: { in: ["PAID", "FULFILLED"] } }
      })
    ]);

    return (
      <>
        <DashboardMetric
          detail={size === "sm" ? `${range.label} · ${placedOrders} placed · ${fulfilledOrders} fulfilled` : range.label}
          label="Revenue"
          value={formatMoney(revenue._sum.totalCents || 0, currencyOrder?.currency || "USD")}
        />
        {size !== "sm" ? (
          <DashboardKpiRow items={[{ label: "Orders placed", value: placedOrders }, { label: "Fulfilled", value: fulfilledOrders }]} />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
