import "server-only";

import { GiftCardStatus, OrderStatus, PaymentStatus, Prisma, ProductType } from "@prisma/client";
import { buildPurchaseEvent } from "@/lib/analytics/ecommerce";
import { recordAuditLog } from "@/lib/audit";
import { generateGiftCardCode } from "@/lib/commerce/gift-cards";
import { emitModuleEvent } from "@/lib/events/emit";
import { queueOrderReceiptEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

type CommerceTx = Prisma.TransactionClient;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    giftCardRedemptions: true;
    items: {
      include: {
        product: true;
        variant: true;
      };
    };
  };
}>;

type OrderTransitionOptions = {
  providerConfirmed?: boolean;
};

type IssuedPurchasedGiftCard = {
  amountCents: number;
  code: string;
  currency: string;
  giftCardId: string;
  orderItemId: string;
  recipientEmail: string;
};

function providerConfirmedStatus(status: OrderStatus) {
  return status === OrderStatus.PAID || status === OrderStatus.REFUNDED;
}

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.PENDING, OrderStatus.CANCELED],
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELED],
  [OrderStatus.PAID]: [OrderStatus.FULFILLED, OrderStatus.REFUNDED],
  [OrderStatus.FULFILLED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELED]: [],
  [OrderStatus.REFUNDED]: []
};

export function nextOrderStatuses(status: OrderStatus, options: OrderTransitionOptions = {}) {
  const allowed = orderStatusTransitions[status];
  if (options.providerConfirmed) return allowed;
  return allowed.filter((candidate) => !providerConfirmedStatus(candidate));
}

function assertAllowedOrderStatusTransition(current: OrderStatus, next: OrderStatus, options: OrderTransitionOptions = {}) {
  if (current === next) return;

  if (!orderStatusTransitions[current].includes(next)) {
    throw new Error(`Cannot change ${current.toLowerCase()} to ${next.toLowerCase()}.`);
  }

  if (providerConfirmedStatus(next) && !options.providerConfirmed) {
    throw new Error(`Cannot mark an order ${next.toLowerCase()} until provider confirmation is recorded.`);
  }
}

async function syncDefaultVariantMirror(
  tx: CommerceTx,
  variant: { id: string; isDefault: boolean; productId: string } | null
) {
  if (!variant?.isDefault) return;

  const updatedVariant = await tx.productVariant.findUnique({
    where: { id: variant.id },
    select: { inventoryQuantity: true }
  });

  if (!updatedVariant) return;

  await tx.product.update({
    where: { id: variant.productId },
    data: { inventoryQuantity: updatedVariant.inventoryQuantity }
  });
}

async function decrementInventoryForPaidOrder(tx: CommerceTx, order: OrderWithItems) {
  for (const item of order.items) {
    if (item.variant) {
      if (!item.variant.trackInventory) continue;

      const updated = await tx.productVariant.updateMany({
        where: {
          id: item.variant.id,
          trackInventory: true,
          inventoryQuantity: { gte: item.quantity }
        },
        data: { inventoryQuantity: { decrement: item.quantity } }
      });

      if (updated.count !== 1) {
        throw new Error(`Not enough inventory is available for ${item.name}.`);
      }

      await syncDefaultVariantMirror(tx, item.variant);
      continue;
    }

    if (!item.product.trackInventory) continue;

    const updated = await tx.product.updateMany({
      where: {
        id: item.productId,
        trackInventory: true,
        inventoryQuantity: { gte: item.quantity }
      },
      data: { inventoryQuantity: { decrement: item.quantity } }
    });

    if (updated.count !== 1) {
      throw new Error(`Not enough inventory is available for ${item.name}.`);
    }
  }
}

async function syncPaymentsForOrderStatus(tx: CommerceTx, orderId: string, status: OrderStatus) {
  if (status === OrderStatus.PAID) {
    await tx.payment.updateMany({
      where: {
        orderId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] }
      },
      data: { status: PaymentStatus.PAID }
    });
  }

  if (status === OrderStatus.REFUNDED) {
    await tx.payment.updateMany({
      where: {
        orderId,
        status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED, PaymentStatus.PENDING] }
      },
      data: { status: PaymentStatus.REFUNDED }
    });
  }

  if (status === OrderStatus.CANCELED) {
    await tx.payment.updateMany({
      where: {
        orderId,
        status: PaymentStatus.PENDING
      },
      data: { status: PaymentStatus.FAILED }
    });
  }
}

async function consumeCouponRedemptionForPaidOrder(tx: CommerceTx, order: { couponId: string | null; siteId: string }) {
  if (!order.couponId) return;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const coupon = await tx.coupon.findFirst({
      where: { id: order.couponId, siteId: order.siteId },
      select: {
        id: true,
        isActive: true,
        maxRedemptions: true,
        redemptionCount: true
      }
    });

    if (!coupon || !coupon.isActive) {
      throw new Error("The applied coupon is no longer available.");
    }

    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
      throw new Error("The applied coupon has reached its redemption limit.");
    }

    const claimed = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        redemptionCount: coupon.redemptionCount
      },
      data: { redemptionCount: { increment: 1 } }
    });

    if (claimed.count === 1) return;
  }

  throw new Error("Could not confirm coupon redemption. Please retry.");
}

async function restoreGiftCardRedemptionsForCanceledOrder(
  tx: CommerceTx,
  redemptions: { amountCents: number; giftCardId: string; id: string; restoredAt: Date | null }[]
) {
  const restoredAt = new Date();

  for (const redemption of redemptions) {
    if (redemption.restoredAt) continue;

    const marked = await tx.giftCardRedemption.updateMany({
      where: { id: redemption.id, restoredAt: null },
      data: { restoredAt }
    });
    if (marked.count !== 1) continue;

    await tx.giftCard.update({
      where: { id: redemption.giftCardId },
      data: { balanceCents: { increment: redemption.amountCents } }
    });
  }
}

async function issueGiftCardsForPaidOrder(tx: CommerceTx, order: OrderWithItems): Promise<IssuedPurchasedGiftCard[]> {
  const issued: IssuedPurchasedGiftCard[] = [];

  for (const item of order.items) {
    if (item.product.type !== ProductType.GIFT_CARD || item.lineTotalCents <= 0) continue;

    const existing = await tx.giftCard.findUnique({
      where: { saleOrderItemId: item.id },
      select: { id: true }
    });
    if (existing) continue;

    const recipientEmail = item.giftCardRecipientEmail || order.customerEmail;
    const giftCard = await tx.giftCard.create({
      data: {
        balanceCents: item.lineTotalCents,
        code: await generateGiftCardCode(tx, order.siteId),
        currency: order.currency,
        initialAmountCents: item.lineTotalCents,
        note: item.giftCardMessage,
        purchaserEmail: order.customerEmail,
        purchaserName: order.customerName,
        recipientEmail,
        recipientName: item.giftCardRecipientName || order.customerName,
        saleOrderItemId: item.id,
        siteId: order.siteId,
        status: GiftCardStatus.ACTIVE
      },
      select: {
        balanceCents: true,
        code: true,
        currency: true,
        id: true,
        recipientEmail: true,
        saleOrderItemId: true
      }
    });

    issued.push({
      amountCents: giftCard.balanceCents,
      code: giftCard.code,
      currency: giftCard.currency,
      giftCardId: giftCard.id,
      orderItemId: giftCard.saleOrderItemId || item.id,
      recipientEmail: giftCard.recipientEmail
    });
  }

  return issued;
}

export async function updateOrderStatus(input: {
  orderId: string;
  status: OrderStatus;
  siteId?: string;
  providerConfirmed?: boolean;
}) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const providerConfirmed = input.providerConfirmed ?? false;
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, siteId },
      include: {
        coupon: true,
        giftCardRedemptions: true,
        items: {
          include: {
            product: true,
            variant: true
          }
        }
      }
    });

    if (!order) throw new Error("Order not found.");
    assertAllowedOrderStatusTransition(order.status, input.status, { providerConfirmed });

    const becamePaid = input.status === OrderStatus.PAID && order.status !== OrderStatus.PAID;
    const becameCanceled = input.status === OrderStatus.CANCELED && order.status !== OrderStatus.CANCELED;

    if (becamePaid) {
      await consumeCouponRedemptionForPaidOrder(tx, order);
      await decrementInventoryForPaidOrder(tx, order);
    }

    if (becameCanceled) {
      await restoreGiftCardRedemptionsForCanceledOrder(tx, order.giftCardRedemptions);
    }

    const issuedGiftCards = becamePaid ? await issueGiftCardsForPaidOrder(tx, order) : [];

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.status,
        placedAt: input.status === OrderStatus.PAID ? order.placedAt || new Date() : undefined
      },
      include: { payments: true }
    });

    await syncPaymentsForOrderStatus(tx, order.id, input.status);

    return {
      becamePaid,
      issuedGiftCards,
      order: updatedOrder,
      sourceOrder: order
    };
  });

  if (result.becamePaid) {
    await Promise.all([
      queueOrderReceiptEmail(result.order),
      ...result.issuedGiftCards.map((giftCard) =>
        recordAuditLog({
          action: "gift_card.issued",
          actor: null,
          metadata: {
            amountCents: giftCard.amountCents,
            code: giftCard.code,
            currency: giftCard.currency,
            orderNumber: result.order.orderNumber,
            recipientEmail: giftCard.recipientEmail,
            source: "paid_order"
          },
          siteId: result.order.siteId,
          targetId: giftCard.giftCardId,
          targetLabel: giftCard.code,
          targetType: "gift_card"
        })
      ),
      emitModuleEvent("order.paid", {
        actorEmail: result.order.customerEmail,
        currency: result.order.currency,
        idempotencyKey: `order:${result.order.id}:paid`,
        metadata: {
          ...buildPurchaseEvent({
            coupon: result.sourceOrder.coupon?.code || undefined,
            currency: result.order.currency,
            items: result.sourceOrder.items.map((item) => ({
              item_id: item.productId,
              item_name: item.name,
              item_variant: item.variant && !item.variant.isDefault ? item.variant.name : undefined,
              price: Number((item.unitPriceCents / 100).toFixed(2)),
              quantity: item.quantity
            })),
            totalCents: result.order.totalCents,
            transactionId: result.order.orderNumber
          }),
          orderNumber: result.order.orderNumber,
          paymentProvider: result.order.payments[0]?.provider || ""
        },
        relatedId: result.order.id,
        relatedType: "order",
        valueCents: result.order.totalCents
      })
    ]);
  }

  return result.order;
}
