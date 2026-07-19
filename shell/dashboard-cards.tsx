import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dashboardCardSizeFromLayout,
  dashboardCardSizes,
  getDashboardCardLayoutDefaults,
  getDashboardCardMinimumLayout,
  normalizeDashboardCardColumns,
  normalizeDashboardCardRows,
  type DashboardCardSize
} from "@/shell/dashboard-layout";
import { dashboardWidgetDefinitions } from "@/shell/dashboard-widget-registry";
import type { DashboardWidgetDefinition, DashboardWidgetSettings } from "@/shell/dashboard-widget-types";
import { moduleRegistry, type ModuleId } from "@/shell/modules";

export type DashboardCardDefinition = DashboardWidgetDefinition;

export type DashboardCardPlacement = {
  cardId: string;
  columns: number;
  instanceId: string;
  order: number;
  rows: number;
  settings: DashboardWidgetSettings;
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

function normalizedDateRangePart(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 8);
  if (!trimmed) return "";

  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(trimmed);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return trimmed;
}

export function normalizeDashboardCardSettings(cardId: string, value: unknown): DashboardWidgetSettings {
  const card = getDashboardCardDefinition(cardId);
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return (card?.settings || []).reduce<DashboardWidgetSettings>((settings, setting) => {
    const savedValue = source[setting.id];
    if (setting.type === "date-range") {
      const savedRange = savedValue && typeof savedValue === "object" && !Array.isArray(savedValue)
        ? (savedValue as Record<string, unknown>)
        : setting.defaultValue;
      settings[setting.id] = {
        end: normalizedDateRangePart(savedRange.end),
        start: normalizedDateRangePart(savedRange.start)
      };
    } else {
      settings[setting.id] = typeof savedValue === "boolean" ? savedValue : setting.defaultValue;
    }
    return settings;
  }, {});
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
    const minimumLayout = getDashboardCardMinimumLayout(card.sizes);
    const columns = normalizeDashboardCardColumns(record.columns, fallbackLayout.columns, minimumLayout.columns);
    const rows = normalizeDashboardCardRows(record.rows, fallbackLayout.rows, minimumLayout.rows);
    normalized.push({
      cardId,
      columns,
      instanceId,
      order: normalized.length,
      rows,
      settings: normalizeDashboardCardSettings(cardId, record.settings),
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
          settings: normalizeDashboardCardSettings(cardId, undefined),
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
