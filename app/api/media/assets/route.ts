import { NextResponse, type NextRequest } from "next/server";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

const pageSize = 60;

function positivePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 1;
}

export async function GET(request: NextRequest) {
  await requireAuthenticatedAdmin();
  const settings = await getSiteSettings();
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 180);
  const page = positivePage(request.nextUrl.searchParams.get("page"));
  const clauses: Prisma.MediaAssetWhereInput[] = [
    { siteId: settings.siteId, deletedAt: null, isPrivate: false, mimeType: { startsWith: "image/", mode: "insensitive" } }
  ];

  if (query) {
    clauses.push({
      OR: [
        { filename: { contains: query, mode: "insensitive" } },
        { alt: { contains: query, mode: "insensitive" } },
        { caption: { contains: query, mode: "insensitive" } },
        { folder: { contains: query, mode: "insensitive" } },
        { usageContext: { contains: query, mode: "insensitive" } }
      ]
    });
  }

  const where: Prisma.MediaAssetWhereInput = { AND: clauses };
  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        alt: true,
        driver: true,
        filename: true,
        folder: true,
        id: true,
        isPrivate: true,
        key: true,
        storageProviderId: true,
        url: true
      }
    }),
    prisma.mediaAsset.count({ where })
  ]);

  return NextResponse.json(
    {
      assets: assets.map((asset) => ({
        alt: asset.alt || asset.filename,
        filename: asset.filename,
        folder: asset.folder,
        id: asset.id,
        thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD)
      })),
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      total
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
