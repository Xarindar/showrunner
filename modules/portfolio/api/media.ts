import { PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { NextRequest } from "next/server";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

type GalleryMediaRouteProps = {
  params: Promise<{ itemId: string; slug: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404 });
}

function safeFilename(value: string) {
  const filename = value.replace(/[^\w .-]/g, "_").trim().slice(0, 140);
  return filename || "gallery-asset";
}

function assetSourceUrl(assetUrl: string, request: NextRequest) {
  if (!assetUrl) return null;
  if (assetUrl.startsWith("/")) return new URL(assetUrl, request.nextUrl.origin);

  const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (r2PublicBaseUrl && assetUrl.startsWith(`${r2PublicBaseUrl}/`)) {
    return new URL(assetUrl);
  }

  return null;
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
      filename: true,
      isPrivate: true,
      mimeType: true,
      url: true
    }
  });

  if (!asset || asset.deletedAt) return notFound();
  if (asset.isPrivate && !access) return notFound();

  const sourceUrl = assetSourceUrl(asset.url, request);
  if (!sourceUrl) return notFound();

  const upstream = await fetch(sourceUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return notFound();

  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("cache-control", access || asset.isPrivate ? "private, no-store" : "public, max-age=300");
  headers.set("content-type", upstream.headers.get("content-type") || asset.mimeType || "application/octet-stream");

  if (download) {
    headers.set("content-disposition", `attachment; filename="${safeFilename(asset.filename)}"`);
  }

  return new Response(upstream.body, {
    headers,
    status: 200
  });
}
