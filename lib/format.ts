export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatDateTime(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
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
