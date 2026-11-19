import "server-only";
import { closePayPalBookingCheckout } from "@/lib/commerce/paypal";
import { closeSquareBookingCheckout } from "@/lib/commerce/square";
import { closeStripeBookingCheckout } from "@/lib/commerce/stripe";
import { prisma } from "@/lib/prisma";
import { createPaymentCheckoutSessionForBillingDocument } from "@/lib/payments/checkout";
import { processBillingRefunds } from "@/lib/payments/billing-refunds";
import { releaseUnpaidBookingHolds } from "./payment";
import { processBookingPaymentNotifications } from "./payment-notifications";

export async function processExpiredBookingCheckouts() {
  const now = new Date();
  const uncertain = await prisma.billingPayment.findMany({
    where: {
      status: "PENDING", externalCheckoutSession: null, checkoutOperation: true, createdAt: { gte: new Date(now.getTime() - 4 * 60 * 60_000) },
      billingDocument: { status: "SENT", dueAt: { lte: now }, booking: { status: "PENDING" } }
    },
    include: { billingDocument: { select: { id: true, siteId: true } } },
    orderBy: { updatedAt: "asc" },
    take: 10
  });
  for (const attempt of uncertain) {
    try {
      await createPaymentCheckoutSessionForBillingDocument({
        amountCents: attempt.amountCents, billingDocumentId: attempt.billingDocument.id, siteId: attempt.billingDocument.siteId,
        provider: attempt.provider, recoveryOnly: true
      });
    } catch {
      await prisma.billingPayment.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { updatedAt: new Date() } });
      console.error("[booking-payment:checkout] could not recover provider checkout", { provider: attempt.provider, siteId: attempt.billingDocument.siteId });
    }
  }
  const attempts = await prisma.billingPayment.findMany({
    where: {
      status: "PENDING", externalCheckoutSession: { not: null },
      billingDocument: { bookingId: { not: null }, OR: [
        { booking: { status: "CANCELED" } },
        { booking: { status: "PENDING", startsAt: { lte: now } } },
        { booking: { status: "PENDING" }, dueAt: { lte: now } }
      ] }
    },
    include: { billingDocument: { select: { siteId: true } } },
    orderBy: { updatedAt: "asc" },
    take: 20
  });
  for (const attempt of attempts) {
    const siteId = attempt.billingDocument.siteId;
    const session = attempt.externalCheckoutSession;
    if (!session) continue;
    try {
      let closed = false;
      if (attempt.provider === "STRIPE") closed = await closeStripeBookingCheckout(siteId, session);
      if (attempt.provider === "SQUARE" && attempt.externalOrderId) closed = await closeSquareBookingCheckout(siteId, session, attempt.externalOrderId);
      if (attempt.provider === "PAYPAL") {
        closed = await closePayPalBookingCheckout(siteId, session, attempt.checkoutOperation && !attempt.captureStartedAt);
      }
      await prisma.billingPayment.updateMany({
        where: { id: attempt.id, status: "PENDING", externalCheckoutSession: session, captureStartedAt: attempt.captureStartedAt },
        data: closed ? { status: "FAILED" } : { updatedAt: new Date() }
      });
      if (closed) await releaseUnpaidBookingHolds(siteId, now);
    } catch {
      await prisma.billingPayment.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { updatedAt: new Date() } });
      console.error("[booking-payment:checkout] expired checkout requires reconciliation", { provider: attempt.provider, siteId });
    }
  }
}

export function startBookingPaymentMaintenance() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    await Promise.allSettled([
      processExpiredBookingCheckouts(), processBookingPaymentNotifications(), processBillingRefunds()
    ]).then((results) => {
      if (results.some(({ status }) => status === "rejected")) console.error("[booking-payment] maintenance unavailable");
      running = false;
    });
  };
  void run();
  const timer = setInterval(() => { void run(); }, 60_000);
  timer.unref();
}
