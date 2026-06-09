import "server-only";

import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings = [];
  const manualAnalyticsEventCount = await prisma.analyticsEvent.count();

  if (manualAnalyticsEventCount > 0) {
    warnings.push(
      warning(
        "Analytics is mixed",
        "Server-side event emission, UTM/session capture, consent-aware metadata, and CSV export are live; client adapters, retention controls, and full ecommerce mappings are still pending.",
        "info",
        "analytics",
        "/admin/modules/analytics"
      )
    );
  }

  return warnings;
};
