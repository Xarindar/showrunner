import { PaymentGatewayConnectionStatus, PaymentProvider, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord } from "@/lib/objects";
import { getSquareAccessToken } from "./credentials";
import { squareApiBaseUrl } from "./provider-onboarding";
import { handleSquareWebhookEvent } from "@/lib/commerce/square";
import { isOAuthSquareCredential, refreshSquareCredentialDirect, squareRefreshRequiresReconnect } from "./connect/square-refresh";

type SquareUpdate = {
  id: string; updated_at: string; status?: string; order_id?: string; payment_id?: string; location_id?: string; created_at?: string;
  amount_money?: { amount?: number; currency?: string }; total_money?: { amount?: number; currency?: string };
};

function canMaintain(credential: Parameters<typeof isOAuthSquareCredential>[0]) {
  return isOAuthSquareCredential(credential) || (isRecord(credential.metadata) && credential.metadata.onboarding === "square_access_token");
}

// Read authenticated merchant data directly: no application-wide webhook feed or broker dependency.
export async function reconcileSquare(siteId: string) {
  const { accessToken, environment, credential } = await getSquareAccessToken(siteId);
  const metadata = isRecord(credential.metadata) ? credential.metadata : {};
  const locationId = metadata.locationId;
  if (typeof locationId !== "string" || !locationId) throw new Error("Square location is missing.");
  const startedAt = new Date();
  const lastSync = typeof metadata.squareSyncedAt === "string" ? new Date(metadata.squareSyncedAt) : credential.createdAt;
  if (!Number.isFinite(lastSync.getTime())) throw new Error("Square sync checkpoint is invalid.");
  // Re-read a day of updates to cover Square's eventual consistency and interrupted local writes.
  const since = new Date(lastSync.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let processed = 0;
  const dispatch = async (event: Parameters<typeof handleSquareWebhookEvent>[0] & { event_id: string }) => {
    const key = { siteId, eventId: event.event_id };
    try {
      const result = await handleSquareWebhookEvent(event, siteId);
      if (result?.duplicate && !await prisma.squareWebhookEvent.findFirst({
        where: { eventId: key.eventId, siteId: { in: ["", siteId] }, status: "PROCESSED" }, select: { id: true }
      })) return;
      await prisma.squareReconciliationItem.deleteMany({ where: key });
      processed++;
    } catch {
      console.error("[payments:square] item retained for reconciliation", { siteId });
    }
  };
  const retry = await prisma.squareReconciliationItem.findMany({
    where: { siteId }, orderBy: { createdAt: "asc" }, take: 100
  });
  for (const item of retry) {
    const event = item.payload as Parameters<typeof dispatch>[0];
    if (event.merchant_id !== credential.merchantId) {
      console.error("[payments:square] item merchant changed", { siteId });
      continue;
    }
    await dispatch(event);
  }
  for (const kind of ["payments", "refunds"] as const) {
    const query = new URLSearchParams({ begin_time: "1970-01-01T00:00:00Z", updated_at_begin_time: since,
      updated_at_end_time: startedAt.toISOString(), sort_field: "UPDATED_AT", sort_order: "ASC", location_id: locationId, limit: "100" });
    let cursor = "";
    do {
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${squareApiBaseUrl(environment)}/v2/${kind}?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "Square-Version": "2026-05-20" },
        signal: AbortSignal.timeout(10_000), cache: "no-store"
      });
      if (!response.ok) throw new Error(`Square ${kind} sync failed (${response.status}).`);
      const body: unknown = await response.json();
      if (!isRecord(body) || (body[kind] !== undefined && !Array.isArray(body[kind])) ||
          (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length > 0))) {
        throw new Error("Square returned an invalid sync response.");
      }
      for (const raw of (body[kind] ?? []) as unknown[]) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.updated_at !== "string") throw new Error("Square returned an invalid update.");
        const update = raw as SquareUpdate;
        if (update.location_id && update.location_id !== locationId) throw new Error("Square returned another location.");
        const identifiers = kind === "payments" ? [update.id, update.order_id].filter((id): id is string => Boolean(id)) : [update.payment_id || ""];
        const where = { provider: PaymentProvider.SQUARE, externalPaymentId: { in: identifiers } };
        const orderPayment = await prisma.payment.findFirst({ where: { ...where, order: { siteId } }, select: { id: true, status: true } });
        const billingPayment = orderPayment ? null : await prisma.billingPayment.findFirst({
          where: {
            provider: PaymentProvider.SQUARE,
            billingDocument: { siteId },
            OR: [
              { externalPaymentId: { in: identifiers } },
              ...(kind === "payments" && update.order_id ? [{ externalOrderId: update.order_id }] : [])
            ]
          },
          select: { id: true, status: true }
        });
        const local = orderPayment || billingPayment;
        if (!local) continue; // Square also returns this seller's unrelated POS sales.
        // Paid rows may still have unfinished settlement work; the event ledger retries that work.
        if (kind === "payments" && local.status === "REFUNDED") continue;
        const type = kind === "payments" ? "payment" : "refund";
        const event = {
          event_id: `sync:${siteId}:${type}:${update.id}:${update.updated_at}`, merchant_id: credential.merchantId,
          type: `${type}.updated`, created_at: update.updated_at, data: { object: { [type]: {
            id: update.id, amount_money: update.amount_money, total_money: update.total_money, created_at: update.created_at,
            order_id: update.order_id, payment_id: update.payment_id, status: update.status
          } } }
        };
        const key = { siteId, eventId: event.event_id };
        await prisma.squareReconciliationItem.upsert({
          where: { siteId_eventId: key }, update: {},
          create: { ...key, payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonObject }
        });
        await dispatch(event);
      }
      if (body.cursor !== undefined && typeof body.cursor !== "string") throw new Error("Square returned an invalid cursor.");
      const next = typeof body.cursor === "string" ? body.cursor : "";
      if (next && next === cursor) throw new Error("Square repeated its pagination cursor.");
      cursor = next;
    } while (cursor);
  }
  // Merge only the checkpoint so a concurrent refresh cannot lose its new token metadata.
  await prisma.$executeRaw`UPDATE "PaymentGatewayCredential" SET metadata = metadata || ${JSON.stringify({ squareSyncedAt: startedAt.toISOString() })}::jsonb
    WHERE id = ${credential.id} AND "encryptedAccessToken" = ${credential.encryptedAccessToken}`;
  return processed;
}

export async function maintainSquareConnections() {
  const credentials = await prisma.paymentGatewayCredential.findMany({ where: { provider: PaymentProvider.SQUARE,
    status: { in: [PaymentGatewayConnectionStatus.CONNECTED, PaymentGatewayConnectionStatus.ERROR] } } });
  const failures: string[] = [];
  for (const credential of credentials) {
    if (!canMaintain(credential)) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`square-maintenance:${credential.siteId}`}, 0)) AS acquired`;
        if (!lock[0]?.acquired) return;
        const current = await tx.paymentGatewayCredential.findUnique({ where: { id: credential.id } });
        if (!current || !canMaintain(current) || (current.status !== PaymentGatewayConnectionStatus.CONNECTED && current.status !== PaymentGatewayConnectionStatus.ERROR)) return;
        const metadata = isRecord(current.metadata) ? current.metadata : {};
        if (typeof metadata.squareSyncedAt === "string" && Date.parse(metadata.squareSyncedAt) > Date.now() - 45_000) return;
        if (isOAuthSquareCredential(current) && !squareRefreshRequiresReconnect(current)) await refreshSquareCredentialDirect(current);
        await reconcileSquare(current.siteId);
        if (squareRefreshRequiresReconnect(current)) throw new Error("Square requires reconnection.");
      // shortcut: each seller's scan must finish within four minutes; use durable paged jobs for higher volumes.
      }, { maxWait: 5_000, timeout: 240_000 });
    } catch (error) {
      failures.push(credential.siteId);
      console.error("[payments:square] maintenance failed", { siteId: credential.siteId, name: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return { checked: credentials.filter(canMaintain).length, failures };
}

export function startSquareMaintenance() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await maintainSquareConnections(); }
    catch (error) { console.error("[payments:square] maintenance unavailable", { name: error instanceof Error ? error.name : "UnknownError" }); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => { void run(); }, 60_000);
  timer.unref();
  console.info("[payments:square] automatic maintenance started");
}
