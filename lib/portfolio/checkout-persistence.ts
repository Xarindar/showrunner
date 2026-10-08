import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** A delayed provider response must not overwrite a newer attempt or verified payment. */
export async function persistGalleryHostedCheckout(input: {
  purchaseId: string; orderId: string; paymentId: string; siteId: string;
  orderData: Prisma.OrderUpdateManyMutationInput;
  paymentData: Prisma.PaymentUpdateManyMutationInput;
}) {
  return prisma.$transaction(async tx => {
    // Match recovery's lock order. Reads after lock acquisition get a fresh
    // READ COMMITTED snapshot even if this response waited behind renewal.
    await tx.$queryRaw`SELECT id FROM "PortfolioSelectionPurchase" WHERE id = ${input.purchaseId} AND "siteId" = ${input.siteId} FOR UPDATE`;
    const purchase = await tx.portfolioSelectionPurchase.findFirst({
      where: { id: input.purchaseId, siteId: input.siteId }, select: { orderId: true, clientId: true, revokedAt: true }
    });
    if (!purchase || purchase.orderId !== input.orderId || purchase.revokedAt) return false;
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "orderId" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id: input.orderId, siteId: input.siteId, clientId: purchase.clientId }, select: { status: true } });
    const latest = await tx.payment.findFirst({ where: { orderId: input.orderId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!order || !["PENDING", "DRAFT"].includes(order.status) || !latest || latest.id !== input.paymentId ||
        !["PENDING", "FAILED"].includes(latest.status) || latest.providerVerifiedAt || latest.refundedCents > 0 ||
        (latest.externalCheckoutSession && latest.externalCheckoutSession !== input.paymentData.externalCheckoutSession)) return false;
    await tx.order.update({ where: { id: input.orderId }, data: input.orderData });
    await tx.payment.update({ where: { id: input.paymentId }, data: input.paymentData });
    return true;
  });
}
