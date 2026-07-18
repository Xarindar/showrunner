"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import {
  getAvailableDashboardCards,
  getDashboardCardDefinition,
  getDashboardCardPlacements,
  normalizeDashboardCardSettings,
  normalizeDashboardCardSize,
  saveDashboardCardPlacements,
  type DashboardCardPlacement
} from "@/shell/dashboard-cards";
import {
  dashboardCardSizeFromLayout,
  getDashboardCardLayoutDefaults,
  normalizeDashboardCardColumns,
  normalizeDashboardCardRows
} from "@/shell/dashboard-layout";

function safeReturnTo(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\n") || path.includes("\r")) return "/admin";
  return path;
}

function redirectWithStatus(returnTo: string, key: "error" | "saved", value: string): never {
  const url = new URL(returnTo, "https://showrunner.local");
  url.searchParams.set(key, value);
  redirect(`${url.pathname}${url.search}${url.hash}`);
}

function orderedPlacements(placements: DashboardCardPlacement[]) {
  return placements.map((placement, order) => ({ ...placement, order }));
}

async function loadState() {
  const user = await requireAuthenticatedAdmin();
  const settings = await getSiteSettings();
  const placements = await getDashboardCardPlacements(settings.siteId, user.id, settings.enabledModuleIds);

  return { placements, settings, user };
}

function revalidateDashboard(returnTo: string) {
  revalidatePath("/admin");
  const pathname = new URL(returnTo, "https://showrunner.local").pathname;
  if (pathname.startsWith("/admin/modules/")) revalidatePath(pathname);
}

export async function addDashboardCardAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const cardId = String(formData.get("cardId") || "");
  const { placements, settings, user } = await loadState();
  const card = getDashboardCardDefinition(cardId);
  const availableCards = new Set(getAvailableDashboardCards(settings.enabledModuleIds).map((item) => item.id));

  if (!card || !availableCards.has(card.id)) {
    redirectWithStatus(returnTo, "error", "That widget is not available for this site.");
  }

  if (placements.some((placement) => placement.cardId === card.id)) {
    redirectWithStatus(returnTo, "saved", "dashboard-card-exists");
  }

  const defaultSize = normalizeDashboardCardSize(card.id, formData.get("size") || card.defaultSize);
  const defaultLayout = getDashboardCardLayoutDefaults(defaultSize);
  const nextPlacements = orderedPlacements([
    ...placements,
    {
      cardId: card.id,
      columns: defaultLayout.columns,
      instanceId: randomUUID(),
      order: placements.length,
      rows: defaultLayout.rows,
      settings: normalizeDashboardCardSettings(card.id, undefined),
      size: defaultSize
    }
  ]);

  await saveDashboardCardPlacements(settings.siteId, user.id, nextPlacements);
  await recordAuditLog({
    action: "dashboard.card.added",
    actor: user,
    metadata: { cardId: card.id, size: nextPlacements[nextPlacements.length - 1]?.size },
    siteId: settings.siteId,
    targetId: card.id,
    targetLabel: card.title,
    targetType: "dashboard_card"
  });

  revalidateDashboard(returnTo);
  redirectWithStatus(returnTo, "saved", "dashboard-card-added");
}

export async function updateDashboardCardSettingsAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const instanceId = String(formData.get("instanceId") || "");
  const { placements, settings, user } = await loadState();
  const placement = placements.find((item) => item.instanceId === instanceId);
  const card = placement ? getDashboardCardDefinition(placement.cardId) : null;

  if (!placement || !card) {
    redirectWithStatus(returnTo, "error", "That widget was not found.");
  }

  const nextSettings = normalizeDashboardCardSettings(
    card.id,
    Object.fromEntries((card.settings || []).map((setting) => [setting.id, formData.get(`setting.${setting.id}`) === "on"]))
  );
  const nextPlacements = placements.map((item) => (item.instanceId === instanceId ? { ...item, settings: nextSettings } : item));

  await saveDashboardCardPlacements(settings.siteId, user.id, nextPlacements);
  await recordAuditLog({
    action: "dashboard.card.settings_updated",
    actor: user,
    metadata: { cardId: card.id, settings: nextSettings },
    siteId: settings.siteId,
    targetId: instanceId,
    targetLabel: card.title,
    targetType: "dashboard_card"
  });

  revalidateDashboard(returnTo);
  redirectWithStatus(returnTo, "saved", "dashboard-card-settings-saved");
}

export async function removeDashboardCardAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const instanceId = String(formData.get("instanceId") || "");
  const { placements, settings, user } = await loadState();
  const removed = placements.find((placement) => placement.instanceId === instanceId);

  if (!removed) {
    redirectWithStatus(returnTo, "error", "That widget was not found.");
  }

  const nextPlacements = orderedPlacements(placements.filter((placement) => placement.instanceId !== instanceId));
  await saveDashboardCardPlacements(settings.siteId, user.id, nextPlacements);
  await recordAuditLog({
    action: "dashboard.card.removed",
    actor: user,
    metadata: { cardId: removed.cardId },
    siteId: settings.siteId,
    targetId: removed.cardId,
    targetLabel: getDashboardCardDefinition(removed.cardId)?.title || removed.cardId,
    targetType: "dashboard_card"
  });

  revalidateDashboard(returnTo);
  redirectWithStatus(returnTo, "saved", "dashboard-card-removed");
}

type DashboardLayoutItemInput = {
  columns?: unknown;
  instanceId?: unknown;
  rows?: unknown;
};

export async function saveDashboardCardLayoutAction(items: DashboardLayoutItemInput[]) {
  const { placements, settings, user } = await loadState();
  const currentByInstanceId = new Map(placements.map((placement) => [placement.instanceId, placement]));
  const seen = new Set<string>();
  const nextPlacements: DashboardCardPlacement[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const instanceId = typeof item?.instanceId === "string" ? item.instanceId : "";
    const current = currentByInstanceId.get(instanceId);
    if (!current || seen.has(instanceId)) continue;

    const columns = normalizeDashboardCardColumns(item.columns, current.columns);
    const rows = normalizeDashboardCardRows(item.rows, current.rows);
    nextPlacements.push({
      ...current,
      columns,
      order: nextPlacements.length,
      rows,
      size: normalizeDashboardCardSize(current.cardId, dashboardCardSizeFromLayout(columns, rows))
    });
    seen.add(instanceId);
  }

  for (const placement of placements) {
    if (seen.has(placement.instanceId)) continue;
    nextPlacements.push({
      ...placement,
      order: nextPlacements.length
    });
  }

  const ordered = orderedPlacements(nextPlacements);
  await saveDashboardCardPlacements(settings.siteId, user.id, ordered);
  await recordAuditLog({
    action: "dashboard.cards.layout_updated",
    actor: user,
    metadata: {
      cardCount: ordered.length,
      cards: ordered.map((placement) => ({
        cardId: placement.cardId,
        columns: placement.columns,
        rows: placement.rows
      }))
    },
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: "Dashboard widgets",
    targetType: "dashboard"
  });

  revalidateDashboard("/admin");
  return { ok: true };
}
