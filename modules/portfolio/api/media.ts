import { PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { NextRequest } from "next/server";
import { mediaDeliveryResponse, normalizeMediaVariantType } from "@/lib/media";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

type GalleryMediaRouteProps = {
  params: Promise<{ itemId: string; slug: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404 });
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
          visibility: true
        }
      }
    }
  });

  if (!item?.mediaAssetId) return notFound();

  const accessToken = request.nextUrl.searchParams.get("access") || request.nextUrl.searchParams.get("token") || "";
  const access = accessToken ? await findActiveGalleryAccess(accessToken, item.gallery.id, settings.siteId) : null;
  if (item.gallery.visibility !== PortfolioGalleryVisibility.PUBLIC && !access) return notFound();

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
  if (asset.isPrivate && !access) return notFound();

  const response = await mediaDeliveryResponse({
    asset,
    download: request.nextUrl.searchParams.get("download") === "1",
    privateAccess: Boolean(access),
    request,
    type: normalizeMediaVariantType(request.nextUrl.searchParams.get("variant"))
  });

  return response || notFound();
}
