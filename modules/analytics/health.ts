import "server-only";

import { prisma } from "@/lib/prisma";
import { envLooksDefault, warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const manualAnalyticsEventCount = await prisma.analyticsEvent.count({ where: { siteId: settings.siteId } });

  if (manualAnalyticsEventCount > 0) {
    warnings.push(
      warning(
        "Analytics is mixed",
        "Server-side event emission, UTM/session capture, client adapters, retention controls, and ecommerce mappings are live; consent UI remains pending.",
        "info",
        "analytics",
        "/admin/modules/analytics"
      )
    );
  }

  if (envLooksDefault(process.env.ANALYTICS_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET)) {
    warnings.push(
      warning(
        "Analytics retention worker secret needs setup",
        "Set ANALYTICS_WORKER_SECRET and provision the scheduled retention sweep (npm run analytics:process) so old AnalyticsEvent rows are pruned off the request path.",
        "warning",
        "analytics",
        "/admin/modules/analytics"
      )
    );
  }

  return warnings;
};
