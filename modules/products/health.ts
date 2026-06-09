import "server-only";

import { OrderStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings = [];
  const [activeProductCount, pendingCheckoutCount] = await Promise.all([
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    prisma.order.count({
      where: {
        status: OrderStatus.PENDING,
        OR: [{ checkoutUrl: null }, { checkoutUrl: "" }]
      }
    })
  ]);

  if (activeProductCount > 0) {
    warnings.push(
      warning(
        "Stripe Checkout is manual",
        "Storefront, cart, order creation, and payment records are live. Attach hosted Checkout links manually until Stripe session creation and webhooks are configured.",
        "info",
        "products",
        "/admin/modules/products"
      )
    );
  }

  if (pendingCheckoutCount > 0) {
    warnings.push(
      warning(
        "Orders need checkout links",
        `${pendingCheckoutCount} pending commerce orders do not have hosted checkout links attached yet.`,
        "warning",
        "products",
        "/admin/modules/products"
      )
    );
  }

  return warnings;
};
