export const dashboardCardSizes = ["sm", "md", "lg"] as const;
export type DashboardCardSize = (typeof dashboardCardSizes)[number];

export const dashboardLayoutColumns = 12;
export const dashboardCardMinColumns = 4;
export const dashboardCardMaxColumns = dashboardLayoutColumns;
export const dashboardCardMinRows = 4;
export const dashboardCardMaxRows = 14;
export const dashboardCardGridRowHeight = 40;

export type DashboardCardLayout = {
  columns: number;
  rows: number;
};

export const dashboardCardLayoutDefaults = {
  sm: { columns: 4, rows: 4 },
  md: { columns: 6, rows: 6 },
  lg: { columns: 12, rows: 8 }
} satisfies Record<DashboardCardSize, DashboardCardLayout>;

export function clampDashboardCardColumns(value: number, minimum = dashboardCardMinColumns) {
  return Math.min(dashboardCardMaxColumns, Math.max(minimum, Math.round(value)));
}

export function clampDashboardCardRows(value: number, minimum = dashboardCardMinRows) {
  return Math.min(dashboardCardMaxRows, Math.max(minimum, Math.round(value)));
}

export function normalizeDashboardCardColumns(
  value: unknown,
  fallback = dashboardCardLayoutDefaults.md.columns,
  minimum = dashboardCardMinColumns
) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return clampDashboardCardColumns(Number.isFinite(parsed) ? parsed : fallback, minimum);
}

export function normalizeDashboardCardRows(
  value: unknown,
  fallback = dashboardCardLayoutDefaults.md.rows,
  minimum = dashboardCardMinRows
) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return clampDashboardCardRows(Number.isFinite(parsed) ? parsed : fallback, minimum);
}

export function getDashboardCardLayoutDefaults(size: DashboardCardSize): DashboardCardLayout {
  return dashboardCardLayoutDefaults[size];
}

export function getDashboardCardMinimumLayout(sizes: readonly DashboardCardSize[]): DashboardCardLayout {
  const minimumSize = dashboardCardSizes.find((size) => sizes.includes(size)) || "md";
  return getDashboardCardLayoutDefaults(minimumSize);
}

export function dashboardCardSizeFromLayout(columns: number, rows: number): DashboardCardSize {
  if (rows <= 5) return "sm";
  if (columns >= 9 && rows >= 8) return "lg";
  return "md";
}
