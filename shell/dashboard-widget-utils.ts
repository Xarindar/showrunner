import type { DashboardCardSize } from "@/shell/dashboard-layout";

export function widgetItemLimit(size: DashboardCardSize) {
  if (size === "sm") return 1;
  if (size === "md") return 3;
  return 5;
}

export function widgetTimeLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(value);
}

export function widgetShortDateLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: timezone
  }).format(value);
}

export function widgetWeekdayLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short"
  }).format(value);
}
