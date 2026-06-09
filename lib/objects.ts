export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
