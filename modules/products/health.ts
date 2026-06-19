import "server-only";

import { OrderStatus, PaymentGatewayConnectionStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [activeProductCount, pendingCheckoutCount, connectedProviderCount] = await Promise.all([
    prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.ACTIVE } }),
    prisma.order.count({
      where: {
        siteId: settings.siteId,
        status: OrderStatus.PENDING,
        OR: [{ checkoutUrl: null }, { checkoutUrl: "" }]
      }
    }),
    prisma.paymentGatewayCredential.count({
      where: { siteId: settings.siteId, status: PaymentGatewayConnectionStatus.CONNECTED }
    })
  ]);

  if (activeProductCount > 0 && connectedProviderCount === 0) {
    warnings.push(
      warning(
        "No payment provider connected",
        "Storefront checkout needs a connected payment account. Add your own Stripe (or Square/PayPal) credentials in Settings → Payments before live payment collection.",
        "critical",
        "products",
        "/admin/modules/settings"
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
