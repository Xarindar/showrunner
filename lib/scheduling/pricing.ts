import { z } from "zod";
import { sessionPrice } from "./session-input";

export const pricingTypeSchema = z.enum(["FLAT_RATE", "HOURLY"]);
export type PricingType = z.infer<typeof pricingTypeSchema>;
export type HourlyRate = { id: string; name: string; amountCents: number };
export const hourlyRateInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1, "Enter a rate name.").max(120),
  amount: sessionPrice
});

export function hourlyPriceCents(amountCents: number, durationMinutes: number) {
  const total = Math.round(amountCents * durationMinutes / 60);
  if (!Number.isInteger(amountCents) || amountCents < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 || total > 999999999) {
    throw new Error("The hourly rate and duration must produce a price of $9,999,999.99 or less.");
  }
  return total;
}

export function servicePriceCents(service: { pricingType?: string; priceCents: number | null; durationMinutes: number; hourlyRate?: HourlyRate | null }) {
  if (service.pricingType !== "HOURLY") return service.priceCents;
  if (!service.hourlyRate) throw new Error("Choose an hourly rate for this service.");
  return hourlyPriceCents(service.hourlyRate.amountCents, service.durationMinutes);
}
