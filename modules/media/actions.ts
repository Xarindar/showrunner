"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HeroPresentationMode, HeroSlideElementType, MediaVariantType } from "@prisma/client";
import { optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { getAccessibleMediaWhere, getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { ensureMediaAssetVariants, mediaAssetDisplayUrl, mediaAssetIdFromUrl, mediaTagsFromInput, normalizeMediaFolder, supportsPrivateMediaDriver, uploadMedia } from "@/lib/media";
import { mediaReferenceCount, mediaReferenceCountSelect, unreferencedMediaWhere } from "@/lib/media-usage";
import { prisma } from "@/lib/prisma";
import { validMediaFolderPath } from "@/lib/media-folders";
import { getCurrentSiteId, getSiteSettings, getSiteSettingsForSite } from "@/lib/site";
import { defaultHeroSlideFromSettings, heroElementsArray, type HeroElementType } from "@/modules/content/hero-presentation";

const heroElementTypeMap: Record<HeroElementType, HeroSlideElementType> = {
  IMAGE: HeroSlideElementType.IMAGE,
  HEADLINE: HeroSlideElementType.HEADLINE,
  CAPTION: HeroSlideElementType.CAPTION,
  CTA: HeroSlideElementType.CTA
};

const focalPoint = optionalStoredText
  .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 1), "Use a value from 0 to 1.")
  .transform((value) => (value === "" ? 0.5 : Number(value)));

const mediaMetadataSchema = z
  .object({
    id: requiredText.optional(),
    alt: optionalStoredText,
    caption: optionalStoredText,
    credit: optionalStoredText,
    focalPointX: focalPoint,
    focalPointY: focalPoint,
    folder: optionalStoredText.refine(validMediaFolderPath, "Use a folder path under 200 characters without backslashes or dot segments."),
    tags: optionalStoredText,
    usageContext: optionalStoredText,
    isDecorative: z.literal("on").optional(),
    isPrivate: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    folder: normalizeMediaFolder(value.folder),
    isDecorative: value.isDecorative === "on",
    isPrivate: value.isPrivate === "on",
    tags: mediaTagsFromInput(value.tags)
  }))
  .refine((value) => value.isDecorative || value.alt, {
    message: "Add alt text or mark the image decorative.",
    path: ["alt"]
  });

const mediaUpdateSchema = mediaMetadataSchema.and(z.object({ id: requiredText }));

const mediaArchiveSchema = z.object({
  id: requiredText,
  confirmArchive: z.literal("on", { error: "Confirm archive before removing this asset from active media." })
});

const mediaRestoreSchema = z.object({
  id: requiredText
});

function refreshMedia() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/modules/media");
  revalidatePath("/admin/modules/portfolio");
  revalidatePath("/galleries");
}

export async function createMediaFolder(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const siteId = await getCurrentSiteId();
  const parsed = z.string().trim().min(1, "Enter a folder name.").max(200, "Use 200 characters or fewer.").safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const parent = formData.get("parent") || "";
  if (typeof parent !== "string" || !validMediaFolderPath(parent)) return { error: "Choose a valid parent folder." };
  if (parsed.data.includes("/") || !validMediaFolderPath(parsed.data)) return { error: "Use a folder name without slashes or dot segments." };
  const name = normalizeMediaFolder([parent, parsed.data].filter(Boolean).join("/"));
  if (!validMediaFolderPath(name)) return { error: "The full folder path must be 200 characters or fewer." };
  try {
    if (parent && !await accessibleMediaFolder(user, siteId, parent)) return { error: "Parent folder not found. Refresh the library and try again." };
    await prisma.mediaFolder.create({ data: { siteId, name, createdByUserId: user.id } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { error: "A folder with this name already exists." };
    return { error: "The folder could not be created. Please try again." };
  }
  revalidatePath("/admin/modules/media");
  return { name };
}

async function accessibleMediaFolder(user: Awaited<ReturnType<typeof requireAdmin>>, siteId: string, folder: string) {
  if (!folder) return true;
  const ownFolders = (await resolveDataScopeMode(user, siteId, "media")) === "OWN";
  const savedFolder = await prisma.mediaFolder.findFirst({
    where: { siteId, OR: [{ name: folder }, { name: { startsWith: `${folder}/` } }], ...(ownFolders ? { createdByUserId: user.id } : {}) }, select: { id: true }
  });
  if (savedFolder) return true;
  return Boolean(await prisma.mediaAsset.findFirst({
    where: await getAccessibleMediaWhere(user, siteId, { deletedAt: null, OR: [{ folder }, { folder: { startsWith: `${folder}/` } }] }), select: { id: true }
  }));
}

export async function moveMediaAssetToFolder(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const parsed = z.object({ ids: z.array(requiredText).min(1).max(100), folder: z.string().trim().refine(validMediaFolderPath) })
    .safeParse({ ids: formData.getAll("id"), folder: formData.get("folder") });
  if (!parsed.success) return { error: "Choose a file and an existing folder." };
  const siteId = await getCurrentSiteId();
  const folder = normalizeMediaFolder(parsed.data.folder);
  const ids = [...new Set(parsed.data.ids)];
  const accessibleWhere = await getAccessibleMediaWhere(user, siteId, { deletedAt: null });
  try {
    if (!await accessibleMediaFolder(user, siteId, folder)) {
      return { error: "Folder not found. Refresh the library and try again." };
    }
    await prisma.$transaction(async tx => {
      const moved = await tx.mediaAsset.updateMany({
        where: { AND: [accessibleWhere, { id: { in: ids } }] }, data: { folder }
      });
      if (moved.count !== ids.length) throw new Error("Unavailable media selection");
    });
  } catch {
    return { error: "The file could not be moved. Please try again." };
  }
  revalidatePath("/admin/modules/media");
  return { success: true };
}

export async function renameMediaAsset(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const parsed = z.object({ id: requiredText, name: z.string().trim().min(1).max(200).regex(/^[^/\\\u0000-\u001f\u007f]+$/) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a filename under 200 characters without slashes." };
  const siteId = await getCurrentSiteId();
  const updated = await prisma.mediaAsset.updateMany({
    where: await getAccessibleMediaWhere(user, siteId, { id: parsed.data.id, deletedAt: null }),
    data: { filename: parsed.data.name }
  });
  if (updated.count !== 1) return { error: "File not found. Refresh the library and try again." };
  revalidatePath("/admin/modules/media");
  return { success: true };
}

export async function changeMediaFolder(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const parsed = z.object({ folder: z.string().min(1).refine(validMediaFolderPath), operation: z.enum(["rename", "move", "delete"]), value: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a valid folder action." };
  const { folder, operation, value } = parsed.data;
  const parent = folder.split("/").slice(0, -1).join("/");
  if (operation === "rename" && (!value || value.includes("/") || !validMediaFolderPath(value))) return { error: "Enter a folder name without slashes or dot segments." };
  const destination = operation === "rename" ? [parent, value].filter(Boolean).join("/") : [value, folder.split("/").at(-1)].filter(Boolean).join("/");
  if (operation !== "delete" && (!validMediaFolderPath(destination) || destination.startsWith(`${folder}/`))) return { error: "A folder cannot be moved inside itself, and its path must fit within 200 characters." };
  const siteId = await getCurrentSiteId();
  if (operation === "move" && !await accessibleMediaFolder(user, siteId, value)) return { error: "Destination folder not found." };
  const own = (await resolveDataScopeMode(user, siteId, "media")) === "OWN";
  const assetAccess = await getAccessibleMediaWhere(user, siteId, {});
  try {
    await prisma.$transaction(async tx => {
      const tree = { siteId, OR: [{ name: folder }, { name: { startsWith: `${folder}/` } }] };
      const files = { siteId, OR: [{ folder }, { folder: { startsWith: `${folder}/` } }] };
      const saved = await tx.mediaFolder.findMany({ where: tree });
      const assets = await tx.mediaAsset.findMany({ where: { AND: [files, assetAccess] }, select: { id: true, folder: true, deletedAt: true } });
      if ((!saved.length && !assets.length) || saved.some(item => own && item.createdByUserId !== user.id) || assets.length !== await tx.mediaAsset.count({ where: files })) throw new Error("This folder is unavailable or contains files managed by another user.");
      if (operation === "delete") {
        if (assets.some(asset => !asset.deletedAt) || saved.some(item => item.name !== folder)) throw new Error("This folder is not empty. Move or delete its files and subfolders first.");
        // Archived files stay recoverable without recreating a deleted folder on restore.
        await tx.mediaAsset.updateMany({ where: { AND: [files, assetAccess] }, data: { folder: parent } });
        await tx.mediaFolder.deleteMany({ where: tree });
        return;
      }
      if (destination === folder) return;
      const occupied = await tx.mediaFolder.count({ where: { siteId, OR: [{ name: destination }, { name: { startsWith: `${destination}/` } }] } });
      const occupiedFiles = await tx.mediaAsset.count({ where: { siteId, OR: [{ folder: destination }, { folder: { startsWith: `${destination}/` } }] } });
      if (occupied || occupiedFiles) throw new Error("A folder with that name already exists at the destination.");
      for (const item of saved) {
        const name = destination + item.name.slice(folder.length);
        if (!validMediaFolderPath(name)) throw new Error("A nested folder path would exceed 200 characters.");
        await tx.mediaFolder.update({ where: { id: item.id }, data: { name } });
      }
      for (const asset of assets) {
        const path = destination + asset.folder.slice(folder.length);
        if (!validMediaFolderPath(path)) throw new Error("A nested folder path would exceed 200 characters.");
        await tx.mediaAsset.update({ where: { id: asset.id }, data: { folder: path } });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    return { error: error instanceof Error && !("code" in error) ? error.message : "The folder changed or its name is already taken. Refresh and try again." };
  }
  revalidatePath("/admin/modules/media");
  return { success: true };
}

export async function uploadLibraryAsset(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const settings = await getSiteSettings();
  const ownerStaffIds = await getOwnerStaffIds(user, settings.siteId);
  if ((await resolveDataScopeMode(user, settings.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    return { error: "Create an active staff profile using this admin email before uploading scoped media." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image to upload." };
  const parsed = mediaMetadataSchema.safeParse({ alt: "", caption: "", credit: "", focalPointX: "", focalPointY: "", folder: "", tags: "", usageContext: "", ...Object.fromEntries(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the image details." };
  try {
    const asset = await uploadMedia(file, { ...parsed.data, uploadedByStaffId: ownerStaffIds[0] }, settings.mediaDriver, settings.siteId);
    refreshMedia();
    return { asset: { id: asset.id, filename: asset.filename, alt: asset.alt || "", createdAt: asset.createdAt.toISOString(), folder: asset.folder,
      thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD), url: mediaAssetDisplayUrl(asset, MediaVariantType.HERO) } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Image upload failed." };
  }
}

export async function updateMediaAssetAction(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const input = await parseForm(mediaUpdateSchema, formData, "/admin/modules/media");
  const siteId = await getCurrentSiteId();
  const accessibleWhere = await getAccessibleMediaWhere(user, siteId, { id: input.id });
  const existingAsset = await prisma.mediaAsset.findFirst({
    where: accessibleWhere,
    select: {
      driver: true,
      isPrivate: true,
      clientFiles: { select: { id: true }, take: 1 },
      purchasedSelections: { select: { id: true }, take: 1 },
      portfolioItems: {
        where: { gallery: { OR: [{ visibility: { not: "PUBLIC" } }, { clientId: { not: null } }] } },
        select: { id: true }, take: 1
      }
    }
  });

  if (!existingAsset) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("Media asset not found.")}`);
  }

  if (input.isPrivate && !supportsPrivateMediaDriver(existingAsset.driver)) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("Private media delivery is currently supported only for server assets, S3, or R2 assets.")}`);
  }

  if (input.isPrivate && !existingAsset.isPrivate) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("A previously public file may still be available from its old URL or cache. Upload a new private copy for secure client delivery.")}`);
  }

  if (!input.isPrivate && (existingAsset.clientFiles.length || existingAsset.portfolioItems.length || existingAsset.purchasedSelections.length)) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("This asset belongs to a private client file, shoot, or purchase. Keep it private; upload a separate curated public copy instead.")}`);
  }

  const updated = await prisma.mediaAsset.updateMany({
    where: {
      AND: [accessibleWhere, ...(!input.isPrivate ? [{
        clientFiles: { none: {} },
        purchasedSelections: { none: {} },
        portfolioItems: { none: { gallery: { OR: [{ visibility: { not: "PUBLIC" as const } }, { clientId: { not: null } }] } } }
      }] : [])]
    },
    data: {
      alt: input.isDecorative ? "" : input.alt,
      caption: input.caption,
      credit: input.credit,
      focalPointX: input.focalPointX,
      focalPointY: input.focalPointY,
      folder: input.folder,
      tags: input.tags,
      usageContext: input.usageContext,
      isDecorative: input.isDecorative,
      isPrivate: input.isPrivate
    }
  });
  if (updated.count !== 1) redirect(`/admin/modules/media?error=${encodeURIComponent("This asset changed or has protected private references. Refresh the library before saving it.")}`);
  const asset = await prisma.mediaAsset.findFirst({
    where: accessibleWhere,
    select: { driver: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
  });

  if (asset) {
    await ensureMediaAssetVariants(asset);
  }

  refreshMedia();
  redirect("/admin/modules/media?saved=metadata");
}

export async function archiveMediaAssetAction(formData: FormData) {
  const result = await deleteMediaAsset(formData);
  if (result.error) redirect(`/admin/modules/media?error=${encodeURIComponent(result.error)}`);
  redirect("/admin/modules/media?saved=archive");
}

export async function deleteMediaAsset(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const parsed = mediaArchiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Confirm deletion before removing this file." };
  const input = parsed.data;
  const siteId = await getCurrentSiteId();

  const accessibleWhere = await getAccessibleMediaWhere(user, siteId, { id: input.id });
  const [asset, settings] = await Promise.all([
    prisma.mediaAsset.findFirst({ where: accessibleWhere, select: { id: true, _count: { select: mediaReferenceCountSelect } } }),
    getSiteSettingsForSite(siteId)
  ]);
  if (!asset) return { error: "Media asset not found." };
  if (mediaReferenceCount(asset._count) || [settings.heroImageUrl, settings.logoImageUrl].some((url) => mediaAssetIdFromUrl(url) === asset.id)) {
    return { error: "This file is still in use. Remove its gallery, purchase, client file, catalog, or site references before deleting it." };
  }
  const archived = await prisma.mediaAsset.updateMany({
    where: { AND: [accessibleWhere, unreferencedMediaWhere] },
    data: { deletedAt: new Date() }
  });
  if (archived.count !== 1) return { error: "This file changed or is still in use. Refresh the library before deleting it." };

  refreshMedia();
  return { success: true };
}

export async function restoreMediaAssetAction(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const input = await parseForm(mediaRestoreSchema, formData, "/admin/modules/media");
  const siteId = await getCurrentSiteId();

  await prisma.mediaAsset.updateMany({
    where: await getAccessibleMediaWhere(user, siteId, { id: input.id }),
    data: { deletedAt: null }
  });

  refreshMedia();
  redirect("/admin/modules/media?saved=restore");
}

export async function setHeroImageAction(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const siteId = await getCurrentSiteId();

  const url = String(formData.get("url") || "/hero.svg");
  const mediaRouteMatch = url.match(/^\/api\/media\/assets\/([^?]+)/);
  if (mediaRouteMatch?.[1]) {
    const asset = await prisma.mediaAsset.findFirst({
      where: await getAccessibleMediaWhere(user, siteId, { id: decodeURIComponent(mediaRouteMatch[1]) }),
      select: { deletedAt: true, isPrivate: true }
    });
    if (!asset || asset.deletedAt || asset.isPrivate) {
      redirect(`/admin/modules/media?error=${encodeURIComponent("Choose an active public asset for the hero image.")}`);
    }
  }

  const settings = await getSiteSettingsForSite(siteId);
  const fallbackSlide = {
    ...defaultHeroSlideFromSettings(settings),
    imageUrl: url
  };

  await prisma.$transaction(async (tx) => {
    await tx.siteSettings.update({
      where: { siteId },
      data: { heroImageUrl: url }
    });

    // "Set as hero" targets the primary venue profile's presentation.
    const presentation = await tx.heroPresentation.upsert({
      where: { siteId_profileKey: { siteId, profileKey: "cottage616" } },
      update: {},
      create: {
        siteId,
        profileKey: "cottage616",
        mode: HeroPresentationMode.STATIC,
        autoplayIntervalMs: 6500
      }
    });

    const firstSlide = await tx.heroSlide.findFirst({
      where: { presentationId: presentation.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true }
    });

    if (firstSlide) {
      await tx.heroSlide.update({
        where: { id: firstSlide.id },
        data: { imageUrl: url }
      });
    } else {
      await tx.heroSlide.create({
        data: {
          presentationId: presentation.id,
          sortOrder: 0,
          headline: fallbackSlide.headline,
          caption: fallbackSlide.caption,
          imageUrl: fallbackSlide.imageUrl,
          ctaLabel: fallbackSlide.ctaLabel,
          ctaHref: fallbackSlide.ctaHref,
          elements: {
            create: heroElementsArray(fallbackSlide.elements).map((element) => ({
              type: heroElementTypeMap[element.type],
              gridColumn: element.gridColumn,
              gridRow: element.gridRow,
              columnSpan: element.columnSpan,
              rowSpan: element.rowSpan,
              zIndex: element.zIndex,
              isVisible: element.isVisible
            }))
          }
        }
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  revalidatePath("/sitemap.xml");
  redirect("/admin/modules/media?saved=hero");
}
