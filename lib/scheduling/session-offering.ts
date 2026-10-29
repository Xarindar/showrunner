import { z } from "zod";
import { sessionPrice } from "./session-input";
import { hourlyPriceCents, pricingTypeSchema, type HourlyRate, type PricingType } from "./pricing";

const itemId = z.string().min(1).max(100);
const itemName = z.string().trim().min(1, "Give each included item, package, and extra a name.").max(120);
const coverageItem = z.object({
  id: itemId, name: itemName,
  libraryItemId: itemId.optional(),
  pricingType: pricingTypeSchema.optional(),
  priceCents: z.number().int().min(0).max(999999999).nullable().optional(),
  hourlyRateId: itemId.nullable().optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional()
});
const tier = z.object({
  id: itemId,
  name: itemName,
  durationMinutes: z.number().int().min(1).max(1440),
  priceCents: z.number().int().min(0).max(999999999).nullable(),
  pricingType: pricingTypeSchema.optional(),
  hourlyRateId: itemId.nullable().optional(),
  coverageIds: z.array(itemId).max(100)
});
const addOn = z.object({ id: itemId, name: itemName, priceCents: z.number().int().min(0).max(999999999) });

export const sessionOfferingSchema = z.object({
  coverageItems: z.array(coverageItem).max(100),
  tiers: z.array(tier).min(1, "Keep at least one package.").max(10, "Use up to 10 packages."),
  addOns: z.array(addOn).max(50)
}).superRefine((value, ctx) => {
  for (const items of [value.coverageItems, value.tiers, value.addOns]) {
    if (new Set(items.map(item => item.id)).size !== items.length || new Set(items.map(item => item.name.toLowerCase())).size !== items.length) {
      ctx.addIssue({ code: "custom", message: "Use different names for each included item, package, and extra." });
    }
  }
  const ids = new Set(value.coverageItems.map(item => item.id));
  const linkedIds = value.coverageItems.flatMap(item => item.libraryItemId ? [item.libraryItemId] : []);
  if (new Set(linkedIds).size !== linkedIds.length) ctx.addIssue({ code: "custom", message: "Add each library service only once." });
  for (const tier of value.tiers) {
    if (new Set(tier.coverageIds).size !== tier.coverageIds.length || tier.coverageIds.some(id => !ids.has(id))) {
      ctx.addIssue({ code: "custom", message: "Choose included items from this session type." });
    }
    if (value.tiers.length > 1 && tier.priceCents === null) {
      ctx.addIssue({ code: "custom", message: "Set a price for every package." });
    }
  }
});

export type SessionOffering = z.infer<typeof sessionOfferingSchema>;
export type SessionOfferingDraft = {
  coverageItems: SessionOffering["coverageItems"];
  tiers: Array<Omit<SessionOffering["tiers"][number], "priceCents" | "durationMinutes"> & { price: string; durationMinutes: string }>;
  addOns: Array<Omit<SessionOffering["addOns"][number], "priceCents"> & { price: string }>;
};

const draftSchema = z.object({
  coverageItems: z.array(coverageItem).max(100),
  tiers: z.array(tier.omit({ priceCents: true }).extend({
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    price: z.union([z.literal("").transform(() => null), sessionPrice])
  }).transform(({ price, ...value }) => ({ ...value, priceCents: price }))).min(1).max(10),
  addOns: z.array(addOn.omit({ priceCents: true }).extend({ price: sessionPrice })
    .transform(({ price, ...value }) => ({ ...value, priceCents: price }))).max(50)
}).pipe(sessionOfferingSchema);

export const sessionOfferingFormSchema = z.string().max(600000).transform((value, ctx) => {
  try { return JSON.parse(value) as unknown; }
  catch { ctx.addIssue({ code: "custom", message: "The package details could not be read. Please try again." }); return z.NEVER; }
}).pipe(draftSchema);

export function readSessionOffering(value: unknown): SessionOffering | null {
  if (value == null) return null;
  return sessionOfferingSchema.parse(value);
}

export function priceSessionOffering(offering: SessionOffering, rates: HourlyRate[], fallback: { pricingType: PricingType; hourlyRateId: string }) {
  return { ...offering, tiers: offering.tiers.map(tier => {
    const pricingType = tier.pricingType ?? fallback.pricingType;
    if (pricingType === "FLAT_RATE") return { ...tier, pricingType, hourlyRateId: null };
    const hourlyRateId = tier.pricingType ? tier.hourlyRateId : fallback.hourlyRateId;
    const rate = rates.find(rate => rate.id === hourlyRateId);
    if (!rate) throw new Error("Choose an hourly rate from this business for each hourly package.");
    return { ...tier, pricingType, hourlyRateId: rate.id, priceCents: hourlyPriceCents(rate.amountCents, tier.durationMinutes) };
  }) };
}

export function sessionOfferingDraft(value: SessionOffering | null, durationMinutes: number, priceCents: number | null): SessionOfferingDraft {
  const offering = value ?? { coverageItems: [], tiers: [{ id: "standard", name: "Standard", durationMinutes, priceCents, coverageIds: [] }], addOns: [] };
  const price = (cents: number | null) => cents == null ? "" : (cents / 100).toFixed(2);
  return {
    coverageItems: offering.coverageItems,
    tiers: offering.tiers.map(({ priceCents, durationMinutes, ...tier }) => ({ ...tier, price: price(priceCents), durationMinutes: String(durationMinutes) })),
    addOns: offering.addOns.map(({ priceCents, ...item }) => ({ ...item, price: price(priceCents) }))
  };
}

export const sessionPackageSnapshotSchema = z.object({
  tierId: itemId,
  name: itemName,
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative().nullable(),
  pricingType: pricingTypeSchema.optional(),
  hourlyRate: z.object({ id: itemId, name: itemName, amountCents: z.number().int().nonnegative() }).optional(),
  coverage: z.array(z.string()),
  includedItems: z.array(coverageItem.omit({ id: true, libraryItemId: true, category: true, tags: true }).extend({ description: z.string().max(2000) })).max(100).optional(),
  extras: z.array(z.object({ name: itemName, priceCents: z.number().int().nonnegative() }))
});

export function selectSessionPackage(value: unknown, tierId?: string, addOnIds: string[] = []) {
  const offering = readSessionOffering(value);
  if (!offering) {
    if (tierId || addOnIds.length) throw new Error("Choose a package from this session type.");
    return null;
  }
  const tier = offering.tiers.find(item => item.id === tierId);
  if (!tier) throw new Error("Choose a package from this session type.");
  const extras = offering.addOns.filter(item => addOnIds.includes(item.id));
  const included = offering.coverageItems.filter(item => tier.coverageIds.includes(item.id));
  if (extras.length !== addOnIds.length) throw new Error("Choose available extras from this session type.");
  return {
    tierId: tier.id,
    name: tier.name,
    durationMinutes: tier.durationMinutes,
    priceCents: tier.priceCents == null ? null : tier.priceCents + extras.reduce((total, item) => total + item.priceCents, 0),
    coverage: included.map(item => item.name),
    ...(included.some(item => item.description !== undefined || item.pricingType !== undefined) ? { includedItems: included.map(item => ({ name: item.name, description: item.description || "", ...(item.pricingType ? { pricingType: item.pricingType, priceCents: item.priceCents, hourlyRateId: item.hourlyRateId } : {}) })) } : {}),
    extras: extras.map(item => ({ name: item.name, priceCents: item.priceCents }))
  };
}
