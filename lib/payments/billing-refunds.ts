import "server-only";
import { recordBillingRefund } from "@/lib/billing/refund-ledger";
import { prisma } from "@/lib/prisma";
import { getPaymentGateway } from "./registry";

export async function processBillingRefunds() {
  const now = new Date();
  const unconfirmedCutoff = new Date(now.getTime() - 4 * 60 * 60_000);
  const operations = await prisma.billingRefund.findMany({
    where: { requested: true, status: "PENDING", nextAttemptAt: { lte: now }, OR: [
      { externalRefundId: { not: null } }, { createdAt: { gte: unconfirmedCutoff } }
    ] },
    include: { billingPayment: { include: { billingDocument: { select: { siteId: true } } } } },
    orderBy: { nextAttemptAt: "asc" },
    take: 20
  });
  for (const operation of operations) {
    const claim = await prisma.billingRefund.updateMany({
      where: { id: operation.id, status: "PENDING", nextAttemptAt: { lte: now }, externalRefundId: operation.externalRefundId },
      data: { nextAttemptAt: new Date(Date.now() + 120_000) }
    });
    if (!claim.count) continue;
    const payment = operation.billingPayment;
    const siteId = payment.billingDocument.siteId;
    const captureId = payment.externalPaymentId;
    if (!captureId) continue;
    try {
      const observation = await getPaymentGateway(payment.provider).refundBilling({
        siteId, captureId, amountCents: operation.amountCents, currency: operation.currency,
        requestId: operation.id, externalRefundId: operation.externalRefundId
      });
      await recordBillingRefund(siteId, payment.id, captureId, { ...observation, requestId: operation.id });
    } catch {
      console.error("[billing:refund] reconciliation pending", { provider: payment.provider, siteId });
    }
  }
}
