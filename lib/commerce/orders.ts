import "server-only";

import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { emitModuleEvent } from "@/lib/events/emit";
import { queueOrderReceiptEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

type CommerceTx = Prisma.TransactionClient;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: true;
        variant: true;
      };
    };
  };
}>;

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.PENDING, OrderStatus.CANCELED],
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELED],
  [OrderStatus.PAID]: [OrderStatus.FULFILLED, OrderStatus.REFUNDED],
  [OrderStatus.FULFILLED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELED]: [],
  [OrderStatus.REFUNDED]: []
};

export function nextOrderStatuses(status: OrderStatus) {
  return orderStatusTransitions[status];
}

function assertAllowedOrderStatusTransition(current: OrderStatus, next: OrderStatus) {
  if (current === next) return;

  if (!orderStatusTransitions[current].includes(next)) {
    throw new Error(`Cannot change ${current.toLowerCase()} to ${next.toLowerCase()}.`);
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

async function releasePendingCouponRedemption(tx: CommerceTx, order: { couponId: string | null; status: OrderStatus }) {
  if (!order.couponId) return;
  if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.PENDING) return;

  await tx.coupon.updateMany({
    where: {
      id: order.couponId,
      redemptionCount: { gt: 0 }
    },
    data: { redemptionCount: { decrement: 1 } }
  });
}

export async function updateOrderStatus(input: { orderId: string; status: OrderStatus; siteId?: string }) {
  const siteId = input.siteId || DEFAULT_SITE_ID;
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, siteId },
      include: {
        items: {
          include: {
            product: true,
            variant: true
          }
        }
      }
    });

    if (!order) throw new Error("Order not found.");
    assertAllowedOrderStatusTransition(order.status, input.status);

    const becamePaid = input.status === OrderStatus.PAID && order.status !== OrderStatus.PAID;
    const becameCanceled = input.status === OrderStatus.CANCELED && order.status !== OrderStatus.CANCELED;

    if (becamePaid) {
      await decrementInventoryForPaidOrder(tx, order);
    }

    if (becameCanceled) {
      await releasePendingCouponRedemption(tx, order);
    }

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
      order: updatedOrder
    };
  });

  if (result.becamePaid) {
    await Promise.all([
      queueOrderReceiptEmail(result.order),
      emitModuleEvent("order.paid", {
        actorEmail: result.order.customerEmail,
        currency: result.order.currency,
        idempotencyKey: `order:${result.order.id}:paid`,
        metadata: {
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
