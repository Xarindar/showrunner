import { MediaVariantType, PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { NextRequest } from "next/server";
import { galleryOriginalDeliveryResponse, galleryProofResponse, mediaDeliveryResponse, normalizeMediaVariantType } from "@/lib/media";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { authorizeGalleryOriginal } from "@/lib/portfolio/purchases";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

type GalleryMediaRouteProps = {
  params: Promise<{ itemId: string; slug: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}

export async function GET(request: NextRequest, { params }: GalleryMediaRouteProps) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) return notFound();

  const { itemId, slug } = await params;
  const item = await prisma.portfolioGalleryItem.findFirst({
    where: {
      id: itemId,
      gallery: {
        siteId: settings.siteId,
        slug,
        status: PortfolioGalleryStatus.PUBLISHED
      }
    },
    include: {
      gallery: {
        select: {
          id: true,
          clientId: true,
          downloadEnabled: true,
          visibility: true
        }
      }
    }
  });

  if (!item?.mediaAssetId) return notFound();

  const accessToken = request.nextUrl.searchParams.get("access") || request.nextUrl.searchParams.get("token") || "";
  const access = accessToken ? await findActiveGalleryAccess(accessToken, item.gallery.id, settings.siteId) : null;
  const privateGallery = item.gallery.visibility !== PortfolioGalleryVisibility.PUBLIC || Boolean(item.gallery.clientId);
  if (privateGallery && !access) return notFound();
  if (item.gallery.clientId && access?.clientId !== item.gallery.clientId) return notFound();

  if (!privateGallery && !access) {
    const rateLimitMessage = await publicRateLimitMessage(`gallery_media:${item.gallery.id}:${item.id}`, {
      limit: 4,
      windowMinutes: 10
    });
    if (rateLimitMessage) return new Response(rateLimitMessage, { status: 429 });
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: item.mediaAssetId, siteId: settings.siteId },
    select: {
      deletedAt: true,
      driver: true,
      filename: true,
      id: true,
      isPrivate: true,
      key: true,
      mimeType: true,
      storageProviderId: true,
      url: true
    }
  });

  if (!asset || asset.deletedAt) return notFound();
  const type = normalizeMediaVariantType(request.nextUrl.searchParams.get("variant"));
  const download = request.nextUrl.searchParams.get("download") === "1" || type === MediaVariantType.DOWNLOAD;

  if (privateGallery) {
    // Unsafe legacy/public objects cannot become secure merely by linking them
    // to a private gallery. They must be re-uploaded to supported private storage.
    if (!asset.isPrivate || !access) return notFound();
    if (download) {
      if (!item.gallery.downloadEnabled || !item.isDownloadable) return notFound();
      const entitled = await authorizeGalleryOriginal({ siteId: settings.siteId, galleryId: item.gallery.id, itemId: item.id, mediaAssetId: item.mediaAssetId, accessId: access.id });
      if (!entitled) return notFound();
      return (await galleryOriginalDeliveryResponse(asset, request)) || notFound();
    }
    return (await galleryProofResponse(asset, type)) || notFound();
  }

  // A public portfolio must never be used to expose a private source, including
  // when the caller happens to possess an access link for the public gallery.
  if (asset.isPrivate) return notFound();
  const privateUsage = await prisma.portfolioGalleryItem.findFirst({
    where: { mediaAssetId: asset.id, gallery: { OR: [{ visibility: { not: PortfolioGalleryVisibility.PUBLIC } }, { clientId: { not: null } }] } },
    select: { id: true }
  });
  if (privateUsage) return notFound();
  if (download && (!item.gallery.downloadEnabled || !item.isDownloadable)) return notFound();

  const response = await mediaDeliveryResponse({
    asset,
    download,
    request,
    type
  });

  return response || notFound();
}
