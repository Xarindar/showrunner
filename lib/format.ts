export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(value);
}

export function formatTimeValue(value: string) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function parseTimeValue(value: string) {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap]m)$/i.exec(value.trim());
  if (!match) return "";
  return `${String(Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${match[2]}`;
}

export function formatDateTime(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone
  }).format(value);
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function enumLabel(value: string) {
  return value.toLowerCase().split("_").join(" ");
}

export function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function nonEmptyStringArrayFromUnknown(value: unknown) {
  return stringArrayFromUnknown(value).filter((item) => Boolean(item.trim()));
}

export function stringArrayCsv(value: unknown) {
  return stringArrayFromUnknown(value).join(", ");
}
