import { NextRequest } from "next/server";
import { PortfolioGalleryVisibility } from "@prisma/client";
import { getAccessibleMediaWhere, getAdminUser, hasAdminPermission } from "@/lib/auth";
import { mediaDeliveryResponse, normalizeMediaVariantType, verifySignedMediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export const runtime = "nodejs";

type MediaAssetRouteProps = {
  params: Promise<{ assetId: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
}

export async function GET(request: NextRequest, { params }: MediaAssetRouteProps) {
  const settings = await getSiteSettings();

  const { assetId } = await params;
  const type = normalizeMediaVariantType(request.nextUrl.searchParams.get("variant"));
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, siteId: settings.siteId },
    select: {
      deletedAt: true,
      driver: true,
      filename: true,
      id: true,
      isPrivate: true,
      key: true,
      mimeType: true,
      storageProviderId: true,
      url: true,
      portfolioItems: {
        where: { gallery: { OR: [{ visibility: { not: PortfolioGalleryVisibility.PUBLIC } }, { clientId: { not: null } }] } },
        select: { id: true },
        take: 1
      },
      purchasedSelections: { select: { id: true }, take: 1 }
    }
  });

  if (!asset) return notFound();

  const belongsToPrivateGallery = asset.portfolioItems.length > 0 || asset.purchasedSelections.length > 0;
  let privateAccess = false;
  if (belongsToPrivateGallery || (type === "DOWNLOAD" && asset.mimeType.startsWith("image/"))) {
    // General media signatures have no purchaser, selection or revocation
    // context. Client delivery must use the gallery route, even with a signature.
    const user = await getAdminUser();
    if (!user || !hasAdminPermission(user, "media:manage")) return notFound();
    const authorized = await prisma.mediaAsset.findFirst({
      where: await getAccessibleMediaWhere(user, settings.siteId, { id: asset.id }),
      select: { id: true }
    });
    if (!authorized) return notFound();
    privateAccess = true;
  } else if (asset.isPrivate) {
    privateAccess = verifySignedMediaUrl({
      assetId: asset.id,
      expires: request.nextUrl.searchParams.get("expires"),
      signature: request.nextUrl.searchParams.get("signature"),
      type
    });
  }

  const response = await mediaDeliveryResponse({
    asset,
    download: request.nextUrl.searchParams.get("download") === "1",
    privateAccess,
    request,
    type
  });

  return response || notFound();
}
