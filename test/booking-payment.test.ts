import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load<T>(file: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, { exports, require: (id: string) => mocks[id] ?? require(id), Date, console });
  return exports as T;
}

test("approved requests receive a payment link and remain pending", async () => {
  const document = { id: "invoice", status: "DRAFT", bookingApprovalRequired: true, publicAccessToken: "booking-token" };
  const booking = { id: "booking", status: "PENDING", startsAt: new Date(Date.now() + 86400000), billingDocument: document, service: {} };
  const emails: string[] = [];
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
    "@/lib/email": { queueBillingDocumentEmail: async (input: { publicUrl: string }) => { emails.push(input.publicUrl); } },
    "@/lib/events/emit": {},
    "@/lib/site": {},
    "@/lib/prisma": { prisma: { booking: { findFirst: async () => booking }, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
  });

  const result = await updateBookingStatus({ bookingId: "booking", status: "CONFIRMED", siteId: "owner" });
  assert.equal(result.status, "PENDING");
  assert.equal(document.status, "SENT");
  assert.deepEqual(emails, ["https://booking.example/billing/booking-token"]);
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
      "@/lib/email": { queueBookingCreatedEmails: async () => {} },
      "@/lib/events/emit": { emitModuleEvent: async (_name: string, event: { idempotencyKey: string }) => { notifications.add(event.idempotencyKey); } },
      "@/lib/prisma": { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
    });
    const settlement = { billingPaymentId: payment.id, siteId: "owner", externalPaymentId: "provider-capture" };
    if (canceled) {
      await assert.rejects(settleBillingPayment(settlement));
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
