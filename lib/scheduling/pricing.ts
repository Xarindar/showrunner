import { z } from "zod";
import { optionalRecordId } from "../record-id";
import { formatMoney } from "../format";
import { sessionPrice } from "./session-input";

export const pricingTypeSchema = z.enum(["FLAT_RATE", "HOURLY"]);
export const packagePricingTypeSchema = z.enum(["FLAT_RATE", "HOURLY", "TIME_FRAME"]);
export type PackagePricingType = z.infer<typeof packagePricingTypeSchema>;
export const addOnPricingTypeSchema = z.enum(["FLAT_RATE", "HOURLY", "PER_UNIT"]);
export type AddOnPricingType = z.infer<typeof addOnPricingTypeSchema>;
export type PricingType = z.infer<typeof pricingTypeSchema>;
export type HourlyRate = { id: string; name: string; amountCents: number };
export const hourlyBookingDurationSchema = z.number().int().min(1, "Choose how long you want to book.").max(1440, "Choose a booking length of up to 24 hours.");

export function publicBookingDuration(service: { pricingType?: string; durationMinutes: number }, requested?: number) {
  if (service.pricingType === "HOURLY") return hourlyBookingDurationSchema.parse(requested);
  if (requested !== undefined && requested !== service.durationMinutes) throw new Error("This package has a fixed booking length.");
  return service.durationMinutes;
}
export const hourlyRateInputSchema = z.object({
  id: optionalRecordId,
  name: z.string().trim().min(1, "Enter a rate name.").max(120),
  amount: sessionPrice
});

export function hourlyPriceCents(amountCents: number, durationMinutes: number) {
  const total = Math.round(amountCents * durationMinutes / 60);
  if (!Number.isInteger(amountCents) || amountCents < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 2880 || total > 999999999) {
    throw new Error("The hourly rate and duration must produce a price of $9,999,999.99 or less.");
  }
  return total;
}

export function sessionCatalogPriceLabel(prices: readonly (number | null)[]) {
  const priced = prices.filter(price => price !== null);
  if (!priced.length) return "-";
  return `${formatMoney(Math.min(...priced))}${priced.length > 1 ? "+" : ""}`;
}

export function servicePriceCents(service: { pricingType?: string; priceCents: number | null; durationMinutes: number; hourlyRate?: HourlyRate | null }) {
  if (service.pricingType !== "HOURLY") return service.priceCents;
  if (!service.hourlyRate) throw new Error("Choose an hourly rate for this service.");
  return hourlyPriceCents(service.hourlyRate.amountCents, service.durationMinutes);
}
