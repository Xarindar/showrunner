/* eslint-disable @typescript-eslint/no-explicit-any -- VM provider/db mocks prohibit real network calls. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as policy from "../lib/portfolio/selection-policy";
import * as recoveryPolicy from "../lib/portfolio/checkout-recovery-policy";

function load(file: string, mocks: Record<string, unknown>, extra = "", globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: any = {};
  const realRequire = createRequire(import.meta.url);
  runInNewContext(code, { exports, console, Date, URL, URLSearchParams, Buffer, process, Headers, structuredClone,
    fetch: () => { throw new Error("Real provider calls are forbidden in tests"); }, ...globals,
    require: (name: string) => name in mocks ? mocks[name] : name === "server-only" || name.startsWith("@/") || name === "./orders" ? {} : realRequire(name) });
  return exports;
}
function recoveryHarness(options: { provider?: string; inspection?: any; noSession?: boolean } = {}) {
  const created = new Date(Date.now() - 10000);
  const payment: any = { id: "pay-1", orderId: "order-1", provider: options.provider || "STRIPE", status: "FAILED", amountCents: 2000, currency: "USD", refundedCents: 0, providerVerifiedAt: null,
    externalCheckoutSession: options.noSession ? null : "checkout-1", externalPaymentId: null, rawSummary: {}, createdAt: created };
  const order: any = { id: "order-1", orderNumber: "PHOTO-1", siteId: "site", clientId: "client", status: "CANCELED", totalCents: 2000, currency: "USD", checkoutUrl: "https://provider.example/old", payments: [payment] };
  const purchase: any = { id: "purchase", siteId: "site", clientId: "client", galleryId: "gallery", totalCents: 2000, currency: "USD", orderId: order.id, order, revokedAt: null, checkoutStartedAt: null, selections: ["image-1", "image-2"], allowance: 1, extraPriceCents: 2000 };
  const calls: string[] = [];
  let queue = Promise.resolve();
  let inspect: any = options.inspection || { state: "TERMINAL", providerState: "expired" };
  const read = () => structuredClone({ ...purchase, order: { ...order, payments: [...order.payments].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)) } });
  const db: any = {
    $queryRaw: async () => { calls.push("lock"); return []; },
    portfolioSelectionPurchase: {
      findFirst: async ({ where }: any) => where.siteId === purchase.siteId && where.id === purchase.id ? read() : null,
      findFirstOrThrow: async () => read(),
      update: async ({ data }: any) => Object.assign(purchase, data),
      updateMany: async ({ where, data }: any) => {
        if (purchase.checkoutStartedAt?.getTime() !== where.checkoutStartedAt?.getTime()) return { count: 0 };
        Object.assign(purchase, data); return { count: 1 };
      }
    },
    order: { update: async ({ data }: any) => Object.assign(order, data) },
    payment: {
      update: async ({ where, data }: any) => Object.assign(order.payments.find((p: any) => p.id === where.id), data),
      create: async ({ data }: any) => { calls.push("new-payment"); const next = { ...payment, ...data, id: `pay-${order.payments.length + 1}`, externalCheckoutSession: null, externalPaymentId: null, createdAt: new Date() }; order.payments.push(next); return next; }
    }
  };
  db.$transaction = (fn: (tx: any) => unknown) => { const next = queue.then(() => fn(db)); queue = next.then(() => undefined, () => undefined); return next; };
  const inspector = async () => { calls.push("inspect"); if (inspect instanceof Error) throw inspect; return inspect; };
  const api = load("lib/portfolio/checkout-recovery.ts", {
    "@/lib/prisma": { prisma: db }, "./selection-policy": policy,
    "@/lib/commerce/stripe": { inspectStripeGalleryCheckout: inspector },
    "@/lib/commerce/paypal": { inspectPayPalGalleryCheckout: inspector },
    "@/lib/commerce/square": { inspectSquareGalleryCheckout: inspector },
    "@/lib/payments/checkout": { createPaymentCheckoutSessionForOrder: async () => {
      calls.push("create-provider"); const current = read().order.payments[0];
      order.payments.find((p: any) => p.id === current.id).externalCheckoutSession = `session-${current.id}`;
      order.checkoutUrl = `https://provider.example/${current.id}`; return read().order;
    } }
  });
  return { api, purchase, order, payment, calls, setInspection: (value: any) => { inspect = value; } };
}
const request = { purchaseId: "purchase", siteId: "site" };

test("provider-confirmed expiration renews only payment attempt, preserving immutable selection/order/price", async () => {
  const h = recoveryHarness(); const immutable = JSON.stringify([h.purchase.id, h.purchase.galleryId, h.purchase.orderId, h.purchase.selections, h.purchase.totalCents, h.purchase.allowance, h.purchase.extraPriceCents]);
  const result = await h.api.recoverGalleryCheckout(request);
  assert.equal(result.checkoutUrl, "https://provider.example/pay-2");
  assert.equal(h.order.payments.length, 2); assert.equal(h.payment.status, "FAILED");
  assert.equal(h.order.payments[1].amountCents, 2000); assert.equal(h.order.payments[1].currency, "USD");
  assert.equal(h.payment.rawSummary.galleryRecovery.terminalState, "expired");
  assert.ok(h.calls.indexOf("inspect") < h.calls.indexOf("new-payment")); assert.ok(h.calls.indexOf("new-payment") < h.calls.indexOf("create-provider"));
  assert.equal(JSON.stringify([h.purchase.id, h.purchase.galleryId, h.purchase.orderId, h.purchase.selections, h.purchase.totalCents, h.purchase.allowance, h.purchase.extraPriceCents]), immutable);
  assert.equal(h.purchase.checkoutStartedAt, null);
});
test("open sessions are reused; completed/approved/uncertain sessions never create another charge", async () => {
  for (const inspection of [{ state: "OPEN", checkoutUrl: "https://provider.example/current" }, { state: "WAITING" }]) {
    const h = recoveryHarness({ inspection }); const result = await h.api.recoverGalleryCheckout(request);
    assert.equal(result.checkoutUrl, inspection.state === "OPEN" ? inspection.checkoutUrl : null);
    assert.equal(h.order.status, "PENDING"); assert.equal(h.order.payments.length, 1); assert.ok(!h.calls.includes("create-provider"));
  }
  const h = recoveryHarness(); h.setInspection(new Error("Provider unavailable"));
  await assert.rejects(h.api.recoverGalleryCheckout(request), /verification is temporarily unavailable/);
  assert.equal(h.order.payments.length, 1); assert.ok(!h.calls.includes("create-provider"));
});
test("simultaneous retry clicks lease one renewal and use the same gallery order", async () => {
  const h = recoveryHarness(); await Promise.all([h.api.recoverGalleryCheckout(request), h.api.recoverGalleryCheckout(request)]);
  assert.equal(h.calls.filter(c => c === "create-provider").length, 1); assert.equal(h.order.payments.length, 2);
});
test("recorded paid/authorized/refunded or revoked purchases cannot start another checkout", async () => {
  for (const patch of ["PAID", "AUTHORIZED", "REFUNDED", "revoked"] as const) {
    const h = recoveryHarness(); if (patch === "revoked") h.purchase.revokedAt = new Date(); else h.payment.status = patch;
    await h.api.recoverGalleryCheckout(request);
    assert.ok(!h.calls.includes("inspect")); assert.ok(!h.calls.includes("create-provider"));
  }
});
test("price/site mismatch and an unresolved older attempt fail closed", async () => {
  const price = recoveryHarness(); price.order.totalCents++; await assert.rejects(price.api.recoverGalleryCheckout(request), /details need review/);
  const site = recoveryHarness(); await assert.rejects(site.api.recoverGalleryCheckout({ ...request, siteId: "foreign" }), /unavailable/);
  const older = recoveryHarness(); older.order.payments.push({ ...older.payment, id: "old-unresolved", status: "PENDING", createdAt: new Date(0) });
  await assert.rejects(older.api.recoverGalleryCheckout(request), /earlier payment/); assert.ok(!older.calls.includes("create-provider"));
});
test("interrupted creation replays the same key only in the bounded safe window", async () => {
  for (const provider of ["STRIPE", "PAYPAL"]) {
    const h = recoveryHarness({ provider, noSession: true }); h.payment.rawSummary = { galleryCheckoutAttempt: { startedAt: new Date(Date.now() - 10000).toISOString() } };
    await h.api.recoverGalleryCheckout(request); assert.equal(h.order.payments.length, 1); assert.ok(h.calls.includes("create-provider"));
    const old = recoveryHarness({ provider, noSession: true }); old.payment.rawSummary = { galleryCheckoutAttempt: { startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() } };
    await assert.rejects(old.api.recoverGalleryCheckout(request), /could not be verified safely/); assert.ok(!old.calls.includes("create-provider"));
  }
  const square = recoveryHarness({ provider: "SQUARE", noSession: true }); square.payment.rawSummary = { galleryCheckoutAttempt: { startedAt: new Date().toISOString() } };
  await assert.rejects(square.api.recoverGalleryCheckout(request), /could not be verified safely/);
});

const identity = { siteId: "site", orderId: "order-1", paymentId: "pay-1", amountCents: 2000, currency: "USD", checkoutSessionId: "session-1", externalPaymentId: null };
function stripeInspector(session: any) {
  class FakeStripe { checkout = { sessions: { retrieve: async () => session } }; }
  return load("lib/commerce/stripe.ts", { stripe: FakeStripe, "@/lib/payments/credentials": { getStripeApiKeyForSite: async () => "synthetic-test-key" }, "@/lib/portfolio/checkout-recovery-policy": recoveryPolicy });
}
const stripeSession = { id: "session-1", mode: "payment", client_reference_id: "order-1", metadata: { siteId: "site", orderId: "order-1", paymentId: "pay-1" }, amount_total: 2000, currency: "usd", payment_intent: null, status: "expired", payment_status: "unpaid", url: "https://provider.example/open" };
test("Stripe inspection verifies immutable identities/price and accepts only unpaid terminal sessions", async () => {
  assert.equal((await stripeInspector(stripeSession).inspectStripeGalleryCheckout(identity)).state, "TERMINAL");
  assert.equal((await stripeInspector({ ...stripeSession, status: "open" }).inspectStripeGalleryCheckout(identity)).state, "OPEN");
  for (const patch of [{ status: "complete" }, { payment_status: "paid" }, { payment_intent: "unexpanded-intent" }]) assert.equal((await stripeInspector({ ...stripeSession, ...patch }).inspectStripeGalleryCheckout(identity)).state, "WAITING");
  for (const patch of [{ metadata: { ...stripeSession.metadata, paymentId: "foreign" } }, { amount_total: 1999 }, { currency: "eur" }, { id: "foreign-session" }]) await assert.rejects(stripeInspector({ ...stripeSession, ...patch }).inspectStripeGalleryCheckout(identity), /does not match/);
});
function httpInspector(provider: "paypal" | "square", resource: any, link?: any) {
  const paths: string[] = [];
  const credentials = { clientId: "fixture", clientSecret: "fixture", merchantId: "merchant", environment: "SANDBOX", metadata: { locationId: "location" } };
  const mocks = {
    "@/lib/portfolio/checkout-recovery-policy": recoveryPolicy,
    "@/lib/payments/provider-onboarding": { paypalApiBaseUrl: () => "https://provider.invalid", squareApiBaseUrl: () => "https://provider.invalid" },
    "@/lib/payments/credentials": { getPayPalCredentialsForSite: async () => credentials, getConnectedGatewayCredential: async () => credentials, getSquareAccessToken: async () => ({ accessToken: "fixture", environment: "SANDBOX" }) },
    "@/lib/payments/connect/square-refresh": { isSquareCredentialUsable: () => true }
  };
  const api = load(`lib/commerce/${provider}.ts`, mocks, "", { fetch: async (url: string) => {
    paths.push(url); const body = url.endsWith("/token") ? { access_token: "synthetic" } : url.includes("payment-links") ? link : resource;
    return { ok: true, text: async () => JSON.stringify(body) };
  } });
  return { api, paths };
}
test("PayPal verifies order/custom ID/amount and only VOIDED can renew; approved waits", async () => {
  const order = { id: "session-1", intent: "CAPTURE", status: "VOIDED", purchase_units: [{ custom_id: "pay-1", amount: { value: "20.00", currency_code: "USD" } }], links: [{ rel: "approve", href: "https://provider.example/approve" }] };
  assert.equal((await httpInspector("paypal", order).api.inspectPayPalGalleryCheckout(identity)).state, "TERMINAL");
  assert.equal((await httpInspector("paypal", { ...order, status: "APPROVED" }).api.inspectPayPalGalleryCheckout(identity)).state, "WAITING");
  assert.equal((await httpInspector("paypal", { ...order, status: "CREATED" }).api.inspectPayPalGalleryCheckout(identity)).state, "OPEN");
  await assert.rejects(httpInspector("paypal", { ...order, purchase_units: [{ ...order.purchase_units[0], custom_id: "foreign" }] }).api.inspectPayPalGalleryCheckout(identity), /does not match/);
  const captured = { ...order, purchase_units: [{ ...order.purchase_units[0], payments: { captures: [{ status: "COMPLETED" }] } }] };
  assert.equal((await httpInspector("paypal", captured).api.inspectPayPalGalleryCheckout(identity)).state, "WAITING");
});
test("Square cancellation is verified from the exact server order; active links reuse and tenders wait", async () => {
  const order = { id: "square-order", location_id: "location", state: "CANCELED", total_money: { amount: 2000, currency: "USD" } };
  const input = { ...identity, externalPaymentId: "square-order" };
  const canceled = httpInspector("square", { order }); assert.equal((await canceled.api.inspectSquareGalleryCheckout(input)).state, "TERMINAL"); assert.equal(canceled.paths.length, 1);
  const active = httpInspector("square", { order: { ...order, state: "DRAFT" } }, { payment_link: { id: "session-1", order_id: "square-order", url: "https://provider.example/square" } });
  assert.equal((await active.api.inspectSquareGalleryCheckout(input)).state, "OPEN");
  assert.equal((await httpInspector("square", { order: { ...order, tenders: [{ payment_id: "pending" }] } }).api.inspectSquareGalleryCheckout(input)).state, "WAITING");
  await assert.rejects(httpInspector("square", { order: { ...order, id: "foreign" } }).api.inspectSquareGalleryCheckout(input), /does not match/);
});

function webhookHarness(provider: string) {
  const writes: any[] = []; const transitions: any[] = [];
  const payment = { id: "pay-1", orderId: "order-1", provider: provider.toUpperCase(), status: "PENDING", amountCents: 2000, currency: "USD", externalCheckoutSession: "session-1", externalPaymentId: "square-order", rawSummary: { checkoutSession: { orderId: "square-order" } }, order: { siteId: "site", status: "PENDING", totalCents: 2000, currency: "USD", orderNumber: "PHOTO-1", gallerySelectionPurchase: { id: "purchase" } } };
  const db = { payment: { findFirst: async () => payment, update: async (q: any) => { writes.push(q); return payment; }, updateMany: async (q: any) => { writes.push(q); return { count: 1 }; } }, billingPayment: { findFirst: async () => null } };
  const api = load(`lib/commerce/${provider}.ts`, { "@/lib/prisma": { prisma: db }, "@/lib/portfolio/checkout-recovery-policy": recoveryPolicy, "./orders": { updateOrderStatus: async (q: any) => { transitions.push(q); } } }, `\nexports.dispatch = dispatch${provider === "stripe" ? "Stripe" : provider === "square" ? "Square" : "PayPal"}Event;`);
  return { api, writes, transitions, payment };
}
test("foreign provider session/order metadata cannot authorize gallery delivery", async () => {
  const stripe = webhookHarness("stripe");
  const session = { ...stripeSession, object: "checkout.session", status: "complete", payment_status: "paid", payment_intent: "pi" };
  await assert.rejects(stripe.api.dispatch({ type: "checkout.session.completed", data: { object: { ...session, id: "foreign-session" } } }), /does not match/);
  assert.equal(stripe.writes.length, 0); await stripe.api.dispatch({ type: "checkout.session.completed", data: { object: session } }); assert.equal(stripe.transitions.length, 1);
  const paypal = webhookHarness("paypal");
  const capture = { id: "capture", custom_id: "pay-1", status: "COMPLETED", amount: { value: "20.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id: "foreign" } } };
  await assert.rejects(paypal.api.dispatch({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: capture }), /does not match/); assert.equal(paypal.writes.length, 0);
  capture.supplementary_data.related_ids.order_id = "session-1"; await paypal.api.dispatch({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: capture }); assert.equal(paypal.transitions.length, 1);
  const square = webhookHarness("square");
  const squarePayment = { id: "square-payment", status: "COMPLETED", order_id: "foreign", amount_money: { amount: 2000, currency: "USD" } };
  await assert.rejects(square.api.dispatch({ type: "payment.updated", data: { object: { payment: squarePayment } } }), /does not match/); assert.equal(square.writes.length, 0);
  squarePayment.order_id = "square-order"; await square.api.dispatch({ type: "payment.updated", data: { object: { payment: squarePayment } } }); assert.equal(square.transitions.length, 1); assert.equal(square.writes[0].data.rawSummary.checkoutSession.orderId, "square-order");
});
test("late gallery failure events never cancel the order or overwrite verified paid attempts", async () => {
  const stripe = webhookHarness("stripe");
  await stripe.api.dispatch({ type: "checkout.session.expired", data: { object: { ...stripeSession, object: "checkout.session" } } });
  assert.equal(stripe.transitions.length, 0); assert.deepEqual(Array.from(stripe.writes[0].where.status.notIn), ["PAID", "REFUNDED"]);
  const paypal = webhookHarness("paypal");
  await paypal.api.dispatch({ event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "capture", custom_id: "pay-1", supplementary_data: { related_ids: { order_id: "session-1" } } } });
  assert.equal(paypal.transitions.length, 0); assert.deepEqual(Array.from(paypal.writes[0].where.status.notIn), ["PAID", "REFUNDED"]);
});

test("lost Stripe fallback response cannot mint a second session when primary methods later activate", async () => {
  class FakeStripeError extends Error { type = "StripeInvalidRequestError"; param = "payment_method_types"; }
  const api = load("lib/commerce/stripe.ts", { stripe: { errors: { StripeError: FakeStripeError } } }, "\nexports.createResilient = createResilientCheckoutSession;");
  const keys: string[] = []; let saved: string | null = null; let sessions = 0; let activated = false;
  const stripe = { checkout: { sessions: { create: async (params: any, options: any) => {
    keys.push(options.idempotencyKey); const fingerprint = JSON.stringify(params);
    if (saved) { if (saved !== fingerprint) throw new Error("idempotency parameter mismatch"); return { id: "same-session" }; }
    if (params.payment_method_types.includes("cashapp") && !activated) throw new FakeStripeError("payment method type cashapp unavailable");
    saved = fingerprint; sessions++; throw new Error("provider response lost");
  } } } };
  const params = { payment_method_types: ["card", "cashapp"] };
  await assert.rejects(api.createResilient(stripe, params, "gallery_order_payment"), /response lost/);
  activated = true;
  await assert.rejects(api.createResilient(stripe, params, "gallery_order_payment"), /parameter mismatch/);
  assert.equal(sessions, 1); assert.equal(new Set(keys).size, 1);
});

test("gallery gateway creation requires a persisted bounded attempt and refuses an existing session", () => {
  const fresh = { externalCheckoutSession: null, rawSummary: { galleryCheckoutAttempt: { startedAt: new Date().toISOString() } } };
  assert.doesNotThrow(() => recoveryPolicy.assertGalleryCheckoutCreation(fresh));
  for (const payment of [{ ...fresh, externalCheckoutSession: "existing" }, { ...fresh, rawSummary: {} }, { ...fresh, rawSummary: { galleryCheckoutAttempt: { startedAt: new Date(0).toISOString() } } }]) assert.throws(() => recoveryPolicy.assertGalleryCheckoutCreation(payment), /verify the previous checkout/);
});

test("Square refund arriving before payment stays retryable and revokes on replay after payment binding", async () => {
  let revoked = false;
  const payment: any = { id: "pay-1", orderId: "order-1", status: "PENDING", currency: "USD", amountCents: 2000, externalPaymentId: "square-order", rawSummary: { checkoutSession: { orderId: "square-order" } }, order: { siteId: "site", totalCents: 2000, currency: "USD", gallerySelectionPurchase: { id: "purchase" } } };
  const db = { payment: {
    findFirst: async ({ where }: any) => where.externalPaymentId ? where.externalPaymentId === payment.externalPaymentId ? payment : null : payment,
    update: async ({ data }: any) => Object.assign(payment, data)
  }, billingPayment: { findFirst: async () => null } };
  const api = load("lib/commerce/square.ts", { "@/lib/prisma": { prisma: db }, "@/lib/portfolio/checkout-recovery-policy": recoveryPolicy,
    "@/lib/portfolio/refunds": { revokeGalleryPurchaseForRefund: async () => { revoked = true; } }, "./orders": { updateOrderStatus: async () => {} }
  }, "\nexports.dispatch = dispatchSquareEvent;");
  const refund = { type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "square-payment", status: "COMPLETED", amount_money: { amount: 100, currency: "USD" } } } } };
  await assert.rejects(api.dispatch(refund), /retry after payment reconciliation/); assert.equal(revoked, false);
  await api.dispatch({ type: "payment.updated", data: { object: { payment: { id: "square-payment", order_id: "square-order", status: "COMPLETED", amount_money: { amount: 2000, currency: "USD" } } } } });
  await api.dispatch(refund); assert.equal(revoked, true);
});

test("all gateways choose the newest gallery attempt and preserve ordinary commerce's original choice", async () => {
  for (const provider of ["stripe", "paypal", "square"] as const) for (const gallery of [true, false]) {
    const old = { id: "old-payment", createdAt: new Date(0), externalCheckoutSession: null, externalPaymentId: null, rawSummary: {} };
    const latest = { ...old, id: "latest-payment", createdAt: new Date(), rawSummary: { galleryCheckoutAttempt: { startedAt: new Date().toISOString() } } };
    const order: any = { id: "order-1", siteId: "site", orderNumber: "PHOTO-1", status: "PENDING", totalCents: 2000, currency: "USD", customerEmail: "synthetic@example.invalid", notes: "", payments: [old], gallerySelectionPurchase: gallery ? { id: "purchase" } : null,
      items: [{ name: "Extra photos", quantity: 1, unitPriceCents: 2000, lineTotalCents: 2000 }], discountCents: 0, giftCardCreditCents: 0, shippingCents: 0, taxCents: 0 };
    const writes: any[] = []; const requests: any[] = []; let lookups = 0; let persistenceCalls = 0;
    const db = {
      order: { findFirst: async () => order, findUniqueOrThrow: async () => order, update: async (q: any) => { writes.push(q); return order; }, updateMany: async (q: any) => { writes.push(q); return { count: 1 }; } },
      payment: { findFirst: async (q: any) => { lookups++; assert.equal(q.orderBy[0].createdAt, "desc"); return latest; }, create: async () => { throw new Error("Unexpected payment creation"); }, update: async (q: any) => { writes.push(q); return old; }, updateMany: async (q: any) => { writes.push(q); return { count: 1 }; } },
      $transaction: async (queries: any[]) => Promise.all(queries)
    };
    class FakeStripe { checkout = { sessions: { create: async (body: any, options: any) => { requests.push({ body, options }); return { id: "session", url: "https://provider.example/pay" }; } } }; }
    const credential = { clientId: "fixture", clientSecret: "fixture", merchantId: "merchant", environment: "SANDBOX", metadata: { locationId: "location" } };
    const api = load(`lib/commerce/${provider}.ts`, {
      "@/lib/portfolio/checkout-persistence": { persistGalleryHostedCheckout: async (input: any) => { persistenceCalls++; writes.push({ where: { id: input.orderId }, data: input.orderData }, { where: { id: input.paymentId }, data: input.paymentData }); return true; } },
      stripe: FakeStripe, "@/lib/prisma": { prisma: db }, "@/lib/env": { publicAppBaseUrl: () => "https://site.invalid" }, "@/lib/portfolio/checkout-recovery-policy": recoveryPolicy,
      "@/lib/payments/methods": { resolveStripeCheckoutPaymentMethods: async () => ({ paymentMethodTypes: ["card"], enabledKeys: [], cardWallets: [] }) },
      "@/lib/payments/provider-onboarding": { paypalApiBaseUrl: () => "https://provider.invalid", squareApiBaseUrl: () => "https://provider.invalid" },
      "@/lib/payments/credentials": { getStripeApiKeyForSite: async () => "fixture", getPayPalCredentialsForSite: async () => credential, getConnectedGatewayCredential: async () => credential, getSquareAccessToken: async () => ({ accessToken: "fixture", environment: "SANDBOX" }) },
      "@/lib/payments/connect/square-refresh": { isSquareCredentialUsable: () => true }
    }, "", { fetch: async (url: string, init: any) => {
      const token = url.endsWith("/token"); if (!token) requests.push({ body: JSON.parse(init.body), options: init });
      const body = token ? { access_token: "synthetic" } : provider === "paypal" ? { id: "session", links: [{ rel: "approve", href: "https://provider.example/pay" }] } : { payment_link: { id: "link", order_id: "square-order", url: "https://provider.example/pay" } };
      return { ok: true, text: async () => JSON.stringify(body) };
    } });
    await api[`create${provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : "Square"}CheckoutSessionForOrder`](order.id, "site");
    const selected = gallery ? latest.id : old.id;
    assert.equal(lookups, gallery ? 1 : 0); assert.equal(writes[1].where.id, selected);
    if (provider === "stripe") assert.equal(requests[0].body.metadata.paymentId, selected);
    if (provider === "paypal") assert.equal(requests[0].body.purchase_units[0].custom_id, selected);
    if (provider === "square") assert.equal(requests[0].body.idempotency_key, `order_order-1_${selected}`);
    assert.equal(persistenceCalls, gallery ? 1 : 0);
  }
});

test("untracked legacy setup remains blocked after lease cleanup and repeated retry clicks", async () => {
  const h = recoveryHarness({ noSession: true }); h.purchase.checkoutStartedAt = new Date(Date.now() - 10 * 60 * 1000);
  for (let retry = 0; retry < 2; retry++) await assert.rejects(h.api.recoverGalleryCheckout(request), /could not be verified safely/);
  assert.ok(!h.calls.includes("create-provider")); assert.equal(h.order.payments.length, 1); assert.equal(h.payment.rawSummary.galleryCheckoutAttempt.legacyUnverified, true);
});

test("provider responses lock then re-read latest attempt and never regress paid/refunded/replaced checkout", async () => {
  for (const changed of ["none", "newer", "paid", "refunded", "revoked", "different-session"]) {
    const calls: string[] = [];
    const latest = { id: "pay-1", status: "PENDING", providerVerifiedAt: null as Date | null, refundedCents: 0, externalCheckoutSession: null as string | null };
    const purchase = { orderId: "order-1", clientId: "client", revokedAt: null as Date | null };
    const db: any = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join(""); calls.push(sql.includes('"PortfolioSelectionPurchase"') ? "lock-purchase" : sql.includes('"Order"') ? "lock-order" : "lock-payments");
        // Simulate a renewal/paid/refund transaction completing while this
        // provider response waited for the shared purchase lock.
        if (sql.includes('"PortfolioSelectionPurchase"')) {
          if (changed === "newer") latest.id = "pay-2";
          if (changed === "paid") { latest.status = "PAID"; latest.providerVerifiedAt = new Date(); }
          if (changed === "refunded") latest.refundedCents = 1;
          if (changed === "revoked") purchase.revokedAt = new Date();
          if (changed === "different-session") latest.externalCheckoutSession = "other-session";
        }
        return [];
      },
      portfolioSelectionPurchase: { findFirst: async () => { calls.push("read-purchase"); return purchase; } },
      order: { findFirst: async () => { calls.push("read-order"); return { status: "PENDING" }; }, update: async () => { calls.push("write-order"); } },
      payment: { findFirst: async () => { calls.push("read-latest"); return latest; }, update: async () => { calls.push("write-payment"); } }
    };
    db.$transaction = (fn: any) => fn(db);
    const api = load("lib/portfolio/checkout-persistence.ts", { "@/lib/prisma": { prisma: db } });
    const saved = await api.persistGalleryHostedCheckout({ purchaseId: "purchase", orderId: "order-1", paymentId: "pay-1", siteId: "site", orderData: { checkoutUrl: "https://provider.example/new" }, paymentData: { status: "PENDING", externalCheckoutSession: "session" } });
    assert.equal(saved, changed === "none"); assert.equal(calls.includes("write-payment"), changed === "none");
    assert.equal(calls[0], "lock-purchase");
    if (changed !== "revoked") assert.ok(calls.indexOf("lock-payments") < calls.indexOf("read-latest"));
  }
});

test("pending refund reservation holds renewal without permanently revoking a failed refund", async () => {
  const h = recoveryHarness(); h.payment.refundedCents = 1;
  assert.equal((await h.api.recoverGalleryCheckout(request)).status, "BLOCKED");
  assert.ok(!h.calls.includes("inspect")); assert.ok(!h.calls.includes("create-provider"));
  assert.equal(h.purchase.revokedAt, null);
  h.payment.refundedCents = 0;
  await h.api.recoverGalleryCheckout(request);
  assert.ok(h.calls.includes("create-provider"));
});
