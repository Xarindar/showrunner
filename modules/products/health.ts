import "server-only";

import { ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings = [];
  const activeProductCount = await prisma.product.count({ where: { status: ProductStatus.ACTIVE } });

  if (activeProductCount > 0) {
    warnings.push(
      warning(
        "Products are catalog-only",
        "Active products exist, but storefront, cart, order creation, and hosted checkout are not live yet.",
        "info",
        "products",
        "/admin/modules/products"
      )
    );
  }

  return warnings;
};
