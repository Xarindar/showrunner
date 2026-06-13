import "server-only";

import { BillingDocumentStatus, PaymentStatus, Prisma } from "@prisma/client";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { prisma } from "@/lib/prisma";

const PAID_STATUSES = [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] satisfies PaymentStatus[];
const PENDING_PAYMENT_RESERVATION_MS = 30 * 60 * 1000;

export type BillingPaymentSummary = {
  paidCents: number;
  reservedCents: number;
  remainingCents: number;
};

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
  externalPaymentId?: string;
  hostedReceiptUrl?: string;
  rawSummary?: Prisma.InputJsonValue;
  siteId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.billingPayment.findFirst({
      where: {
        id: input.billingPaymentId,
        billingDocument: { siteId: input.siteId }
      },
      include: { billingDocument: true }
    });

    if (!payment) throw new Error("Billing payment target not found.");
    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.AUTHORIZED) {
      return {
        rejected: false,
        summary: await getBillingPaymentSummary(tx, payment.billingDocumentId)
      };
    }
    if (payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.FAILED) {
      throw new Error("Billing payment cannot be settled from its current state.");
    }

    const beforeSettle = await getBillingPaymentSummary(tx, payment.billingDocumentId);
    if (beforeSettle.remainingCents <= 0 || payment.amountCents > beforeSettle.remainingCents) {
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          externalCheckoutSession: input.externalCheckoutSession || payment.externalCheckoutSession,
          externalPaymentId: input.externalPaymentId || payment.externalPaymentId,
          hostedReceiptUrl: input.hostedReceiptUrl || payment.hostedReceiptUrl,
          rawSummary: {
            ...(typeof input.rawSummary === "object" && input.rawSummary && !Array.isArray(input.rawSummary) ? input.rawSummary : {}),
            rejectedReason: "payment_would_exceed_remaining_balance",
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

  if (result.rejected) {
    throw new Error("Billing payment would exceed the remaining document balance.");
  }

  return result.summary;
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
      status: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] }
    },
    data: {
      externalCheckoutSession: input.externalCheckoutSession,
      externalPaymentId: input.externalPaymentId,
      rawSummary: input.rawSummary ?? {},
      status: PaymentStatus.FAILED
    }
  });
}
