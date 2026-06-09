"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { mediaTagsFromInput, normalizeMediaFolder, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";

const mediaMetadataSchema = z
  .object({
    id: requiredText.optional(),
    alt: optionalStoredText,
    caption: optionalStoredText,
    credit: optionalStoredText,
    folder: optionalStoredText,
    tags: optionalStoredText,
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
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/modules/media?error=missing-file");
  }

  const metadata = await parseForm(mediaMetadataSchema, formData, "/admin/modules/media");

  try {
    await uploadMedia(file, metadata);
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "upload-failed";
    redirect(`/admin/modules/media?error=${message}`);
  }

  refreshMedia();
  redirect("/admin/modules/media?saved=upload");
}

export async function updateMediaAssetAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(mediaUpdateSchema, formData, "/admin/modules/media");

  await prisma.mediaAsset.update({
    where: { id: input.id },
    data: {
      alt: input.isDecorative ? "" : input.alt,
      caption: input.caption,
      credit: input.credit,
      folder: input.folder,
      tags: input.tags,
      isDecorative: input.isDecorative,
      isPrivate: input.isPrivate
    }
  });

  refreshMedia();
  redirect("/admin/modules/media?saved=metadata");
}

export async function archiveMediaAssetAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(mediaArchiveSchema, formData, "/admin/modules/media");

  await prisma.mediaAsset.update({
    where: { id: input.id },
    data: { deletedAt: new Date() }
  });

  refreshMedia();
  redirect("/admin/modules/media?saved=archive");
}

export async function restoreMediaAssetAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(mediaRestoreSchema, formData, "/admin/modules/media");

  await prisma.mediaAsset.update({
    where: { id: input.id },
    data: { deletedAt: null }
  });

  refreshMedia();
  redirect("/admin/modules/media?saved=restore");
}

export async function setHeroImageAction(formData: FormData) {
  await requireAdmin();

  const url = String(formData.get("url") || "/hero.svg");
  await prisma.siteSettings.update({
    where: { id: "site" },
    data: { heroImageUrl: url }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect("/admin/modules/media?saved=hero");
}
