import "server-only";

import { PortfolioAccessStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

export async function findActiveGalleryAccess(accessToken: string, galleryId?: string, siteId?: string) {
  const token = accessToken.trim();
  if (!token) return null;

  const currentSiteId = siteId || (await getCurrentSiteId());
  return prisma.portfolioGalleryAccess.findFirst({
    where: {
      siteId: currentSiteId,
      accessToken: token,
      galleryId,
      status: PortfolioAccessStatus.ACTIVE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      gallery: true
    }
  });
}

export async function markGalleryAccessViewed(accessId: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  await prisma.portfolioGalleryAccess.updateMany({
    where: { id: accessId, siteId: currentSiteId },
    data: { lastViewedAt: new Date() }
  });
}
