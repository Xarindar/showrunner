import { NextRequest } from "next/server";
import { mediaDeliveryResponse, normalizeMediaVariantType, verifySignedMediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

export const runtime = "nodejs";

type MediaAssetRouteProps = {
  params: Promise<{ assetId: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404 });
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
      url: true
    }
  });

  if (!asset) return notFound();

  const privateAccess =
    asset.isPrivate &&
    verifySignedMediaUrl({
      assetId: asset.id,
      expires: request.nextUrl.searchParams.get("expires"),
      signature: request.nextUrl.searchParams.get("signature"),
      type
    });

  if (!asset.isPrivate) {
    const rateLimitMessage = await publicRateLimitMessage(`media_asset:${asset.id}`, {
      limit: 4,
      windowMinutes: 10
    });
    if (rateLimitMessage) return new Response(rateLimitMessage, { status: 429 });
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
