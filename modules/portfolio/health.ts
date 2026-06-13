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
        "Portfolio proofing is partial",
        "Public gallery, access-token proofing, comments, approvals, signed variants, and delivery routes are live; print/lab workflow and watermark controls are still pending.",
        "info",
        "portfolio",
        "/admin/modules/portfolio"
      )
    );
  }

  return warnings;
};
