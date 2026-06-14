import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeAnalyticsRetentionDays } from "./config";

export async function analyticsRetentionDays(siteId: string) {
  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { analyticsRetentionDays: true }
  });

  return normalizeAnalyticsRetentionDays(settings?.analyticsRetentionDays);
}

export async function enforceAnalyticsRetention(siteId: string, retentionDays: number) {
  const normalizedDays = normalizeAnalyticsRetentionDays(retentionDays);
  const cutoff = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);

  await prisma.analyticsEvent.deleteMany({
    where: {
      siteId,
      occurredAt: { lt: cutoff }
    }
  });
}

export async function sweepAnalyticsRetention() {
  const sites = await prisma.siteSettings.findMany({
    select: { siteId: true, analyticsRetentionDays: true }
  });

  for (const site of sites) {
    await enforceAnalyticsRetention(site.siteId, normalizeAnalyticsRetentionDays(site.analyticsRetentionDays));
  }

  return { sitesProcessed: sites.length };
}
