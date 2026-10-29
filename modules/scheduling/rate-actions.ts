"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { hourlyPriceCents, hourlyRateInputSchema, type HourlyRate } from "@/lib/scheduling/pricing";
import { readSessionOffering } from "@/lib/scheduling/session-offering";

export async function saveHourlyRateAction(input: unknown): Promise<{ rate?: HourlyRate; error?: string }> {
  await requireAdmin("scheduling:manage");
  const parsed = hourlyRateInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { siteId } = await getSiteSettings();
  const { id, name, amount } = parsed.data;
  try {
    if (id) {
      const services = await prisma.service.findMany({ where: { siteId }, select: { pricingType: true, hourlyRateId: true, durationMinutes: true, sessionOffering: true } });
      try {
        for (const service of services) {
          const inheritsRate = service.pricingType === "HOURLY" && service.hourlyRateId === id;
          if (inheritsRate) hourlyPriceCents(amount, service.durationMinutes);
          for (const tier of readSessionOffering(service.sessionOffering)?.tiers ?? []) {
            if (tier.pricingType === "HOURLY" ? tier.hourlyRateId === id : !tier.pricingType && inheritsRate) hourlyPriceCents(amount, tier.durationMinutes);
          }
        }
      } catch { return { error: "This rate would put an existing package over $9,999,999.99. Use a lower rate or shorten that package first." }; }
    }
    const rate = id
      ? await prisma.hourlyRate.update({ where: { id, siteId }, data: { name, amountCents: amount } })
      : await prisma.hourlyRate.create({ data: { siteId, name, amountCents: amount } });
    revalidatePath("/admin/modules/services", "layout");
    revalidatePath("/admin/appointments/new");
    return { rate: { id: rate.id, name: rate.name, amountCents: rate.amountCents } };
  } catch (error) {
    return { error: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "A rate with this name already exists. Use a different name."
      : "The rate could not be saved. Your details are still here; please try again." };
  }
}
