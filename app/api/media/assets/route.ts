import { NextResponse, type NextRequest } from "next/server";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAuthenticatedAdmin, resolveDataScopeMode } from "@/lib/auth";
import { nonEmptyStringArrayFromUnknown } from "@/lib/format";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { summarizeMediaTags } from "@/lib/media-tags";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

const pageSize = 24;
const recentWindowDays = 30;

function positivePage(value: string | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= Math.floor(2147483647 / pageSize) ? parsed : 1;
}

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedAdmin();
  const settings = await getSiteSettings();
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 180);
  const requestedScope = request.nextUrl.searchParams.get("scope");
  const scope = requestedScope === "recent" ? "recent" : "all";
  const tag = (request.nextUrl.searchParams.get("tag") || "").trim().slice(0, 120);
  const folder = (request.nextUrl.searchParams.get("folder") || "").trim().slice(0, 200);
  const page = positivePage(request.nextUrl.searchParams.get("page"));
  const baseWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, {
    deletedAt: null,
    isPrivate: false,
    mimeType: { startsWith: "image/", mode: "insensitive" }
  });
  const tagRows = await prisma.mediaAsset.findMany({ where: baseWhere, select: { tags: true }, take: 5000 });
  const ownFolders = (await resolveDataScopeMode(user, settings.siteId, "media")) === "OWN";
  const [savedFolders, folderGroups] = await Promise.all([
    prisma.mediaFolder.findMany({ where: { siteId: settings.siteId, ...(ownFolders ? { createdByUserId: user.id } : {}) }, select: { name: true } }),
    prisma.mediaAsset.groupBy({ by: ["folder"], where: baseWhere })
  ]);
  const folders = [...new Set([...savedFolders.map(row => row.name), ...folderGroups.map(row => row.folder).filter((name): name is string => Boolean(name))])].sort((a, b) => a.localeCompare(b));
  const clauses: Prisma.MediaAssetWhereInput[] = [baseWhere];
  if (folder) clauses.push({ folder });

  if (scope === "recent") {
    clauses.push({ createdAt: { gte: new Date(Date.now() - recentWindowDays * 24 * 60 * 60 * 1000) } });
  }

  if (tag) clauses.push({ tags: { array_contains: [tag] } });

  if (query) {
    const normalizedQuery = query.toLocaleLowerCase();
    const matchingTags = Array.from(new Set(
      tagRows.flatMap((row) => nonEmptyStringArrayFromUnknown(row.tags))
        .filter((candidate) => candidate.toLocaleLowerCase().includes(normalizedQuery))
    )).slice(0, 24);

    clauses.push({
      OR: [
        { filename: { contains: query, mode: "insensitive" } },
        { alt: { contains: query, mode: "insensitive" } },
        { caption: { contains: query, mode: "insensitive" } },
        { folder: { contains: query, mode: "insensitive" } },
        { usageContext: { contains: query, mode: "insensitive" } },
        ...matchingTags.map((matchingTag) => ({ tags: { array_contains: [matchingTag] } }))
      ]
    });
  }

  const where: Prisma.MediaAssetWhereInput = { AND: clauses };
  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        alt: true,
        createdAt: true,
        driver: true,
        filename: true,
        folder: true,
        id: true,
        isPrivate: true,
        key: true,
        storageProviderId: true,
        tags: true,
        url: true
      }
    }),
    prisma.mediaAsset.count({ where })
  ]);

  return NextResponse.json(
    {
      assets: assets.map((asset) => ({
        alt: asset.alt || asset.filename,
        createdAt: asset.createdAt.toISOString(),
        filename: asset.filename,
        folder: asset.folder,
        id: asset.id,
        source: "library",
        tags: nonEmptyStringArrayFromUnknown(asset.tags),
        thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
        url: mediaAssetDisplayUrl(asset, MediaVariantType.HERO)
      })),
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      scope,
      tag,
      tagSummaries: summarizeMediaTags(tagRows),
      folders,
      total
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
