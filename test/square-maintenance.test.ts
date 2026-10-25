/* eslint-disable @typescript-eslint/no-explicit-any -- Isolate scheduled provider reads and settlement from real accounts. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness(failRefunds = false, localStatus = "PENDING") {
  const events: any[] = [];
  const queries: any[] = [];
  const requests: URL[] = [];
  let checkpoint = false;
  let fail = failRefunds;
  let acquired = true;
  let refreshed = 0;
  const credential = { id: "cred", siteId: "site-a", status: "CONNECTED", merchantId: "merchant", encryptedAccessToken: "sealed", createdAt: new Date("2026-01-01"),
    metadata: { onboarding: "oauth", tokenFlow: "pkce", locationId: "location-a", squareSyncedAt: "2026-02-01T00:00:00Z" } };
  const mocks: Record<string, unknown> = {
    "@/lib/prisma": { prisma: {
      paymentGatewayCredential: { findMany: async () => [credential] },
      $transaction: async (work: (tx: any) => Promise<void>) => work({
        $queryRaw: async () => [{ acquired }],
        paymentGatewayCredential: { findUnique: async () => credential }
      }),
      payment: { findFirst: async (query: any) => {
        queries.push(query); assert.equal(query.where.order.siteId, "site-a");
        return query.where.externalPaymentId.in.includes("order-local") ? { id: "local", status: localStatus }
          : query.where.externalPaymentId.in.includes("payment-local") ? { id: "local", status: "PAID" } : null;
      } },
      billingPayment: { findFirst: async (query: any) => { assert.equal(query.where.billingDocument.siteId, "site-a"); return null; } },
      $executeRaw: async () => { checkpoint = true; }
    } },
    "@/lib/objects": { isRecord: (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value) },
    "./credentials": { getSquareAccessToken: async () => ({ accessToken: "private-token", environment: "sandbox", credential }) },
    "./provider-onboarding": { squareApiBaseUrl: () => "https://connect.squareupsandbox.com" },
    "@/lib/commerce/square": { handleSquareWebhookEvent: async (event: any, siteId: string) => {
      assert.equal(siteId, "site-a"); if (!events.some((item) => item.event_id === event.event_id)) events.push(event);
    } },
    "./connect/square-refresh": {
      isOAuthSquareCredential: (value: any) => value.metadata.tokenFlow === "pkce",
      squareRefreshRequiresReconnect: () => false,
      refreshSquareCredentialDirect: async () => { refreshed += 1; }
    }
  };
  const fetch = async (url: string, init: RequestInit) => {
    const request = new URL(url); requests.push(request);
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer private-token");
    assert.equal(request.searchParams.get("location_id"), "location-a");
    assert.equal(request.searchParams.get("updated_at_begin_time"), "2026-01-31T00:00:00.000Z");
    if (request.pathname === "/v2/payments") return Response.json(request.searchParams.has("cursor")
      ? { payments: [{ id: "unrelated-pos", updated_at: "2026-02-01", location_id: "location-a" }] }
      : { payments: [{ id: "payment-local", order_id: "order-local", status: "COMPLETED", updated_at: "2026-02-01" }], cursor: "page-2" });
    return fail ? new Response("unavailable", { status: 503 })
      : Response.json({ refunds: [{ id: "refund-local", payment_id: "payment-local", status: "COMPLETED", updated_at: "2026-02-02" }] });
  };
  const source = ts.transpileModule(readFileSync("lib/payments/square-maintenance.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports: any = {};
  const realRequire = createRequire(import.meta.url);
  runInNewContext(source, { exports, console, Date, Error, URL, URLSearchParams, AbortSignal, fetch,
    require: (id: string) => id in mocks ? mocks[id] : realRequire(id) });
  return { events, queries, requests, credential, run: () => exports.reconcileSquare("site-a"),
    maintain: () => exports.maintainSquareConnections(), lock: (value: boolean) => { acquired = value; },
    retry: () => { fail = false; }, get refreshed() { return refreshed; }, get checkpoint() { return checkpoint; } };
}

test("Square sync pages through merchant updates, ignores unrelated POS sales and routes settlement to the same site", async () => {
  const h = harness();
  await h.run();
  assert.equal(h.requests.length, 3);
  assert.equal(h.events.length, 2);
  assert.deepEqual(h.events.map((event) => event.type), ["payment.updated", "refund.updated"]);
  assert.ok(h.checkpoint);
  await h.run();
  assert.equal(h.events.length, 2, "re-reading overlapping updates uses stable event identities");
});

test("a failed Square page keeps the checkpoint so the next run recovers all updates", async () => {
  const h = harness(true);
  await assert.rejects(h.run(), /503/);
  assert.equal(h.checkpoint, false);
  h.retry();
  await h.run();
  assert.equal(h.events.length, 2);
  assert.ok(h.checkpoint);
});

test("paid attempts still reach the event ledger to retry unfinished order settlement, while refunded attempts stay refunded", async () => {
  const paid = harness(false, "PAID");
  await paid.run();
  assert.equal(paid.events[0].type, "payment.updated");
  const refunded = harness(false, "REFUNDED");
  await refunded.run();
  assert.deepEqual(refunded.events.map((event) => event.type), ["refund.updated"]);
});

test("maintenance leaves a seller locked by another replica alone, then refreshes and syncs after acquiring its lock", async () => {
  const h = harness();
  h.lock(false);
  await h.maintain();
  assert.equal(h.requests.length, 0);
  assert.equal(h.refreshed, 0);
  h.lock(true);
  const result = await h.maintain();
  assert.equal(result.failures.length, 0);
  assert.equal(h.refreshed, 1);
  assert.equal(h.requests.length, 3);
  h.credential.metadata.squareSyncedAt = new Date().toISOString();
  await h.maintain();
  assert.equal(h.requests.length, 3, "a recent successful scan suppresses the other replica's tick");
});
