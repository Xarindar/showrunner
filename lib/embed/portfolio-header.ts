import "server-only";
import { prisma } from "@/lib/prisma";

export async function getPortfolioHeader(siteId: string, orientation: "desktop" | "mobile") {
  const photos = await prisma.mediaAssetVariant.findMany({
    where: {
      type: "HERO", sizeBytes: { gt: 0 }, width: { gt: 0 }, height: { gt: 0 },
      asset: { siteId, deletedAt: null, isPrivate: false, mimeType: { startsWith: "image/" },
        portfolioItems: { some: { type: "IMAGE", gallery: { siteId, status: "PUBLISHED", visibility: "PUBLIC", clientId: null } } }
      }
    },
    select: { assetId: true, width: true, height: true }
  });
  const matching = photos.filter(photo => orientation === "desktop" ? photo.width > photo.height : photo.height > photo.width);
  const photo = matching[Math.floor(Math.random() * matching.length)];
  return photo ? { imageUrl: `/api/media/assets/${encodeURIComponent(photo.assetId)}?variant=HERO`, width: photo.width, height: photo.height } : null;
}
