const defaultAnalyticsRetentionDays = 365;

export function normalizeAnalyticsRetentionDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return defaultAnalyticsRetentionDays;
  return Math.min(3650, Math.max(30, Math.trunc(value ?? defaultAnalyticsRetentionDays)));
}
