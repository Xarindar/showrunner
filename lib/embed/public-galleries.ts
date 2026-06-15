import "server-only";

import { MediaVariantType, PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { findActiveGalleryAccess, markGalleryAccessViewed } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";

function mediaPath(input: { accessToken?: string; itemId: string; slug: string; variant: MediaVariantType }) {
  const params = new URLSearchParams({ variant: input.variant });
  if (input.accessToken) params.set("access", input.accessToken);
  return `/galleries/${encodeURIComponent(input.slug)}/media/${encodeURIComponent(input.itemId)}?${params.toString()}`;
}

function publicGallerySummary(gallery: {
  category: string;
  coverImageUrl: string;
  description: string;
  id: string;
  layout: string;
  slug: string;
  title: string;
  visibility: PortfolioGalleryVisibility;
}) {
  return {
    category: gallery.category,
    coverImageUrl: gallery.coverImageUrl,
    description: gallery.description,
    id: gallery.id,
    layout: gallery.layout,
    slug: gallery.slug,
    title: gallery.title,
    visibility: gallery.visibility
  };
}

export async function listPublicGalleries(siteId: string) {
  const galleries = await prisma.portfolioGallery.findMany({
    where: {
      siteId,
      status: PortfolioGalleryStatus.PUBLISHED,
      visibility: PortfolioGalleryVisibility.PUBLIC
    },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      category: true,
      coverImageUrl: true,
      description: true,
      id: true,
      layout: true,
      slug: true,
      title: true,
      visibility: true
    }
  });

  return galleries.map(publicGallerySummary);
}

export async function getPublicGallery(input: { accessToken?: string; siteId: string; slug: string }) {
  const gallery = await prisma.portfolioGallery.findFirst({
    where: {
      siteId: input.siteId,
      slug: input.slug,
      status: PortfolioGalleryStatus.PUBLISHED
    },
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });
  if (!gallery) throw new EmbedRequestError("Gallery not found.", 404);

  const access = input.accessToken ? await findActiveGalleryAccess(input.accessToken, gallery.id, input.siteId) : null;
  if (gallery.visibility !== PortfolioGalleryVisibility.PUBLIC && !access) {
    throw new EmbedRequestError("Gallery access is required.", 404);
  }
  if (access) await markGalleryAccessViewed(access.id, input.siteId);

  const mediaIds = gallery.items.map((item) => item.mediaAssetId).filter((id): id is string => Boolean(id));
  const mediaAssets = mediaIds.length
    ? await prisma.mediaAsset.findMany({
        where: { siteId: input.siteId, id: { in: mediaIds } },
        select: { deletedAt: true, id: true, isPrivate: true }
      })
    : [];
  const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const items = gallery.items
    .filter((item) => {
      if (!item.mediaAssetId) return gallery.visibility === PortfolioGalleryVisibility.PUBLIC;
      const asset = mediaById.get(item.mediaAssetId);
      if (!asset || asset.deletedAt) return false;
      if (asset.isPrivate && !access) return false;
      return true;
    })
    .map((item) => ({
      altText: item.altText,
      caption: item.caption,
      id: item.id,
      imageUrl: item.mediaAssetId
        ? mediaPath({ accessToken: input.accessToken, itemId: item.id, slug: gallery.slug, variant: MediaVariantType.CARD })
        : item.thumbnailUrl || item.imageUrl,
      isDownloadable: item.isDownloadable && gallery.downloadEnabled,
      mediaAssetId: item.mediaAssetId,
      title: item.title
    }));

  return {
    gallery: {
      ...publicGallerySummary(gallery),
      downloadEnabled: gallery.downloadEnabled,
      items,
      proofingEnabled: gallery.proofingEnabled
    }
  };
}
