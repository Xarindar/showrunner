import { z } from "zod";

export const sessionPrice = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter a price with up to two decimal places.").transform(value => Math.round(Number(value) * 100));

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose valid business hours.").transform(value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));
export const initialBusinessHoursSchema = z.object({
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Choose at least one available day."),
  start: clockTime,
  end: clockTime
}).refine(value => value.end > value.start, "Business hours must end after they start.");

export const manualSessionSchema = z.object({
  serviceId: z.string().optional(),
  tierId: z.string().max(100).optional(),
  addOnIds: z.array(z.string().min(1).max(100)).max(50).default([]),
  name: z.string().trim().min(1, "Add a session name."),
  customerName: z.string().trim().min(1, "Add the client's name."),
  customerEmail: z.email("Enter a valid client email.").transform(value => value.toLowerCase()),
  customerPhone: z.string().trim().optional(),
  startsAt: z.string().min(1, "Choose a date and time."),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  price: sessionPrice,
  location: z.string().trim().max(500).default(""),
  staffId: z.string().optional(),
  notes: z.string().trim().max(5000),
  status: z.enum(["PENDING", "CONFIRMED"])
});
