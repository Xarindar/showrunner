import { isRecord } from "@/lib/objects";

export function clientServiceId(preferences: unknown) {
  return isRecord(preferences) && typeof preferences.serviceId === "string" ? preferences.serviceId : "";
}
