import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function load<T>(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const require = createRequire(resolve(file));
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, { exports, require: (id: string) => mocks[id] ?? require(id), Date, console, URL, process, ...globals });
  return exports as T;
}

test("booking rate limits admit at most six concurrent submissions per site and identity", {
  skip: !process.env.BOOKING_TEST_DATABASE_URL
}, async () => {
  const url = new URL(process.env.BOOKING_TEST_DATABASE_URL!);
  assert(["127.0.0.1", "localhost"].includes(url.hostname));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  const tenantId = `booking-fixture-${crypto.randomUUID()}`;
  const siteA = `${tenantId}-a`;
  const siteB = `${tenantId}-b`;
  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: "Synthetic merchant", sites: {
      create: [{ id: siteA, slug: "a", name: "Merchant A" }, { id: siteB, slug: "b", name: "Merchant B" }]
    } } });
    const { publicRateLimitForSite } = load<typeof import("../lib/public-rate-limit")>("lib/public-rate-limit.ts", {
      "server-only": {},
      "@/lib/prisma": { prisma },
      "@/lib/site": {}
    });
    const submit = (siteId = siteA, identifier = "synthetic-a") => publicRateLimitForSite(siteId, "booking", { identifier, limit: 6 });
    const admitted = async (siteId?: string, identifier?: string) => (await Promise.all(
      Array.from({ length: 24 }, () => submit(siteId, identifier))
    )).filter((result) => !result).length;
    assert.equal(await admitted(), 6);
    assert.equal(await admitted(), 0);
    assert.equal(await admitted(siteB), 6);
    assert.equal(await admitted(siteA, "synthetic-b"), 6);
    await prisma.publicRateLimit.updateMany({
      where: { siteId: siteA, identifier: "synthetic-a" },
      data: { count: 2, windowStart: new Date(Date.now() - 601_000) }
    });
    assert.equal(await admitted(), 6);
    assert.equal(await prisma.publicRateLimit.count({ where: { siteId: { in: [siteA, siteB] }, count: 6 } }), 3);
  } finally {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});

test("PostgreSQL isolates merchant delivery, preserves capture state, and retries booking fulfillment and refunds", {
  skip: !process.env.BOOKING_TEST_DATABASE_URL
}, async () => {
  const url = new URL(process.env.BOOKING_TEST_DATABASE_URL!);
  assert(["127.0.0.1", "localhost"].includes(url.hostname));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  const tenantId = `payments-${crypto.randomUUID()}`;
  const siteA = `${tenantId}-a`;
  const siteB = `${tenantId}-b`;
  const core = { "server-only": {}, "@/lib/prisma": { prisma }, "@/lib/site": {} };
  let failMail = true;
  let failDelivery = true;
  const delivery = load<typeof import("../lib/events/webhook-delivery")>("lib/events/webhook-delivery.ts", core);
  const emit = load<typeof import("../lib/events/emit")>("lib/events/emit.ts", {
    ...core,
    "@/modules/communications/auto-send": {},
    "@/lib/events/webhook-delivery": { queueWebhookDelivery: (...args: Parameters<typeof delivery.queueWebhookDelivery>) => {
      if (failDelivery) throw new Error("Synthetic webhook enqueue outage");
      return delivery.queueWebhookDelivery(...args);
    } }
  });
  const queue = load<typeof import("../lib/email/queue")>("lib/email/queue.ts", {
    ...core,
    "@/lib/site": { getSiteSettingsForSite: async (siteId: string) => ({ siteId }) },
    "./recipients": {},
    "./sender": { resolveSender: async () => ({ fromName: "Synthetic merchant", fromEmail: "booking@example.test", replyToEmail: "booking@example.test" }) },
    "./render": { renderEmailTemplate: async () => {
      if (failMail) throw new Error("Synthetic enqueue outage");
      return { subject: "Synthetic booking", previewText: "", htmlBody: "Booking", textBody: "Booking" };
    } },
    "./customer-brand": { customerEmailBrand: async () => ({}) }
  });
  const notificationMocks = {
    ...core, "@/lib/events/emit": emit, "@/lib/billing/documents": { publicBillingUrl: () => "https://example.test/billing/synthetic" },
    "@/lib/email": {
      queueBookingCreatedEmails: async (booking: { id: string; siteId: string; customerEmail: string }, retryOnError: boolean) =>
        queue.queueEmail({ siteId: booking.siteId, recipientEmail: booking.customerEmail, templateKey: "test.confirmation",
          category: "TRANSACTIONAL", tokens: {}, relatedId: booking.id, idempotencyKey: `fixture-confirmed:${booking.id}`, retryOnError })
    }
  };
  const notifications = load<typeof import("../lib/bookings/payment-notifications")>("lib/bookings/payment-notifications.ts", notificationMocks);
  const paymentApi = load<typeof import("../lib/billing/payments")>("lib/billing/payments.ts", {
    ...core,
    "@/lib/billing/documents": { snapshotBillingDocument: async () => {} },
    "@/lib/bookings/payment-notifications": notifications
  });
  const refunds = load<typeof import("../lib/billing/refund-ledger")>("lib/billing/refund-ledger.ts", {
    ...core, "./payments": paymentApi
  }, { crypto });
  const square = load<typeof import("../lib/commerce/square")>("lib/commerce/square.ts", {
    ...core, "@/lib/billing/payments": paymentApi, "@/lib/billing/refund-ledger": refunds,
    "@/lib/billing/documents": {}, "@/lib/payments/credentials": {}, "./orders": {},
    "@/lib/portfolio/checkout-persistence": {}, "@/lib/portfolio/checkout-recovery-policy": {},
    "@/lib/portfolio/refunds": {}, "@/lib/payments/provider-onboarding": {}, "@/lib/payments/connect/square-refresh": {}
  });
  try {
    const now = Date.now();
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: "Synthetic merchants", sites: {
      create: [{ id: siteA, slug: "a", name: "Merchant A" }, { id: siteB, slug: "b", name: "Merchant B" }]
    } } });
    const appointments = await Promise.all([siteA, siteB].map(async (siteId) => {
      const service = await prisma.service.create({ data: { siteId, name: "Synthetic session", durationMinutes: 60 } });
      await prisma.automation.create({ data: { siteId, name: "Fixture automation", trigger: "BOOKING_CREATED", status: "ACTIVE" } });
      await prisma.webhookEndpoint.create({ data: {
        siteId, name: "Fixture subscriber", url: "https://example.test/booking", signingSecret: "synthetic",
        status: "ACTIVE", events: ["booking.created"]
      } });
      await prisma.messageTemplate.create({ data: {
        siteId, key: "test.confirmation", name: "Fixture confirmation", channel: "EMAIL", subject: "Fixture", body: "Fixture"
      } });
      const booking = await prisma.booking.create({ data: {
        siteId, serviceId: service.id, customerName: "Fixture", customerEmail: "booking@example.test",
        startsAt: new Date(now + 3_600_000), endsAt: new Date(now + 7_200_000)
      } });
      const invoice = await prisma.billingDocument.create({ data: {
        siteId, bookingId: booking.id, status: "SENT", documentNumber: "fixture", customerName: "Fixture",
        customerEmail: booking.customerEmail, totalCents: 1000, payments: {
          create: [
            { provider: "SQUARE", amountCents: 1000, externalCheckoutSession: "link", externalOrderId: "shared-order" },
            { provider: "SQUARE", amountCents: 1000, externalCheckoutSession: "other-link", externalOrderId: "other-order" }
          ]
        }
      }, include: { payments: true } });
      return { booking, invoice, paymentId: invoice.payments.find(({ externalOrderId }) => externalOrderId === "shared-order")!.id };
    }));
    const [a, b] = appointments;
    const capture = (eventId: string, id: string, orderId: string) => ({
      event_id: `${tenantId}:${eventId}`, merchant_id: "synthetic-merchant", type: "payment.updated",
      data: { object: { payment: { id, order_id: orderId, status: "COMPLETED", amount_money: { amount: 1000, currency: "USD" } } } }
    });
    const primary = capture("capture", "shared-capture", "shared-order");
    const duplicate = capture("poll", "shared-capture", "shared-order");
    await Promise.allSettled([square.handleSquareWebhookEvent(primary, siteA), square.handleSquareWebhookEvent(duplicate, siteA)]);
    await square.handleSquareWebhookEvent(primary, siteA);
    await square.handleSquareWebhookEvent(duplicate, siteA);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: a.booking.id } })).status, "CONFIRMED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.booking.id } })).status, "PENDING");
    assert.equal(await prisma.bookingPaymentNotification.count({ where: { billingDocumentId: a.invoice.id } }), 1);
    assert.equal(await prisma.billingPayment.count({ where: { billingDocumentId: a.invoice.id, status: "PAID" } }), 1);
    await assert.rejects(square.handleSquareWebhookEvent(capture("contradictory", "shared-capture", "other-order"), siteA));
    const preUpgrade = capture("historical", "legacy-capture", "other-order");
    await prisma.squareWebhookEvent.create({ data: { eventId: preUpgrade.event_id, type: preUpgrade.type, status: "PROCESSED" } });
    assert.equal((await square.handleSquareWebhookEvent(preUpgrade, siteB)).duplicate, true);

    await notifications.processBookingPaymentNotifications();
    assert.equal(await prisma.bookingPaymentNotification.count({ where: { billingDocumentId: a.invoice.id, completedAt: null } }), 1);
    assert.equal(await prisma.analyticsEvent.count({ where: { siteId: siteA } }), 0);
    failMail = false;
    await prisma.bookingPaymentNotification.updateMany({ where: { billingDocumentId: a.invoice.id }, data: { nextAttemptAt: new Date(0) } });
    await notifications.processBookingPaymentNotifications();
    assert.equal(await prisma.emailOutbox.count({ where: { siteId: siteA, relatedId: a.booking.id } }), 1);
    assert.equal(await prisma.analyticsEvent.count({ where: { siteId: siteA } }), 0);
    failDelivery = false;
    await prisma.bookingPaymentNotification.updateMany({ where: { billingDocumentId: a.invoice.id }, data: { nextAttemptAt: new Date(0) } });
    const restarted = load<typeof import("../lib/bookings/payment-notifications")>("lib/bookings/payment-notifications.ts", notificationMocks);
    await Promise.all([restarted.processBookingPaymentNotifications(), notifications.processBookingPaymentNotifications()]);
    assert.equal(await prisma.emailOutbox.count({ where: { siteId: siteA, relatedId: a.booking.id } }), 1);
    assert.equal(await prisma.analyticsEvent.count({ where: { siteId: siteA, relatedId: a.booking.id } }), 1);
    assert.equal(await prisma.automationRun.count({ where: { automation: { siteId: siteA }, relatedId: a.booking.id } }), 1);
    assert.equal(await prisma.webhookDelivery.count({ where: { webhookEndpoint: { siteId: siteA } } }), 1);
    assert.equal(await prisma.webhookDelivery.count({ where: { webhookEndpoint: { siteId: siteB } } }), 0);

    const late = await prisma.billingPayment.create({ data: { billingDocumentId: a.invoice.id, amountCents: 1000, provider: "SQUARE" } });
    await assert.rejects(paymentApi.persistBillingCheckout(a.invoice, late.id, {
      checkoutProvider: "SQUARE", checkoutUrl: "https://square.link/u/synthetic", paymentExternalReference: "late-order"
    }, { externalCheckoutSession: "late-link", externalOrderId: "late-order" }));
    assert.equal((await prisma.billingPayment.findUniqueOrThrow({ where: { id: late.id } })).externalOrderId, "late-order");
    assert.equal((await prisma.billingDocument.findUniqueOrThrow({ where: { id: a.invoice.id } })).status, "PAID");

    await prisma.booking.update({ where: { id: b.booking.id }, data: { status: "CANCELED" } });
    await square.handleSquareWebhookEvent(primary, siteB);
    const rejected = await prisma.billingPayment.findUniqueOrThrow({ where: { id: b.paymentId } });
    assert.equal(rejected.captureRejectionReason, "booking_closed");
    await paymentApi.markBillingPaymentFailed({ billingPaymentId: b.paymentId, siteId: siteB, externalPaymentId: "wrong" });
    const requestIds = [crypto.randomUUID(), crypto.randomUUID()];
    const reserve = (requestId: string) => refunds.reserveBillingRefund({ siteId: siteB, paymentId: b.paymentId, requestId, amountCents: 300 });
    assert((await Promise.all(requestIds.map(reserve))).every(({ created }) => created));
    assert.equal((await reserve(requestIds[0])).created, false);
    const observation = (externalRefundId: string, amountCents: number) => ({
      externalRefundId, amountCents, currency: "USD", providerCreatedAt: new Date(), status: "SUCCEEDED" as const
    });
    const refund = (value: Parameters<typeof refunds.recordBillingRefund>[3]) => refunds.recordBillingRefund(siteB, b.paymentId, "shared-capture", value);
    await refund({ ...observation("fixture-refund-a", 300), status: "PENDING", requestId: requestIds[0] });
    await refund({ ...observation("fixture-refund-a", 300), status: "FAILED", requestId: requestIds[0] });
    await refund(observation("fixture-refund-b", 300));
    await refund({ ...observation("fixture-refund-b", 300), requestId: requestIds[1] });
    await refund(observation("external-c", 200));
    await refund(observation("external-d", 500));
    await refund(observation("external-d", 500));
    const fullyRefunded = await prisma.billingPayment.findUniqueOrThrow({ where: { id: b.paymentId } });
    assert.equal(fullyRefunded.externalPaymentId, "shared-capture");
    assert.equal(fullyRefunded.refundedCents, 1000);
    assert.equal(fullyRefunded.status, "REFUNDED");
    assert.equal(fullyRefunded.captureRejectionReason, "booking_closed");
    assert.equal(await prisma.billingRefund.count({ where: { billingPaymentId: b.paymentId } }), 4);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.booking.id } })).status, "CANCELED");
  } finally {
    await prisma.squareWebhookEvent.deleteMany({ where: { eventId: { startsWith: tenantId + ":" } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});

test("approved requests receive a payment link and remain pending", async () => {
  const document = { id: "invoice", status: "DRAFT", bookingApprovalRequired: true, publicAccessToken: "booking-token" };
  const booking = { id: "booking", status: "PENDING", startsAt: new Date(Date.now() + 86400000), billingDocument: document, service: {} };
  const notifications: string[] = [];
  const tx = {
    billingDocument: {
      updateMany: async () => {
        if (document.status !== "DRAFT") return { count: 0 };
        document.status = "SENT";
        return { count: 1 };
      },
      findUniqueOrThrow: async () => document
    }
  };
  const { updateBookingStatus } = load<typeof import("../lib/bookings/status")>("lib/bookings/status.ts", {
    "server-only": {},
    "./payment": { bookingPaymentProvider: async () => "PAYPAL", bookingPaymentUrl: (token: string) => `https://booking.example/billing/${token}` },
    "@/lib/billing/documents": { snapshotBillingDocument: async () => {} },
    "./payment-notifications": { enqueueBookingPaymentNotification: async (_tx: unknown, id: string, kind: string) => { notifications.push(id + ":" + kind); } },
    "@/lib/email": {},
    "@/lib/events/emit": {},
    "@/lib/site": {},
    "@/lib/prisma": { prisma: { booking: { findFirst: async () => booking }, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
  });

  const result = await updateBookingStatus({ bookingId: "booking", status: "CONFIRMED", siteId: "owner" });
  assert.equal(result.status, "PENDING");
  assert.equal(document.status, "SENT");
  assert.deepEqual(notifications, ["invoice:approval"]);
});

test("processor settlement confirms the held slot exactly once and rejects captures on canceled bookings", async () => {
  for (const canceled of [false, true]) {
    const booking = { id: "booking", siteId: "owner", startsAt: new Date(), status: canceled ? "CANCELED" : "PENDING", service: {} };
    const document = { id: "invoice", bookingId: booking.id, status: canceled ? "VOID" : "SENT", totalCents: 30000, booking };
    const payment = { id: "payment", billingDocumentId: document.id, billingDocument: document, amountCents: 30000, status: "PENDING", refundedCents: 0, externalPaymentId: null, rawSummary: {} };
    let confirmations = 0;
    const notifications = new Set();
    const tx = {
      billingDocument: {
        findUnique: async () => document,
        update: async ({ data }: { data: { status: string } }) => Object.assign(document, data)
      },
      billingPayment: {
        findFirst: async () => payment,
        aggregate: async () => ({ _sum: { amountCents: payment.status === "PAID" ? payment.amountCents : 0 } }),
        update: async ({ data }: { data: { status: string } }) => Object.assign(payment, data)
      },
      booking: {
        update: async ({ data }: { data: { status: string } }) => { confirmations++; return Object.assign(booking, data); }
      }
    };
    const { settleBillingPayment, isRejectedCapturedPayment } = load<typeof import("../lib/billing/payments")>("lib/billing/payments.ts", {
      "server-only": {},
      "@/lib/billing/documents": { snapshotBillingDocument: async () => {} },
      "@/lib/bookings/payment-notifications": { enqueueBookingPaymentNotification: async (_tx: unknown, id: string, kind: string) => { notifications.add(id + ":" + kind); } },
      "@/lib/prisma": { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
    });
    const settlement = { billingPaymentId: payment.id, siteId: "owner", externalPaymentId: "provider-capture" };
    if (canceled) {
      await settleBillingPayment(settlement);
      await settleBillingPayment(settlement);
      assert.equal(payment.status, "FAILED");
      assert.equal(isRejectedCapturedPayment({ ...payment, status: "FAILED" }), true);
      assert.equal(confirmations, 0);
      assert.equal(notifications.size, 0);
    } else {
      await settleBillingPayment(settlement);
      await settleBillingPayment(settlement);
      assert.equal(booking.status, "CONFIRMED");
      assert.equal(document.status, "PAID");
      assert.equal(confirmations, 1);
      assert.equal(notifications.size, 1);
    }
  }
});

test("booking checkout returns the processor URL and preserves a retry link on failure", async () => {
  const token = "bdoc_" + "A".repeat(32);
  const providerUrl = "https://www.paypal.com/checkoutnow?token=fixture";
  const document = {
    id: "invoice", siteId: "owner", status: "SENT", totalCents: 25000, payments: [],
    booking: { status: "PENDING", startsAt: new Date(Date.now() + 86400000) }
  };
  let checkoutUrl = providerUrl;
  const { startBookingCheckout } = load<typeof import("../lib/bookings/payment")>("lib/bookings/payment.ts", {
    "server-only": {},
    "@/lib/billing/documents": { publicBillingUrl: (origin: string, token: string) => `${origin}/billing/${token}` },
    "@/lib/env": { publicAppBaseUrl: () => "https://booking.example" },
    "@/lib/payments/registry": { resolvePaymentProviderForSite: async () => "PAYPAL" },
    "@/lib/payments/checkout": { createPaymentCheckoutSessionForBillingDocument: async (input: { amountCents: number; siteId: string; billingDocumentId: string; provider: string }) => {
      assert.equal(input.amountCents, 25000);
      assert.equal(input.siteId, "owner");
      assert.equal(input.billingDocumentId, "invoice");
      assert.equal(input.provider, "PAYPAL");
      return { checkoutUrl };
    } },
    "@/lib/prisma": { prisma: { billingDocument: { findMany: async () => [document] } } }
  }, { console: { error: () => {} } });

  assert.equal(await startBookingCheckout(token), providerUrl);
  checkoutUrl = "http://www.paypal.com/checkoutnow?token=fixture";
  assert.equal(await startBookingCheckout(token), `https://booking.example/billing/${token}?checkout=error`);
});

test("PayPal booking checkout requests guest card entry and accepts the payer-action link", async () => {
  const providerUrl = "https://www.paypal.com/checkoutnow?token=fixture";
  const document = { bookingId: "booking", id: "invoice", siteId: "owner", status: "SENT", totalCents: 25000, currency: "USD", payments: [] };
  const tx = {
    billingDocument: { findFirst: async () => document },
    billingPayment: { create: async () => ({ id: "payment", currency: "USD", amountCents: 25000 }) }
  };
  const db = {
    $transaction: async (action: (client: typeof tx) => unknown) => action(tx)
  };
  const { createPayPalCheckoutSessionForBillingDocument } = load<typeof import("../lib/commerce/paypal")>("lib/commerce/paypal.ts", {
    "server-only": {},
    "@/lib/portfolio/checkout-persistence": {},
    "@/lib/portfolio/checkout-recovery-policy": {},
    "@/lib/portfolio/refunds": {},
    "@/lib/billing/documents": { ensureBillingPublicToken: async () => "booking-token" },
    "@/lib/billing/refund-ledger": {},
    "@/lib/billing/payments": {
      reserveBillingCheckout: async () => ({ id: "payment", currency: "USD", amountCents: 25000 }),
      persistBillingCheckout: async (_document: unknown, paymentId: string, checkout: { checkoutUrl: string }, attempt: { externalCheckoutSession: string }) => {
        assert.equal(paymentId, "payment");
        assert.equal(checkout.checkoutUrl, providerUrl);
        assert.equal(attempt.externalCheckoutSession, "fixture");
      }
    },
    "@/lib/env": { publicAppBaseUrl: () => "https://booking.example" },
    "@/lib/payments/credentials": { getPayPalCredentialsForSite: async () => ({ clientId: "fixture", clientSecret: "fixture", merchantId: "merchant", environment: "live" }) },
    "@/lib/payments/provider-onboarding": { paypalApiBaseUrl: () => "https://api-m.paypal.com" },
    "@/lib/prisma": { prisma: db },
    "@/lib/site": {},
    "./orders": {}
  }, {
    AbortSignal, Buffer, Headers, URLSearchParams,
    fetch: async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "fixture" });
      assert.equal(url, "https://api-m.paypal.com/v2/checkout/orders");
      const request = JSON.parse(String(init.body));
      assert.equal(request.payment_source.paypal.experience_context.landing_page, "GUEST_CHECKOUT");
      assert.equal(request.payment_source.paypal.experience_context.user_action, "PAY_NOW");
      assert.equal(request.purchase_units[0].amount.value, "250.00");
      assert.equal(new Headers(init.headers).get("PayPal-Request-Id"), "paypal_order_payment");
      return Response.json({ id: "fixture", links: [{ rel: "payer-action", href: providerUrl }] });
    }
  });

  const result = await createPayPalCheckoutSessionForBillingDocument({ billingDocumentId: "invoice", siteId: "owner", amountCents: 25000 });
  assert.equal(result.checkoutUrl, providerUrl);
});
