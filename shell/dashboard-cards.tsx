import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dashboardCardSizeFromLayout,
  dashboardCardSizes,
  getDashboardCardLayoutDefaults,
  normalizeDashboardCardColumns,
  normalizeDashboardCardRows,
  type DashboardCardSize
} from "@/shell/dashboard-layout";
import { dashboardWidgetDefinitions } from "@/shell/dashboard-widget-registry";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { moduleRegistry, type ModuleId } from "@/shell/modules";

export type DashboardCardDefinition = DashboardWidgetDefinition;

export type DashboardCardPlacement = {
  cardId: string;
  columns: number;
  instanceId: string;
  order: number;
  rows: number;
  size: DashboardCardSize;
};

export const dashboardCardDefinitions = dashboardWidgetDefinitions;

const dashboardModuleId: ModuleId = "dashboard";
const dashboardCardSettingPrefix = "dashboard.cards.";
const defaultDashboardCardIds = [
  "appointments.today",
  "appointments.pending",
  "clients.recent",
  "scheduling.services"
] as const;
const dashboardCardById = new Map(dashboardCardDefinitions.map((card) => [card.id, card]));

function normalizeSize(value: unknown, fallback: DashboardCardSize): DashboardCardSize {
  return dashboardCardSizes.includes(value as DashboardCardSize) ? (value as DashboardCardSize) : fallback;
}

function safeJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function dashboardCardSettingKey(userId: string) {
  return `${dashboardCardSettingPrefix}${userId}`;
}

export function getDashboardCardDefinition(cardId: string) {
  return dashboardCardById.get(cardId) || null;
}

export function getAvailableDashboardCards(enabledModuleIds: ModuleId[]) {
  const enabled = new Set<ModuleId>([dashboardModuleId, ...enabledModuleIds]);
  return dashboardCardDefinitions.filter((card) => enabled.has(card.moduleId));
}

export function getDashboardCardModule(card: DashboardCardDefinition) {
  return moduleRegistry.find((shellModule) => shellModule.id === card.moduleId) || null;
}

export function normalizeDashboardCardSize(cardId: string, value: unknown) {
  const card = getDashboardCardDefinition(cardId);
  const requested = normalizeSize(value, card?.defaultSize || "md");
  return card?.sizes.includes(requested) ? requested : card?.defaultSize || "md";
}

export function normalizeDashboardCardPlacements(
  value: unknown,
  enabledModuleIds: ModuleId[],
  options: { useDefaults?: boolean } = {}
) {
  const available = new Set(getAvailableDashboardCards(enabledModuleIds).map((card) => card.id));
  const source = Array.isArray(value) ? value : [];
  const seenCards = new Set<string>();
  const normalized: DashboardCardPlacement[] = [];

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const cardId = typeof record.cardId === "string" ? record.cardId : "";
    if (!available.has(cardId) || seenCards.has(cardId)) continue;
    const card = getDashboardCardDefinition(cardId);
    if (!card) continue;
    const instanceId = typeof record.instanceId === "string" && record.instanceId.trim() ? record.instanceId : cardId;
    const requestedSize = normalizeDashboardCardSize(cardId, record.size);
    const fallbackLayout = getDashboardCardLayoutDefaults(requestedSize);
    const columns = normalizeDashboardCardColumns(record.columns, fallbackLayout.columns);
    const rows = normalizeDashboardCardRows(record.rows, fallbackLayout.rows);
    normalized.push({
      cardId,
      columns,
      instanceId,
      order: normalized.length,
      rows,
      size: normalizeDashboardCardSize(cardId, dashboardCardSizeFromLayout(columns, rows))
    });
    seenCards.add(cardId);
  }

  if (!normalized.length && options.useDefaults) {
    return defaultDashboardCardIds
      .filter((cardId) => available.has(cardId))
      .map((cardId, order) => {
        const card = getDashboardCardDefinition(cardId);
        const defaultSize = card?.defaultSize || "md";
        const defaultLayout = getDashboardCardLayoutDefaults(defaultSize);
        return {
          cardId,
          columns: defaultLayout.columns,
          instanceId: cardId,
          order,
          rows: defaultLayout.rows,
          size: defaultSize
        };
      });
  }

  return normalized;
}

export async function getDashboardCardPlacements(siteId: string, userId: string, enabledModuleIds: ModuleId[]) {
  const setting = await prisma.moduleSetting.findUnique({
    where: {
      siteId_moduleId_key: {
        key: dashboardCardSettingKey(userId),
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });

  return normalizeDashboardCardPlacements(setting?.value, enabledModuleIds, { useDefaults: !setting });
}

export async function saveDashboardCardPlacements(siteId: string, userId: string, placements: DashboardCardPlacement[]) {
  await prisma.moduleInstallation.upsert({
    create: {
      enabled: true,
      installed: true,
      moduleId: dashboardModuleId,
      siteId
    },
    update: {
      enabled: true,
      installed: true
    },
    where: {
      siteId_moduleId: {
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });

  await prisma.moduleSetting.upsert({
    create: {
      key: dashboardCardSettingKey(userId),
      moduleId: dashboardModuleId,
      siteId,
      value: safeJsonValue(placements)
    },
    update: {
      value: safeJsonValue(placements)
    },
    where: {
      siteId_moduleId_key: {
        key: dashboardCardSettingKey(userId),
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });
}

export function dashboardCardCatalogGroups(enabledModuleIds: ModuleId[], placements: DashboardCardPlacement[]) {
  const placed = new Set(placements.map((placement) => placement.cardId));
  const cards = getAvailableDashboardCards(enabledModuleIds).filter((card) => !placed.has(card.id));

  return moduleRegistry
    .map((shellModule) => ({
      cards: cards.filter((card) => card.moduleId === shellModule.id),
      module: shellModule
    }))
    .filter((group) => group.cards.length);
}

export function placedDashboardCards(placements: DashboardCardPlacement[]) {
  return placements
    .map((placement) => {
      const card = getDashboardCardDefinition(placement.cardId);
      const shellModule = card ? getDashboardCardModule(card) : null;
      return card && shellModule ? { card, module: shellModule, placement } : null;
    })
    .filter(
      (
        item
      ): item is {
        card: DashboardCardDefinition;
        module: NonNullable<ReturnType<typeof getDashboardCardModule>>;
        placement: DashboardCardPlacement;
      } => Boolean(item)
    );
}
