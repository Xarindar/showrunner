"use server";

import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { bookingRuleSetSchema, bookingRulesSchema, type BookingRuleSet } from "@/lib/scheduling/booking-rules";

export async function listBookingRuleSets(): Promise<BookingRuleSet[]> {
  await requireAdmin("scheduling:manage");
  const { siteId } = await getSiteSettings();
  const sets = await prisma.bookingRuleSet.findMany({ where: { siteId }, orderBy: { name: "asc" } });
  return sets.map(set => ({ id: set.id, name: set.name, rules: bookingRulesSchema.parse(set.rules) }));
}

export async function saveBookingRuleSet(input: unknown): Promise<{ set?: BookingRuleSet; error?: string }> {
  await requireAdmin("scheduling:manage");
  const parsed = bookingRuleSetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { siteId } = await getSiteSettings();
  try {
    const set = await prisma.bookingRuleSet.create({ data: { siteId, kind: parsed.data.rules.every(rule=>rule.kind === "policy") ? "TERMS" : "INTAKE", name: parsed.data.name, nameKey: parsed.data.name.toLowerCase(), rules: parsed.data.rules } });
    return { set: { id: set.id, name: set.name, rules: parsed.data.rules } };
  } catch (error) {
    return { error: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "A rule set with that name already exists." : "The rule set could not be saved. Your rules are still here; please try again." };
  }
}
