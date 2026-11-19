import "server-only";
import { BillingRefundStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRejectedCapturedPayment } from "./payments";

export type BillingRefundObservation = {
  externalRefundId: string;
  amountCents: number;
  currency: string;
  providerCreatedAt: Date;
  status: BillingRefundStatus;
  requestId?: string;
};

export async function lockBillingPayment(tx: Prisma.TransactionClient, siteId: string, paymentId: string) {
  await tx.$queryRaw`
    SELECT p.id FROM "BillingPayment" p JOIN "BillingDocument" d ON d.id = p."billingDocumentId"
    WHERE p.id = ${paymentId} AND d."siteId" = ${siteId} FOR UPDATE OF p
  `;
  return tx.billingPayment.findFirst({
    where: { id: paymentId, billingDocument: { siteId } }, include: { billingDocument: true }
  });
}

export async function reserveBillingRefund(input: { siteId: string; paymentId: string; requestId: string; amountCents: number }) {
  return prisma.$transaction(async (tx) => {
    const payment = await lockBillingPayment(tx, input.siteId, input.paymentId);
    if (!payment) throw new Error("Billing payment not found.");
    const existing = await tx.billingRefund.findUnique({ where: { id: input.requestId } });
    if (existing) {
      if (!existing.requested || existing.billingPaymentId !== payment.id || existing.amountCents !== input.amountCents) {
        throw new Error("Refund instruction does not match the existing request.");
      }
      return { payment, created: false };
    }
    if (!payment.externalPaymentId || (payment.status !== PaymentStatus.PAID && !isRejectedCapturedPayment(payment))) {
      throw new Error("Only captured billing payments can be refunded.");
    }
    const reserved = await tx.billingRefund.aggregate({
      where: { billingPaymentId: payment.id, status: BillingRefundStatus.PENDING },
      _sum: { amountCents: true }
    });
    if (input.amountCents <= 0 || input.amountCents + (reserved._sum.amountCents || 0) + payment.refundedCents > payment.amountCents) {
      throw new Error("Refund amount must be greater than zero and no more than the available balance.");
    }
    await tx.billingRefund.create({
      data: { id: input.requestId, billingPaymentId: payment.id, requested: true, amountCents: input.amountCents, currency: payment.currency }
    });
    return { payment, created: true };
  });
}

export async function recordBillingRefund(siteId: string, paymentId: string, captureId: string, observation: BillingRefundObservation) {
  await prisma.$transaction(async (tx) => {
    const payment = await lockBillingPayment(tx, siteId, paymentId);
    if (!payment || payment.externalPaymentId !== captureId || !observation.externalRefundId ||
      !Number.isSafeInteger(observation.amountCents) || observation.amountCents <= 0 || observation.amountCents > payment.amountCents ||
      observation.currency.toUpperCase() !== payment.currency.toUpperCase() || !Number.isFinite(observation.providerCreatedAt.getTime())) {
      throw new Error("Refund identity or amount did not match the captured payment.");
    }
    const providerRow = await tx.billingRefund.findUnique({
      where: { billingPaymentId_externalRefundId: { billingPaymentId: paymentId, externalRefundId: observation.externalRefundId } }
    });
    const requested = observation.requestId
      ? await tx.billingRefund.findFirst({ where: { id: observation.requestId, billingPaymentId: paymentId, requested: true } })
      : null;
    if ((requested?.externalRefundId && requested.externalRefundId !== observation.externalRefundId) ||
      [requested, providerRow].some((row) => row && row.amountCents !== observation.amountCents) ||
      (requested && providerRow?.requested && providerRow.id !== requested.id)) {
      throw new Error("Provider refund conflicts with an existing instruction.");
    }
    const states = [requested?.status, providerRow?.status, observation.status];
    const status = states.includes(BillingRefundStatus.SUCCEEDED) ? BillingRefundStatus.SUCCEEDED
      : states.includes(BillingRefundStatus.FAILED) ? BillingRefundStatus.FAILED : BillingRefundStatus.PENDING;
    if (requested && providerRow && requested.id !== providerRow.id) {
      await tx.billingRefund.delete({ where: { id: providerRow.id } });
    }
    const reconciled = requested || providerRow;
    const fields = { status, externalRefundId: observation.externalRefundId, providerCreatedAt: observation.providerCreatedAt };
    if (reconciled) {
      await tx.billingRefund.update({ where: { id: reconciled.id }, data: fields });
    } else {
      await tx.billingRefund.create({ data: {
        id: crypto.randomUUID(), billingPaymentId: paymentId, requested: false,
        amountCents: observation.amountCents, currency: payment.currency, ...fields
      } });
    }
    const succeeded = await tx.billingRefund.findMany({
      where: { billingPaymentId: paymentId, status: BillingRefundStatus.SUCCEEDED },
      select: { amountCents: true, providerCreatedAt: true }
    });
    let historical = 0;
    let current = 0;
    for (const refund of succeeded) {
      if (refund.providerCreatedAt && refund.providerCreatedAt < payment.refundLedgerStartedAt) historical += refund.amountCents;
      else current += refund.amountCents;
    }
    const refundedCents = Math.min(payment.amountCents, Math.max(historical, payment.legacyRefundedCents) + current);
    await tx.billingPayment.update({
      where: { id: payment.id },
      data: { refundedCents, ...(refundedCents === payment.amountCents ? { status: PaymentStatus.REFUNDED } : {}) }
    });
  });
}
