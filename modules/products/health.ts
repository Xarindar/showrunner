import "server-only";

import { OrderStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [activeProductCount, pendingCheckoutCount] = await Promise.all([
    prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.ACTIVE } }),
    prisma.order.count({
      where: {
        siteId: settings.siteId,
        status: OrderStatus.PENDING,
        OR: [{ checkoutUrl: null }, { checkoutUrl: "" }]
      }
    })
  ]);

  if (activeProductCount > 0) {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      warnings.push(
        warning(
          "Stripe Checkout not configured",
          "Storefront checkout needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET before live payment collection.",
          "critical",
          "products",
          "/admin/modules/settings"
        )
      );
    }
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
