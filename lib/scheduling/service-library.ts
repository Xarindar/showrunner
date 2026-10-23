import { z } from "zod";
import { sessionOfferingSchema, type SessionOffering } from "./session-offering";
import { pricingTypeSchema } from "./pricing";
import { sessionPrice } from "./session-input";

export const serviceLibraryItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Enter a service name.").max(120),
  description: z.string().trim().max(2000),
  category: z.string().trim().max(120),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  pricingType: pricingTypeSchema.default("FLAT_RATE"),
  priceCents: z.number().int().min(0).max(999999999).nullable().default(null),
  hourlyRateId: z.string().min(1).max(100).nullable().default(null)
});

export type ServiceLibraryItem = z.infer<typeof serviceLibraryItemSchema>;

export const serviceLibraryInputSchema = serviceLibraryItemSchema.omit({ id: true, tags: true, priceCents: true, hourlyRateId: true }).extend({
  id: serviceLibraryItemSchema.shape.id.optional(),
  tags: z.string().max(1500).transform(value => [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))])
    .pipe(serviceLibraryItemSchema.shape.tags),
  price: z.union([z.literal("").transform(() => null), sessionPrice]).default(null),
  hourlyRateId: z.string().max(100).default("")
}).refine(value => value.pricingType !== "HOURLY" || Boolean(value.hourlyRateId), { message: "Choose an hourly rate.", path: ["hourlyRateId"] })
  .transform(({ price, hourlyRateId, ...value }) => ({ ...value, priceCents: value.pricingType === "FLAT_RATE" ? price : null, hourlyRateId: value.pricingType === "HOURLY" ? hourlyRateId : null }));

export type ServiceLibraryResults = {
  items: ServiceLibraryItem[];
  categories: string[];
  tags: string[];
  page: number;
  pageCount: number;
  total: number;
};

export function resolveIncludedServices(offering: SessionOffering, library: ServiceLibraryItem[]): SessionOffering {
  return sessionOfferingSchema.parse({ ...offering, coverageItems: offering.coverageItems.map(item => {
    const saved = item.libraryItemId
      ? library.find(row => row.id === item.libraryItemId)
      : library.find(row => row.name.toLowerCase() === item.name.trim().toLowerCase());
    if (!saved && item.libraryItemId) throw new Error("A selected library service is no longer available. Remove it and choose another.");
    return saved ? { ...saved, id: item.id, libraryItemId: saved.id } : item;
  }) });
}
