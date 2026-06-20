export const dashboardCardSizes = ["sm", "md", "lg"] as const;
export type DashboardCardSize = (typeof dashboardCardSizes)[number];

export const dashboardLayoutColumns = 12;
export const dashboardCardMinColumns = 3;
export const dashboardCardMaxColumns = dashboardLayoutColumns;
export const dashboardCardMinRows = 4;
export const dashboardCardMaxRows = 14;
export const dashboardCardGridRowHeight = 32;

export type DashboardCardLayout = {
  columns: number;
  rows: number;
};

export const dashboardCardLayoutDefaults = {
  sm: { columns: 4, rows: 5 },
  md: { columns: 6, rows: 6 },
  lg: { columns: 12, rows: 8 }
} satisfies Record<DashboardCardSize, DashboardCardLayout>;

export function clampDashboardCardColumns(value: number) {
  return Math.min(dashboardCardMaxColumns, Math.max(dashboardCardMinColumns, Math.round(value)));
}

export function clampDashboardCardRows(value: number) {
  return Math.min(dashboardCardMaxRows, Math.max(dashboardCardMinRows, Math.round(value)));
}

export function normalizeDashboardCardColumns(value: unknown, fallback = dashboardCardLayoutDefaults.md.columns) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? clampDashboardCardColumns(parsed) : fallback;
}

export function normalizeDashboardCardRows(value: unknown, fallback = dashboardCardLayoutDefaults.md.rows) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? clampDashboardCardRows(parsed) : fallback;
}

export function getDashboardCardLayoutDefaults(size: DashboardCardSize): DashboardCardLayout {
  return dashboardCardLayoutDefaults[size];
}

export function dashboardCardSizeFromLayout(columns: number, rows: number): DashboardCardSize {
  if (columns >= 9 || rows >= 8) return "lg";
  if (columns <= 4 && rows <= 5) return "sm";
  return "md";
}
