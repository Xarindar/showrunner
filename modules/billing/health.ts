import "server-only";

import { BillingDocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings, now }) => {
  const warnings = [];
  const overdueDocumentCount = await prisma.billingDocument.count({
    where: {
      siteId: settings.siteId,
      dueAt: { lt: now },
      paidAt: null,
      status: { in: [BillingDocumentStatus.SENT, BillingDocumentStatus.ACCEPTED, BillingDocumentStatus.OVERDUE] }
    }
  });

  if (overdueDocumentCount > 0) {
    warnings.push(
      warning(
        "Overdue billing documents",
        `${overdueDocumentCount} billing document${overdueDocumentCount === 1 ? "" : "s"} are past due and unpaid.`,
        "warning",
        "billing",
        "/admin/modules/billing"
      )
    );
  }

  return warnings;
};
