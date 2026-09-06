import { emptyPayload, payloadSchema } from "./registry";
import { readStudio } from "./state";

export function resolveBusinessInfo(settings: { businessName: string; contactEmail: string; timezone: string; publicContentConfig: unknown }, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  const stored = readStudio(settings.publicContentConfig).blocks["business-info"]?.payload;
  return { ...emptyPayload("business"), ...defaults, ...stored, businessName: settings.businessName, email: settings.contactEmail, timezone: settings.timezone };
}
export function businessInfoExtensions(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !["businessName", "email", "timezone"].includes(key)));
}
export function validateBusinessInfo(payload: Record<string, unknown>) {
  payloadSchema("business").parse(payload);
  if (!String(payload.businessName).trim()) throw new Error("Business name is required");
  try { new Intl.DateTimeFormat("en", { timeZone: String(payload.timezone) }); } catch { throw new Error("Enter a valid timezone"); }
  validateHours(payload.hours as Hours);
  for (const location of payload.locations as Record<string, unknown>[]) validateHours(location.hours as Hours);
}
type Hours = { day: string; opens: string; closes: string }[];
function validateHours(hours: Hours) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const row of hours) {
    if (!days.includes(row.day.toLowerCase()) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.opens) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.closes) || row.opens >= row.closes) throw new Error("Hours need a weekday and opening/closing times in HH:mm order. Omitted days are closed.");
    if (hours.some(other => other !== row && other.day.toLowerCase() === row.day.toLowerCase() && other.opens < row.closes && other.closes > row.opens)) throw new Error("Business hours cannot overlap");
  }
}
export function resolveBusinessLocation(business: Record<string, unknown>, locationId: string) {
  if (!locationId) return business;
  const location = (business.locations as Record<string, unknown>[]).find(item => item.id === locationId);
  if (!location) throw new Error("Unknown business location");
  return { ...business, ...location, phone: location.overridePhone ? location.phone : business.phone, email: location.overrideEmail ? location.email : business.email, hours: location.overrideHours ? location.hours : business.hours };
}
