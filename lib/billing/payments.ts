import "server-only";

import { BillingDocumentStatus, PaymentStatus, Prisma } from "@prisma/client";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { prisma } from "@/lib/prisma";

const PAID_STATUSES = [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] satisfies PaymentStatus[];

export type BillingPaymentSummary = {
  paidCents: number;
  remainingCents: number;
};

export async function getBillingPaymentSummary(
  tx: Prisma.TransactionClient,
  billingDocumentId: string
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

  const paidCents = paid._sum.amountCents || 0;
  return {
    paidCents,
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
  return prisma.$transaction(async (tx) => {
    const payment = await tx.billingPayment.findFirst({
      where: {
        id: input.billingPaymentId,
        billingDocument: { siteId: input.siteId }
      },
      include: { billingDocument: true }
    });

    if (!payment) throw new Error("Billing payment target not found.");

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

    return summary;
  });
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
