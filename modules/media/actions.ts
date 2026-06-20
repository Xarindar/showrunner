"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HeroPresentationMode, HeroSlideElementType, MediaDriver } from "@prisma/client";
import { optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { getAccessibleMediaWhere, getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { ensureMediaAssetVariants, mediaTagsFromInput, normalizeMediaFolder, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
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
    folder: optionalStoredText,
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

export async function uploadMediaAction(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const settings = await getSiteSettings();
  const ownerStaffIds = await getOwnerStaffIds(user, settings.siteId);
  if ((await resolveDataScopeMode(user, settings.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("Create an active staff profile using this admin email before uploading scoped media.")}`);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/modules/media?error=missing-file");
  }

  const metadata = await parseForm(mediaMetadataSchema, formData, "/admin/modules/media");

  try {
    await uploadMedia(file, { ...metadata, uploadedByStaffId: ownerStaffIds[0] }, settings.mediaDriver, settings.siteId);
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "upload-failed";
    redirect(`/admin/modules/media?error=${message}`);
  }

  refreshMedia();
  redirect("/admin/modules/media?saved=upload");
}

export async function updateMediaAssetAction(formData: FormData) {
  const user = await requireAdmin("media:manage");
  const input = await parseForm(mediaUpdateSchema, formData, "/admin/modules/media");
  const siteId = await getCurrentSiteId();
  const accessibleWhere = await getAccessibleMediaWhere(user, siteId, { id: input.id });
  const existingAsset = await prisma.mediaAsset.findFirst({
    where: accessibleWhere,
    select: { driver: true }
  });

  if (!existingAsset) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("Media asset not found.")}`);
  }

  if (input.isPrivate && existingAsset.driver !== MediaDriver.R2) {
    redirect(`/admin/modules/media?error=${encodeURIComponent("Private media delivery is currently supported only for R2 assets.")}`);
  }

  await prisma.mediaAsset.updateMany({
    where: accessibleWhere,
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
  const user = await requireAdmin("media:manage");
  const input = await parseForm(mediaArchiveSchema, formData, "/admin/modules/media");
  const siteId = await getCurrentSiteId();

  await prisma.mediaAsset.updateMany({
    where: await getAccessibleMediaWhere(user, siteId, { id: input.id }),
    data: { deletedAt: new Date() }
  });

  refreshMedia();
  redirect("/admin/modules/media?saved=archive");
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

    const presentation = await tx.heroPresentation.upsert({
      where: { siteId },
      update: {},
      create: {
        siteId,
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
