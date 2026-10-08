/* eslint-disable @typescript-eslint/no-explicit-any -- VM mocks isolate verified provider-event handlers from networks and databases. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(file: string, mocks: Record<string, unknown>, extra = "") {
  const source = ts.transpileModule(readFileSync(file, "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: any = {};
  const realRequire = createRequire(import.meta.url);
  runInNewContext(source, { exports, console, Date, URL, Buffer, process, require: (name: string) => name in mocks ? mocks[name] : name === "server-only" || name.startsWith("@/") || name === "./orders" ? {} : realRequire(name) });
  return exports;
}
function harness(provider: string) {
  const writes: any[] = [];
  const lookups: any[] = [];
  const payment = { id: "payment", orderId: "extras-order", currency: "USD", amountCents: 1000, status: "PAID", order: { siteId: "site", orderNumber: "order" } };
  let revokedAt: Date | null = null;
  const db = {
    portfolioSelectionPurchase: { findFirst: async () => ({ id: "purchase" }), updateMany: async (query: any) => { writes.push(query); if (revokedAt === null) revokedAt = query.data.revokedAt; return { count: 1 }; } },
    payment: { findFirst: async (query: any) => { lookups.push(query); return payment; }, update: async () => payment },
    billingPayment: { findFirst: async () => null }
  };
  const helpers = load("lib/portfolio/refunds.ts", { "@/lib/prisma": { prisma: db } });
  const api = load(`lib/commerce/${provider}.ts`, { "@/lib/prisma": { prisma: db }, "@/lib/portfolio/refunds": helpers, "./orders": { updateOrderStatus: async () => {} } }, `\nexports.dispatch = dispatch${provider === "stripe" ? "Stripe" : provider === "square" ? "Square" : "PayPal"}Event;`);
  return { api, helpers, writes, lookups, get revokedAt() { return revokedAt; } };
}

test("Stripe confirmed partial/full refunds permanently revoke exact extras order; pending/failed refunds do not", async () => {
  for (const amount of [1, 1000]) {
    const h = harness("stripe");
    await h.api.dispatch({ type: "charge.refunded", data: { object: { object: "charge", id: "ch", payment_intent: "pi", amount_refunded: amount, currency: "usd" } } });
    assert.equal(h.writes.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].where)), { orderId: "extras-order", siteId: "site", revokedAt: null });
    const timestamp = h.revokedAt;
    await h.api.dispatch({ type: "refund.updated", data: { object: { object: "refund", payment_intent: "pi", status: "succeeded", amount, currency: "usd" } } });
    assert.equal(h.revokedAt, timestamp);
  }
  for (const status of ["pending", "failed", "canceled"]) {
    const h = harness("stripe");
    await h.api.dispatch({ type: "refund.updated", data: { object: { object: "refund", payment_intent: "pi", status, amount: 100, currency: "usd" } } });
    assert.equal(h.writes.length, 0);
  }
});

test("Square completed positive partial refund revokes; pending/zero refunds do not", async () => {
  for (const [status, amount, expected] of [["COMPLETED", 100, 1], ["PENDING", 100, 0], ["COMPLETED", 0, 0]] as const) {
    const h = harness("square");
    await h.api.dispatch({ type: "refund.updated", data: { object: { refund: { id: "ref", payment_id: "pay", status, amount_money: { amount, currency: "USD" } } } } });
    assert.equal(h.writes.length, expected);
  }
});

test("PayPal refund binds original capture, never refund id or merchant custom id", async () => {
  const h = harness("paypal");
  await h.api.dispatch({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "REFUND123", custom_id: "wrong-local-payment", status: "COMPLETED", amount: { value: "1.00", currency_code: "USD" }, supplementary_data: { related_ids: { capture_id: "CAPTURE123" } } } });
  assert.equal(h.writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.lookups[0].where)), { provider: "PAYPAL", externalPaymentId: "CAPTURE123" });
  const missing = harness("paypal");
  await assert.rejects(missing.api.dispatch({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "REFUND123", status: "COMPLETED", amount: { value: "1.00", currency_code: "USD" } } }), /capture identity/);
  assert.equal(missing.writes.length, 0);
});

test("PayPal capture-link fallback accepts only canonical HTTPS capture resources", () => {
  const h = harness("paypal");
  for (const host of ["api-m.paypal.com", "api-m.sandbox.paypal.com"]) {
    assert.equal(h.helpers.payPalRefundCaptureId({ links: [{ rel: "up", href: `https://${host}/v2/payments/captures/CAPTURE123` }] }), "CAPTURE123");
  }
  for (const href of ["https://evil.example/v2/payments/captures/CAPTURE123", "https://api-m.paypal.com/v2/checkout/orders/ORDER123", "http://api-m.paypal.com/v2/payments/captures/CAPTURE123"]) {
    assert.equal(h.helpers.payPalRefundCaptureId({ links: [{ rel: "up", href }] }), null);
  }
});

test("refund currency mismatch and nonpositive/noninteger amounts cannot revoke", async () => {
  const h = harness("stripe");
  const base = { orderId: "extras-order", siteId: "site", currency: "USD", paymentCurrency: "USD" };
  for (const amountCents of [0, -1, 0.1, NaN]) await h.helpers.revokeGalleryPurchaseForRefund({ ...base, amountCents });
  await assert.rejects(h.helpers.revokeGalleryPurchaseForRefund({ ...base, amountCents: 100, currency: "EUR" }), /currency/);
  assert.equal(h.writes.length, 0);
});

test("gallery refund helper leaves unrelated commerce orders unchanged", async () => {
  let writes = 0;
  const helpers = load("lib/portfolio/refunds.ts", { "@/lib/prisma": { prisma: { portfolioSelectionPurchase: { findFirst: async () => null, updateMany: async () => { writes++; } } } } });
  await helpers.revokeGalleryPurchaseForRefund({ orderId: "ordinary-order", siteId: "site", amountCents: 10, currency: "", paymentCurrency: "USD" });
  assert.equal(writes, 0);
});
