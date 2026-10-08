import "server-only";

import { PortfolioAccessStatus, PortfolioGalleryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [publishedGalleryCount, activeGalleryAccessCount] = await Promise.all([
    prisma.portfolioGallery.count({ where: { siteId: settings.siteId, status: PortfolioGalleryStatus.PUBLISHED } }),
    prisma.portfolioGalleryAccess.count({ where: { siteId: settings.siteId, status: PortfolioAccessStatus.ACTIVE } })
  ]);

  if (publishedGalleryCount > 0 || activeGalleryAccessCount > 0) {
    warnings.push(
      warning(
        "Review gallery delivery setup",
        "Client shoots support burned-in proofs and selected-original delivery. Verify private storage and sandbox payment/refund webhooks before enabling paid extras; print/lab workflow remains separate.",
        "info",
        "portfolio",
        "/admin/modules/portfolio"
      )
    );
  }

  return warnings;
};
