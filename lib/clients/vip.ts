import "server-only";

import { BillingDocumentStatus, BookingStatus, OrderStatus } from "@prisma/client";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { normalizeClientVipSettings, type ClientVipSettings } from "./vip-settings";

const clientsModuleId = "clients";
const vipSettingKey = "vip";

type VipClientInput = {
  createdAt: Date;
  id: string;
};

export type ClientVipSummary = {
  qualifies: boolean;
  reasons: string[];
  tooltip: string;
};

export async function getClientVipSettings(siteId: string): Promise<ClientVipSettings> {
  const setting = await prisma.moduleSetting.findUnique({
    where: {
      siteId_moduleId_key: {
        key: vipSettingKey,
        moduleId: clientsModuleId,
        siteId
      }
    }
  });

  return normalizeClientVipSettings(setting?.value);
}

export async function saveClientVipSettings(siteId: string, value: ClientVipSettings) {
  await prisma.moduleInstallation.upsert({
    where: { siteId_moduleId: { moduleId: clientsModuleId, siteId } },
    update: { configuredAt: new Date(), installed: true },
    create: {
      configuredAt: new Date(),
      enabled: false,
      installed: true,
      moduleId: clientsModuleId,
      siteId
    }
  });

  await prisma.moduleSetting.upsert({
    where: {
      siteId_moduleId_key: {
        key: vipSettingKey,
        moduleId: clientsModuleId,
        siteId
      }
    },
    update: { value },
    create: {
      key: vipSettingKey,
      moduleId: clientsModuleId,
      siteId,
      value
    }
  });
}

function spendWindowStart(settings: ClientVipSettings, now: Date) {
  if (settings.spend.window === "12-months") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 12);
    return start;
  }

  if (settings.spend.window === "24-months") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 24);
    return start;
  }

  return null;
}

function loyaltyCutoff(settings: ClientVipSettings, now: Date) {
  const cutoff = new Date(now);
  if (settings.loyalty.unit === "years") {
    cutoff.setFullYear(cutoff.getFullYear() - settings.loyalty.length);
  } else {
    cutoff.setMonth(cutoff.getMonth() - settings.loyalty.length);
  }
  return cutoff;
}

function year(value?: Date | null) {
  return value ? value.getFullYear() : undefined;
}

function spendReason(cents: number, since?: Date | null) {
  const sinceYear = year(since);
  return `Spent ${formatMoney(cents)}${sinceYear ? ` since ${sinceYear}` : ""}`;
}

function makeEmptySummary() {
  return { qualifies: false, reasons: [], tooltip: "" } satisfies ClientVipSummary;
}

export async function getClientVipSummaries({
  clients,
  now = new Date(),
  settings,
  siteId
}: {
  clients: VipClientInput[];
  now?: Date;
  settings: ClientVipSettings;
  siteId: string;
}) {
  const summaries = new Map<string, ClientVipSummary>();
  for (const client of clients) summaries.set(client.id, makeEmptySummary());

  if (!clients.length || !settings.enabled || !settings.badgesEnabled) return summaries;

  const clientIds = clients.map((client) => client.id);
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const spendStart = spendWindowStart(settings, now);

  const [orders, documents, completedBookings] = await Promise.all([
    settings.spend.enabled && settings.paidRevenueEnabled
      ? prisma.order.findMany({
          where: {
            clientId: { in: clientIds },
            siteId,
            status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] },
            ...(spendStart
              ? {
                  OR: [{ placedAt: { gte: spendStart } }, { placedAt: null, createdAt: { gte: spendStart } }]
                }
              : {})
          },
          select: { clientId: true, createdAt: true, placedAt: true, totalCents: true }
        })
      : Promise.resolve([]),
    settings.spend.enabled && settings.paidRevenueEnabled
      ? prisma.billingDocument.findMany({
          where: {
            clientId: { in: clientIds },
            siteId,
            status: BillingDocumentStatus.PAID,
            ...(spendStart
              ? {
                  OR: [{ paidAt: { gte: spendStart } }, { paidAt: null, createdAt: { gte: spendStart } }]
                }
              : {})
          },
          select: { clientId: true, createdAt: true, paidAt: true, totalCents: true }
        })
      : Promise.resolve([]),
    settings.appointments.enabled
      ? prisma.booking.groupBy({
          by: ["clientId"],
          where: { clientId: { in: clientIds }, siteId, status: BookingStatus.COMPLETED },
          _count: { _all: true }
        })
      : Promise.resolve([])
  ]);

  const spendByClient = new Map<string, { cents: number; since: Date | null }>();
  for (const row of orders) {
    if (!row.clientId) continue;
    const current = spendByClient.get(row.clientId) || { cents: 0, since: null };
    const rowDate = row.placedAt || row.createdAt;
    spendByClient.set(row.clientId, {
      cents: current.cents + row.totalCents,
      since: !current.since || rowDate < current.since ? rowDate : current.since
    });
  }

  for (const row of documents) {
    if (!row.clientId) continue;
    const current = spendByClient.get(row.clientId) || { cents: 0, since: null };
    const rowDate = row.paidAt || row.createdAt;
    spendByClient.set(row.clientId, {
      cents: current.cents + row.totalCents,
      since: !current.since || rowDate < current.since ? rowDate : current.since
    });
  }

  for (const [clientId, summary] of summaries) {
    const client = clientById.get(clientId);
    if (!client) continue;

    const reasons: string[] = [];
    const spend = spendByClient.get(clientId);
    if (settings.spend.enabled && spend && spend.cents >= settings.spend.thresholdCents) {
      reasons.push(spendReason(spend.cents, spend.since));
    }

    const bookingCount = completedBookings.find((row) => row.clientId === clientId)?._count._all || 0;
    if (settings.appointments.enabled && bookingCount >= settings.appointments.threshold) {
      reasons.push(`Completed ${bookingCount} appointments`);
    }

    if (settings.loyalty.enabled && client.createdAt <= loyaltyCutoff(settings, now)) {
      reasons.push(`Client since ${client.createdAt.getFullYear()}`);
    }

    summary.reasons = reasons;
    summary.qualifies = reasons.length > 0;
    summary.tooltip = reasons.join(" | ");
  }

  return summaries;
}
