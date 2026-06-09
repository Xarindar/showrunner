import "server-only";

import { PortfolioAccessStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function findActiveGalleryAccess(accessToken: string, galleryId?: string) {
  const token = accessToken.trim();
  if (!token) return null;

  return prisma.portfolioGalleryAccess.findFirst({
    where: {
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

export async function markGalleryAccessViewed(accessId: string) {
  await prisma.portfolioGalleryAccess.update({
    where: { id: accessId },
    data: { lastViewedAt: new Date() }
  });
}
