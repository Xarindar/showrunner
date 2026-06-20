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
  normalizeDashboardCardSize,
  saveDashboardCardPlacements,
  type DashboardCardPlacement
} from "@/shell/dashboard-cards";

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
    redirectWithStatus(returnTo, "error", "That dashboard card is not available for this site.");
  }

  if (placements.some((placement) => placement.cardId === card.id)) {
    redirectWithStatus(returnTo, "saved", "dashboard-card-exists");
  }

  const nextPlacements = orderedPlacements([
    ...placements,
    {
      cardId: card.id,
      instanceId: randomUUID(),
      order: placements.length,
      size: normalizeDashboardCardSize(card.id, formData.get("size") || card.defaultSize)
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

export async function removeDashboardCardAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const instanceId = String(formData.get("instanceId") || "");
  const { placements, settings, user } = await loadState();
  const removed = placements.find((placement) => placement.instanceId === instanceId);

  if (!removed) {
    redirectWithStatus(returnTo, "error", "That dashboard card was not found.");
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

export async function resizeDashboardCardAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const instanceId = String(formData.get("instanceId") || "");
  const { placements, settings, user } = await loadState();
  const placement = placements.find((item) => item.instanceId === instanceId);

  if (!placement) {
    redirectWithStatus(returnTo, "error", "That dashboard card was not found.");
  }

  const nextSize = normalizeDashboardCardSize(placement.cardId, formData.get("size"));
  const nextPlacements = orderedPlacements(
    placements.map((item) => (item.instanceId === instanceId ? { ...item, size: nextSize } : item))
  );

  await saveDashboardCardPlacements(settings.siteId, user.id, nextPlacements);
  await recordAuditLog({
    action: "dashboard.card.resized",
    actor: user,
    metadata: { cardId: placement.cardId, size: nextSize },
    siteId: settings.siteId,
    targetId: placement.cardId,
    targetLabel: getDashboardCardDefinition(placement.cardId)?.title || placement.cardId,
    targetType: "dashboard_card"
  });

  revalidateDashboard(returnTo);
  redirectWithStatus(returnTo, "saved", "dashboard-card-resized");
}

export async function moveDashboardCardAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const instanceId = String(formData.get("instanceId") || "");
  const direction = String(formData.get("direction") || "");
  const { placements, settings, user } = await loadState();
  const currentIndex = placements.findIndex((placement) => placement.instanceId === instanceId);

  if (currentIndex < 0) {
    redirectWithStatus(returnTo, "error", "That dashboard card was not found.");
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : direction === "down" ? currentIndex + 1 : currentIndex;
  if (nextIndex < 0 || nextIndex >= placements.length || nextIndex === currentIndex) {
    redirectWithStatus(returnTo, "saved", "dashboard-card-unchanged");
  }

  const nextPlacements = [...placements];
  const [placement] = nextPlacements.splice(currentIndex, 1);
  nextPlacements.splice(nextIndex, 0, placement);

  await saveDashboardCardPlacements(settings.siteId, user.id, orderedPlacements(nextPlacements));
  await recordAuditLog({
    action: "dashboard.card.moved",
    actor: user,
    metadata: { cardId: placement.cardId, direction },
    siteId: settings.siteId,
    targetId: placement.cardId,
    targetLabel: getDashboardCardDefinition(placement.cardId)?.title || placement.cardId,
    targetType: "dashboard_card"
  });

  revalidateDashboard(returnTo);
  redirectWithStatus(returnTo, "saved", "dashboard-card-moved");
}
