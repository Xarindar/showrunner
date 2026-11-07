import { z } from "zod";
import { sessionOfferingSchema, type SessionOffering } from "./session-offering";
import { addOnPricingTypeSchema } from "./pricing";
import { sessionPrice } from "./session-input";

export const serviceLibraryItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Enter a service name.").max(120),
  description: z.string().trim().max(2000),
  category: z.string().trim().max(120),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  pricingType: addOnPricingTypeSchema.default("FLAT_RATE"),
  priceCents: z.number().int().min(0).max(999999999).nullable().default(null),
  hourlyRateId: z.string().min(1).max(100).nullable().default(null)
});

export type ServiceLibraryItem = z.infer<typeof serviceLibraryItemSchema>;

export const serviceLibraryInputSchema = z.preprocess(input => {
  if (typeof input === "object" && input !== null && "availableAsAddOn" in input && input.availableAsAddOn === false) return { ...input, pricingType: "FLAT_RATE", price: "", hourlyRateId: "" };
  return input;
}, serviceLibraryItemSchema.omit({ id: true, tags: true, priceCents: true, hourlyRateId: true }).extend({
  id: serviceLibraryItemSchema.shape.id.optional(),
  availableAsAddOn: z.boolean().optional(),
  tags: z.string().max(1500).transform(value => [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))])
    .pipe(serviceLibraryItemSchema.shape.tags),
  price: z.union([z.literal("").transform(() => null), sessionPrice]).default(null),
  hourlyRateId: z.string().max(100).default("")
}).superRefine((value, ctx) => {
  if (value.availableAsAddOn === false) return;
  if (value.pricingType === "HOURLY" && !value.hourlyRateId) ctx.addIssue({ code: "custom", message: "Choose an hourly rate.", path: ["hourlyRateId"] });
  if (value.availableAsAddOn === true && value.pricingType !== "HOURLY" && value.price === null) ctx.addIssue({ code: "custom", message: "Enter an add-on price, or turn off Available as an add-on.", path: ["price"] });
}).transform(({ price, hourlyRateId, availableAsAddOn, ...value }) => availableAsAddOn === false
  ? { ...value, pricingType: "FLAT_RATE" as const, priceCents: null, hourlyRateId: null }
  : { ...value, priceCents: value.pricingType !== "HOURLY" ? price : null, hourlyRateId: value.pricingType === "HOURLY" ? hourlyRateId : null }));

export function isServiceAddOn(item: { pricingType?: string; priceCents?: number | null; hourlyRateId?: string | null }) {
  return item.pricingType === "HOURLY" ? Boolean(item.hourlyRateId) : item.priceCents != null;
}

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
  }), addOns: offering.addOns.map(item => {
    if (!item.libraryItemId) return item;
    const saved = library.find(row => row.id === item.libraryItemId);
    if (!saved) throw new Error("An optional service is no longer available. Remove it and choose another.");
    if (!isServiceAddOn(saved)) throw new Error(`"${saved.name}" is no longer available as an add-on. Remove it from Suggested Add-Ons.`);
    return { ...item, name: saved.name, priceCents: saved.priceCents ?? 0, pricingType: saved.pricingType, hourlyRateId: saved.hourlyRateId };
  }) });
}
