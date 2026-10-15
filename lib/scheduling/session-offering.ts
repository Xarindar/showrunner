import { z } from "zod";
import { sessionPrice } from "./session-input";

const itemId = z.string().min(1).max(100);
const itemName = z.string().trim().min(1, "Give each item and tier a name.").max(120);
const coverageItem = z.object({ id: itemId, name: itemName });
const tier = z.object({
  id: itemId,
  name: itemName,
  durationMinutes: z.number().int().min(1).max(1440),
  priceCents: z.number().int().min(0).max(999999999).nullable(),
  coverageIds: z.array(itemId).max(100)
});
const addOn = z.object({ id: itemId, name: itemName, priceCents: z.number().int().min(0).max(999999999) });

export const sessionOfferingSchema = z.object({
  coverageItems: z.array(coverageItem).max(100),
  tiers: z.array(tier).min(1, "Keep at least one package.").max(10, "Use up to 10 tiers."),
  addOns: z.array(addOn).max(50)
}).superRefine((value, ctx) => {
  for (const items of [value.coverageItems, value.tiers, value.addOns]) {
    if (new Set(items.map(item => item.id)).size !== items.length || new Set(items.map(item => item.name.toLowerCase())).size !== items.length) {
      ctx.addIssue({ code: "custom", message: "Use different names for each coverage item, tier, and extra." });
    }
  }
  const ids = new Set(value.coverageItems.map(item => item.id));
  for (const tier of value.tiers) {
    if (new Set(tier.coverageIds).size !== tier.coverageIds.length || tier.coverageIds.some(id => !ids.has(id))) {
      ctx.addIssue({ code: "custom", message: "Choose coverage items from this session type." });
    }
    if (value.tiers.length > 1 && tier.priceCents === null) {
      ctx.addIssue({ code: "custom", message: "Set a price for every tier." });
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

export const sessionOfferingFormSchema = z.string().max(100000).transform((value, ctx) => {
  try { return JSON.parse(value) as unknown; }
  catch { ctx.addIssue({ code: "custom", message: "The package details could not be read. Please try again." }); return z.NEVER; }
}).pipe(draftSchema);

export function readSessionOffering(value: unknown): SessionOffering | null {
  if (value == null) return null;
  return sessionOfferingSchema.parse(value);
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

export const weddingCoverageSuggestions = ["Getting ready", "First look", "Ceremony", "Family & couple portraits", "Reception"];

export const sessionPackageSnapshotSchema = z.object({
  tierId: itemId,
  name: itemName,
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative().nullable(),
  coverage: z.array(z.string()),
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
  if (extras.length !== addOnIds.length) throw new Error("Choose available extras from this session type.");
  return {
    tierId: tier.id,
    name: tier.name,
    durationMinutes: tier.durationMinutes,
    priceCents: tier.priceCents == null ? null : tier.priceCents + extras.reduce((total, item) => total + item.priceCents, 0),
    coverage: offering.coverageItems.filter(item => tier.coverageIds.includes(item.id)).map(item => item.name),
    extras: extras.map(item => ({ name: item.name, priceCents: item.priceCents }))
  };
}
