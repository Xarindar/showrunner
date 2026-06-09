import "server-only";

import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [activeServiceCount, availabilityRuleCount] = await Promise.all([
    prisma.service.count({ where: { siteId: settings.siteId, isActive: true } }),
    prisma.availabilityRule.count({ where: { siteId: settings.siteId } })
  ]);

  if (activeServiceCount === 0) {
    warnings.push(
      warning(
        "No active services",
        "Public booking has no active service to show until Scheduling has at least one active service.",
        "critical",
        "scheduling",
        "/admin/modules/scheduling"
      )
    );
  }

  if (availabilityRuleCount === 0) {
    warnings.push(
      warning(
        "No weekly availability",
        "The native booking adapter cannot offer slots until at least one availability rule exists.",
        "critical",
        "scheduling",
        "/admin/modules/scheduling"
      )
    );
  }

  return warnings;
};
