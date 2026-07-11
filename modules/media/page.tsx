import { MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { nonEmptyStringArrayFromUnknown } from "@/lib/format";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl, mediaAssetIdFromUrl } from "@/lib/media";
import { summarizeMediaTags } from "@/lib/media-tags";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  MediaLibraryWorkspace,
  type MediaLibraryAsset,
  type MediaLibraryFilters
} from "./media-library-workspace";

export const dynamic = "force-dynamic";

const pageSize = 24;
const homeRecentSize = 8;
const recentWindowDays = 30;
const builtInAssets = [
  {
    alt: "Neutral admin template hero",
    filename: "hero.svg",
    height: 1000,
    url: "/hero.svg",
    width: 1400
  }
];

type MediaPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function recentCutoffDate() {
  return new Date(Date.now() - recentWindowDays * 24 * 60 * 60 * 1000);
}

function oneOf<T extends string>(value: string | undefined, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function positiveInteger(value: string | undefined, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeDecodedMessage(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function savedMessage(value: string | undefined) {
  const messages: Record<string, string> = {
    archive: "Asset moved to the archive.",
    hero: "Homepage hero updated.",
    metadata: "Asset details saved.",
    restore: "Asset restored to the active library.",
    upload: "Asset uploaded and added to your library."
  };
  return value ? messages[value] || "Media changes saved." : "";
}

function filtersFromParams(params: Record<string, string | undefined>): MediaLibraryFilters {
  const requestedScope = oneOf(
    params.scope,
    ["home", "all", "recent", "private", "needs-alt", "archived", "built-in"] as const,
    "home"
  );
  const hasBrowseFilter = Boolean(params.q || params.folder || params.tag || (params.kind && params.kind !== "all"));

  return {
    folder: (params.folder || "").trim().slice(0, 200),
    kind: oneOf(params.kind, ["all", "image", "other"] as const, "all"),
    page: positiveInteger(params.page),
    q: (params.q || "").trim().slice(0, 180),
    scope: requestedScope === "home" && hasBrowseFilter ? "all" : requestedScope,
    sort: oneOf(params.sort, ["newest", "oldest", "name", "largest"] as const, "newest"),
    tag: (params.tag || "").trim().slice(0, 120)
  };
}

function orderByFor(sort: MediaLibraryFilters["sort"]): Prisma.MediaAssetOrderByWithRelationInput {
  if (sort === "oldest") return { createdAt: "asc" };
  if (sort === "name") return { filename: "asc" };
  if (sort === "largest") return { sizeBytes: "desc" };
  return { createdAt: "desc" };
}

function formatFromMime(mimeType: string) {
  const subtype = mimeType.split("/")[1] || "";
  return subtype.replace("svg+xml", "svg").toLocaleUpperCase();
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const [user, params, settings] = await Promise.all([requireAdmin("media:manage"), searchParams, getSiteSettings()]);
  const filters = filtersFromParams(params);
  const matchingBuiltInAssets = builtInAssets.filter((asset) => {
    if (filters.kind === "other") return false;
    if (!filters.q) return true;
    const query = filters.q.toLocaleLowerCase();
    return asset.filename.toLocaleLowerCase().includes(query) || asset.alt.toLocaleLowerCase().includes(query);
  });
  const recentSince = recentCutoffDate();
  const activeAccess = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null });
  const archivedAccess = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: { not: null } });
  const baseAccess = filters.scope === "archived" ? archivedAccess : activeAccess;
  const clauses: Prisma.MediaAssetWhereInput[] = [baseAccess];

  if (filters.scope === "recent") clauses.push({ createdAt: { gte: recentSince } });
  if (filters.scope === "private") clauses.push({ isPrivate: true });
  if (filters.scope === "needs-alt") {
    clauses.push({
      isDecorative: false,
      OR: [{ alt: null }, { alt: "" }]
    });
  }
  if (filters.scope === "built-in") clauses.push({ id: "__built_in_asset__" });
  if (filters.folder) clauses.push({ folder: filters.folder });
  if (filters.tag) clauses.push({ tags: { array_contains: [filters.tag] } });
  if (filters.kind === "image") clauses.push({ mimeType: { startsWith: "image/", mode: "insensitive" } });
  if (filters.kind === "other") clauses.push({ NOT: { mimeType: { startsWith: "image/", mode: "insensitive" } } });
  if (filters.q) {
    clauses.push({
      OR: [
        { filename: { contains: filters.q, mode: "insensitive" } },
        { alt: { contains: filters.q, mode: "insensitive" } },
        { caption: { contains: filters.q, mode: "insensitive" } },
        { credit: { contains: filters.q, mode: "insensitive" } },
        { folder: { contains: filters.q, mode: "insensitive" } },
        { usageContext: { contains: filters.q, mode: "insensitive" } }
      ]
    });
  }

  const visibleWhere: Prisma.MediaAssetWhereInput = { AND: clauses };
  const needsAltWhere: Prisma.MediaAssetWhereInput = {
    AND: [activeAccess, { isDecorative: false, OR: [{ alt: null }, { alt: "" }] }]
  };
  const recentWhere: Prisma.MediaAssetWhereInput = { AND: [activeAccess, { createdAt: { gte: recentSince } }] };
  const privateWhere: Prisma.MediaAssetWhereInput = { AND: [activeAccess, { isPrivate: true }] };

  const [activeCount, archivedCount, recentCount, privateCount, needsAltCount, folderGroups, tagRows, databaseResultCount] = await Promise.all([
    prisma.mediaAsset.count({ where: activeAccess }),
    prisma.mediaAsset.count({ where: archivedAccess }),
    prisma.mediaAsset.count({ where: recentWhere }),
    prisma.mediaAsset.count({ where: privateWhere }),
    prisma.mediaAsset.count({ where: needsAltWhere }),
    prisma.mediaAsset.groupBy({
      by: ["folder"],
      where: activeAccess,
      _count: { _all: true },
      orderBy: { folder: "asc" },
      take: 24
    }),
    prisma.mediaAsset.findMany({
      where: activeAccess,
      select: { tags: true },
      take: 5000
    }),
    filters.scope === "built-in" ? Promise.resolve(matchingBuiltInAssets.length) : prisma.mediaAsset.count({ where: visibleWhere })
  ]);

  const resultCount = filters.scope === "built-in" ? matchingBuiltInAssets.length : databaseResultCount;
  const pageCount = filters.scope === "home" ? 1 : Math.max(1, Math.ceil(resultCount / pageSize));
  const page = Math.min(filters.page, pageCount);
  const normalizedFilters = { ...filters, page };
  const heroAssetId = mediaAssetIdFromUrl(settings.heroImageUrl);
  const logoAssetId = mediaAssetIdFromUrl(settings.logoImageUrl);

  const databaseAssets = filters.scope === "built-in"
    ? []
    : await prisma.mediaAsset.findMany({
        where: visibleWhere,
        include: {
          _count: {
            select: {
              clientFiles: true,
              productMedia: true,
              serviceCategories: true,
              services: true
            }
          },
          variants: {
            select: { format: true, height: true, sizeBytes: true, type: true, width: true }
          }
        },
        orderBy: orderByFor(filters.sort),
        skip: filters.scope === "home" ? 0 : (page - 1) * pageSize,
        take: filters.scope === "home" ? homeRecentSize : pageSize
      });

  const assets: MediaLibraryAsset[] = filters.scope === "built-in"
    ? matchingBuiltInAssets.map((asset) => ({
        alt: asset.alt,
        builtIn: true,
        caption: "A reusable neutral hero illustration included with Showrunner.",
        createdAt: "",
        credit: "Showrunner",
        displayUrl: asset.url,
        driver: "REPO",
        filename: asset.filename,
        focalPointX: 0.5,
        focalPointY: 0.5,
        folder: "Built-in",
        format: "SVG",
        fullUrl: asset.url,
        height: asset.height,
        heroUrl: asset.url,
        id: `built-in:${asset.filename}`,
        isDecorative: false,
        isHero: settings.heroImageUrl === asset.url,
        isLogo: settings.logoImageUrl === asset.url,
        isPrivate: false,
        mimeType: "image/svg+xml",
        sizeBytes: 0,
        tags: ["built-in", "hero"],
        updatedAt: "",
        usageContext: "hero",
        usageCount: 0,
        variantCount: 0,
        width: asset.width
      }))
    : databaseAssets.map((asset) => {
        const preferredVariant =
          asset.variants.find((variant) => variant.type === MediaVariantType.FULL) ||
          asset.variants.find((variant) => variant.type === MediaVariantType.HERO) ||
          asset.variants.find((variant) => variant.type === MediaVariantType.CARD) ||
          asset.variants[0];
        const usageCount = asset._count.clientFiles + asset._count.productMedia + asset._count.serviceCategories + asset._count.services;
        return {
          alt: asset.alt || "",
          caption: asset.caption,
          createdAt: asset.createdAt.toISOString(),
          credit: asset.credit,
          displayUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
          driver: asset.driver,
          filename: asset.filename,
          focalPointX: asset.focalPointX,
          focalPointY: asset.focalPointY,
          folder: asset.folder,
          format: preferredVariant?.format?.toLocaleUpperCase() || formatFromMime(asset.mimeType),
          fullUrl: mediaAssetDisplayUrl(asset, MediaVariantType.FULL),
          height: preferredVariant?.height || 0,
          heroUrl: mediaAssetDisplayUrl(asset, MediaVariantType.HERO),
          id: asset.id,
          isDecorative: asset.isDecorative,
          isHero: heroAssetId === asset.id,
          isLogo: logoAssetId === asset.id,
          isPrivate: asset.isPrivate,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes || preferredVariant?.sizeBytes || 0,
          tags: nonEmptyStringArrayFromUnknown(asset.tags),
          updatedAt: asset.updatedAt.toISOString(),
          usageContext: asset.usageContext,
          usageCount,
          variantCount: asset.variants.length,
          width: preferredVariant?.width || 0
        };
      });

  return (
    <MediaLibraryWorkspace
      key={`${normalizedFilters.scope}:${normalizedFilters.folder}:${normalizedFilters.tag}:${normalizedFilters.kind}:${normalizedFilters.sort}:${normalizedFilters.q}:${normalizedFilters.page}`}
      activeCount={activeCount}
      archivedCount={archivedCount}
      assets={assets}
      builtInCount={builtInAssets.length}
      canUpload={isMediaUploadDriverConfigured(settings.mediaDriver)}
      errorMessage={params.error === "missing-file" ? "Choose a file before uploading." : safeDecodedMessage(params.error)}
      filters={normalizedFilters}
      folders={folderGroups.filter((group) => Boolean(group.folder)).map((group) => ({ count: group._count._all, name: group.folder }))}
      mediaDriver={settings.mediaDriver}
      needsAltCount={needsAltCount}
      pageCount={pageCount}
      privateCount={privateCount}
      recentCount={recentCount}
      resultCount={resultCount}
      savedMessage={savedMessage(params.saved)}
      tags={summarizeMediaTags(tagRows)}
    />
  );
}
