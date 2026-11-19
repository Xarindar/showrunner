import "server-only";

import { BillingDocumentStatus, BookingStatus, type BillingPayment, type PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { enqueueBookingPaymentNotification } from "@/lib/bookings/payment-notifications";
import { prisma } from "@/lib/prisma";

const PAID_STATUSES = [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] satisfies PaymentStatus[];
const PENDING_PAYMENT_RESERVATION_MS = 30 * 60 * 1000;

export type BillingPaymentSummary = {
  paidCents: number;
  reservedCents: number;
  remainingCents: number;
};

export async function persistBillingCheckout(
  document: { id: string; siteId: string; bookingId: string | null; status: BillingDocumentStatus; totalCents: number },
  paymentId: string,
  checkout: Pick<Prisma.BillingDocumentUpdateManyMutationInput, "checkoutProvider" | "checkoutUrl" | "paymentExternalReference">,
  attempt: Pick<Prisma.BillingPaymentUpdateManyMutationInput, "externalCheckoutSession" | "externalOrderId" | "rawSummary">,
  recoveryOnly = false
) {
  const available = await prisma.$transaction(async (tx) => {
    const savedAttempt = await tx.billingPayment.updateMany({
      where: { id: paymentId, billingDocumentId: document.id, status: PaymentStatus.PENDING, externalCheckoutSession: null },
      data: attempt
    });
    if (!savedAttempt.count) {
      const current = await tx.billingPayment.findUnique({ where: { id: paymentId } });
      if (current?.status !== PaymentStatus.PENDING || !attempt.externalCheckoutSession ||
          current.externalCheckoutSession !== attempt.externalCheckoutSession) return false;
    }
    if (recoveryOnly) return true;
    const savedDocument = await tx.billingDocument.updateMany({
      where: {
        id: document.id,
        siteId: document.siteId,
        status: document.status,
        totalCents: document.totalCents,
        ...(document.bookingId ? {
          booking: { status: BookingStatus.PENDING, startsAt: { gt: new Date() } },
          OR: [{ dueAt: null }, { dueAt: { gt: new Date() } }]
        } : {})
      },
      data: checkout
    });
    return Boolean(savedDocument.count);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!available) throw new Error("The billing checkout is no longer available.");
}

export async function reserveBillingCheckout(
  tx: Prisma.TransactionClient,
  document: { id: string; bookingId: string | null; dueAt: Date | null; totalCents: number; currency: string; payments: BillingPayment[] },
  amountCents: number,
  provider: PaymentProvider,
  checkoutAccountKey: string,
  recoveryOnly = false
) {
  if (!recoveryOnly) await assertBookingCheckout(tx, document, amountCents);
  if (document.bookingId) {
    const pending = document.payments.find((payment) => payment.status === PaymentStatus.PENDING);
    if (pending?.checkoutOperation && !pending.externalCheckoutSession) {
      if (pending.provider !== provider || pending.amountCents !== amountCents || pending.checkoutAccountKey !== checkoutAccountKey ||
          pending.createdAt.getTime() < Date.now() - 4 * 60 * 60_000) {
        throw new Error("The existing checkout requires reconciliation.");
      }
      return pending;
    }
  }
  if (recoveryOnly) throw new Error("The pending checkout operation changed.");
  const summary = await getBillingPaymentSummary(tx, document.id, { reservePending: true });
  if (amountCents <= 0 || amountCents > document.totalCents - summary.reservedCents) {
    throw new Error("Payment amount must be greater than zero and no more than the remaining balance.");
  }
  return tx.billingPayment.create({
    data: { billingDocumentId: document.id, provider, amountCents, currency: document.currency, checkoutOperation: Boolean(document.bookingId), checkoutAccountKey }
  });
}

export async function assertBookingCheckout(
  tx: Prisma.TransactionClient,
  document: { bookingId: string | null; dueAt: Date | null; totalCents: number; payments: { status: PaymentStatus; externalCheckoutSession: string | null }[] },
  amountCents: number
) {
  if (!document.bookingId) return;
  const booking = await tx.booking.findUnique({ where: { id: document.bookingId }, select: { status: true, startsAt: true } });
  const now = new Date();
  if (booking?.status !== BookingStatus.PENDING || booking.startsAt <= now || (document.dueAt && document.dueAt <= now)) {
    throw new Error("This booking hold expired.");
  }
  if (amountCents !== document.totalCents) throw new Error("Booking payments must cover the total due.");
  if (document.payments.some((payment) => payment.status === PaymentStatus.PENDING && payment.externalCheckoutSession)) {
    throw new Error("This booking already has an active checkout.");
  }
}

export async function getBillingPaymentSummary(
  tx: Prisma.TransactionClient,
  billingDocumentId: string,
  options: { reservePending?: boolean; now?: Date } = {}
): Promise<BillingPaymentSummary> {
  const document = await tx.billingDocument.findUnique({
    where: { id: billingDocumentId },
    select: { totalCents: true }
  });

  if (!document) throw new Error("Billing document not found.");

  const paid = await tx.billingPayment.aggregate({
    where: {
      billingDocumentId,
      status: { in: PAID_STATUSES }
    },
    _sum: { amountCents: true }
  });
  const pending = options.reservePending
    ? await tx.billingPayment.aggregate({
        where: {
          billingDocumentId,
          status: PaymentStatus.PENDING,
          createdAt: {
            gte: new Date((options.now || new Date()).getTime() - PENDING_PAYMENT_RESERVATION_MS)
          }
        },
        _sum: { amountCents: true }
      })
    : null;

  const paidCents = paid._sum.amountCents || 0;
  const reservedCents = paidCents + (pending?._sum.amountCents || 0);
  return {
    paidCents,
    reservedCents,
    remainingCents: Math.max(0, document.totalCents - paidCents)
  };
}

export async function settleBillingPayment(input: {
  billingPaymentId: string;
  externalCheckoutSession?: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  hostedReceiptUrl?: string;
  capturedAt?: Date;
  rawSummary?: Prisma.InputJsonValue;
  siteId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.billingPayment.findFirst({
      where: {
        id: input.billingPaymentId,
        billingDocument: { siteId: input.siteId }
      },
      include: { billingDocument: { include: { booking: { include: { service: true } } } } }
    });

    if (!payment) throw new Error("Billing payment target not found.");
    if ((input.externalCheckoutSession && payment.externalCheckoutSession && input.externalCheckoutSession !== payment.externalCheckoutSession) ||
      (input.externalOrderId && payment.externalOrderId && input.externalOrderId !== payment.externalOrderId) ||
      (input.externalPaymentId && payment.externalPaymentId && input.externalPaymentId !== payment.externalPaymentId &&
        payment.externalPaymentId !== input.externalOrderId)) {
      throw new Error("Billing payment identity changed.");
    }
    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.AUTHORIZED) {
      return {
        rejected: false,
        summary: await getBillingPaymentSummary(tx, payment.billingDocumentId)
      };
    }
    if (payment.status === PaymentStatus.REFUNDED || isRejectedCapturedPayment(payment)) {
      return { rejected: true, summary: await getBillingPaymentSummary(tx, payment.billingDocumentId) };
    }

    const beforeSettle = await getBillingPaymentSummary(tx, payment.billingDocumentId);
    const booking = payment.billingDocument.booking;
    const capturedAfterStart = booking && input.capturedAt && Number.isFinite(input.capturedAt.getTime()) && input.capturedAt >= booking.startsAt;
    const closedBooking = payment.billingDocument.bookingId && (
      !booking || booking.status !== BookingStatus.PENDING ||
      payment.billingDocument.status !== BillingDocumentStatus.SENT || capturedAfterStart
    );
    if (closedBooking || beforeSettle.remainingCents <= 0 || payment.amountCents > beforeSettle.remainingCents) {
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          externalCheckoutSession: input.externalCheckoutSession || payment.externalCheckoutSession,
          externalOrderId: input.externalOrderId || payment.externalOrderId,
          externalPaymentId: input.externalPaymentId || payment.externalPaymentId,
          hostedReceiptUrl: input.hostedReceiptUrl || payment.hostedReceiptUrl,
          captureRejectionReason: capturedAfterStart ? "captured_after_start" : closedBooking ? "booking_closed" : REJECTED_OVERPAYMENT_REASON,
          rawSummary: {
            ...(typeof input.rawSummary === "object" && input.rawSummary && !Array.isArray(input.rawSummary) ? input.rawSummary : {}),
            rejectedReason: "payment_would_exceed_remaining_balance",
            ...(closedBooking ? { bookingClosed: true } : {}),
            remainingCentsBeforeSettle: beforeSettle.remainingCents,
            attemptedAmountCents: payment.amountCents
          },
          status: PaymentStatus.FAILED
        }
      });

      return {
        rejected: true,
        summary: beforeSettle
      };
    }

    await tx.billingPayment.update({
      where: { id: payment.id },
      data: {
        externalCheckoutSession: input.externalCheckoutSession || payment.externalCheckoutSession,
        externalOrderId: input.externalOrderId || payment.externalOrderId,
        externalPaymentId: input.externalPaymentId || payment.externalPaymentId,
        hostedReceiptUrl: input.hostedReceiptUrl || payment.hostedReceiptUrl,
        ...(input.rawSummary === undefined ? {} : { rawSummary: input.rawSummary }),
        status: PaymentStatus.PAID
      }
    });

    const summary = await getBillingPaymentSummary(tx, payment.billingDocumentId);
    const shouldMarkPaid =
      summary.remainingCents === 0 &&
      payment.billingDocument.status !== BillingDocumentStatus.PAID &&
      payment.billingDocument.status !== BillingDocumentStatus.VOID;

    if (shouldMarkPaid) {
      if (booking) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.CONFIRMED }
        });
        await enqueueBookingPaymentNotification(tx, payment.billingDocumentId, "confirmation");
      }
      await tx.billingDocument.update({
        where: { id: payment.billingDocumentId },
        data: {
          status: BillingDocumentStatus.PAID,
          acceptedAt: payment.billingDocument.acceptedAt || new Date(),
          paidAt: payment.billingDocument.paidAt || new Date()
        }
      });
    }

    if (payment.billingDocument.status !== BillingDocumentStatus.DRAFT) {
      await snapshotBillingDocument(tx, payment.billingDocumentId);
    }

    return {
      rejected: false,
      summary
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });



  return result.summary;
}

export const REJECTED_OVERPAYMENT_REASON = "payment_would_exceed_remaining_balance";

export function isRejectedCapturedPayment(payment: {
  captureRejectionReason?: string;
  externalPaymentId: string | null;
  rawSummary: Prisma.JsonValue;
  refundedCents: number;
  status: PaymentStatus;
}) {
  if (payment.status !== PaymentStatus.FAILED) return false;
  if (!payment.externalPaymentId) return false;
  if (payment.captureRejectionReason) return true;

  const rawSummary = payment.rawSummary;
  return (
    typeof rawSummary === "object" &&
    rawSummary !== null &&
    !Array.isArray(rawSummary) &&
    rawSummary.rejectedReason === REJECTED_OVERPAYMENT_REASON
  );
}

export async function markBillingPaymentFailed(input: {
  billingPaymentId: string;
  externalCheckoutSession?: string;
  externalPaymentId?: string;
  rawSummary?: Prisma.InputJsonValue;
  siteId: string;
}) {
  await prisma.billingPayment.updateMany({
    where: {
      id: input.billingPaymentId,
      billingDocument: { siteId: input.siteId },
      status: PaymentStatus.PENDING,
      ...(input.externalCheckoutSession ? { externalCheckoutSession: input.externalCheckoutSession } : {})
    },
    data: {
      externalCheckoutSession: input.externalCheckoutSession,
      rawSummary: input.rawSummary ?? {},
      status: PaymentStatus.FAILED
    }
  });
}
