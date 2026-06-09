import "server-only";

import { PortfolioAccessStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

export async function findActiveGalleryAccess(accessToken: string, galleryId?: string, siteId = DEFAULT_SITE_ID) {
  const token = accessToken.trim();
  if (!token) return null;

  return prisma.portfolioGalleryAccess.findFirst({
    where: {
      siteId,
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

export async function markGalleryAccessViewed(accessId: string, siteId = DEFAULT_SITE_ID) {
  await prisma.portfolioGalleryAccess.updateMany({
    where: { id: accessId, siteId },
    data: { lastViewedAt: new Date() }
  });
}
