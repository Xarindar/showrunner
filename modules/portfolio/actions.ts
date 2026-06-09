"use server";

import { randomUUID } from "crypto";
import { PortfolioAccessStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, PortfolioItemType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

const trimmed = z.string().transform((value) => value.trim());
const requiredText = trimmed.pipe(z.string().min(1));
const optionalStoredText = trimmed.transform((value) => value || "");
const optionalUrlOrPath = trimmed
  .refine((value) => value === "" || value.startsWith("/") || z.url().safeParse(value).success, "Use a valid URL or path.")
  .transform((value) => value || "");
const optionalSortOrder = trimmed
  .refine((value) => value === "" || /^-?\d+$/.test(value), "Use a whole number.")
  .transform((value) => (value === "" ? 0 : Number(value)));
const optionalDate = trimmed.transform((value, context) => {
  if (!value) return undefined;

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: "custom", message: "Use a valid date." });
    return z.NEVER;
  }

  return date;
});

const gallerySchema = z.object({
  title: requiredText,
  slug: optionalStoredText,
  description: optionalStoredText,
  status: z.enum(PortfolioGalleryStatus).catch(PortfolioGalleryStatus.DRAFT),
  visibility: z.enum(PortfolioGalleryVisibility).catch(PortfolioGalleryVisibility.PUBLIC),
  category: optionalStoredText,
  coverImageUrl: optionalUrlOrPath,
  location: optionalStoredText,
  shotAt: optionalDate,
  seoTitle: optionalStoredText,
  seoDescription: optionalStoredText,
  proofingEnabled: z.literal("on").optional(),
  downloadEnabled: z.literal("on").optional(),
  accessCode: optionalStoredText,
  rightsNotes: optionalStoredText,
  sortOrder: optionalSortOrder
});

const galleryStatusSchema = z.object({
  id: requiredText,
  status: z.enum(PortfolioGalleryStatus)
});

const galleryItemSchema = z
  .object({
    galleryId: requiredText,
    mediaAssetId: optionalStoredText,
    type: z.enum(PortfolioItemType).catch(PortfolioItemType.IMAGE),
    title: optionalStoredText,
    caption: optionalStoredText,
    altText: optionalStoredText,
    imageUrl: optionalUrlOrPath,
    thumbnailUrl: optionalUrlOrPath,
    sortOrder: optionalSortOrder,
    isCover: z.literal("on").optional(),
    isDownloadable: z.literal("on").optional(),
    isWatermarked: z.literal("on").optional(),
    licenseNotes: optionalStoredText
  })
  .refine((value) => value.mediaAssetId || value.imageUrl, {
    message: "Choose a media asset or provide a URL.",
    path: ["imageUrl"]
  });

const accessSchema = z.object({
  galleryId: requiredText,
  clientId: optionalStoredText,
  recipientEmail: z.email().transform((value) => value.trim().toLowerCase()),
  accessToken: optionalStoredText,
  expiresAt: optionalDate
});

const accessStatusSchema = z.object({
  id: requiredText,
  status: z.enum(PortfolioAccessStatus)
});

async function generateUniquePortfolioSlug(input: { title: string; slug?: string; exceptId?: string }) {
  const base = slugify(input.slug || input.title) || "gallery";
  let candidate = base;
  let suffix = 2;

  while (
    await prisma.portfolioGallery.findFirst({
      where: {
        slug: candidate,
        id: input.exceptId ? { not: input.exceptId } : undefined
      },
      select: { id: true }
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function refreshPortfolio() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/portfolio");
}

function galleryRedirect(galleryId: string, saved: string) {
  redirect(`/admin/modules/portfolio?saved=${saved}&gallery=${galleryId}`);
}

export async function createPortfolioGalleryAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(gallerySchema, formData, "/admin/modules/portfolio");
  const slug = await generateUniquePortfolioSlug({ title: input.title, slug: input.slug });
  const accessCodeHash = input.accessCode ? await bcrypt.hash(input.accessCode, 12) : "";

  try {
    const gallery = await prisma.portfolioGallery.create({
      data: {
        slug,
        title: input.title,
        description: input.description,
        status: input.status,
        visibility: input.visibility,
        category: input.category,
        coverImageUrl: input.coverImageUrl,
        location: input.location,
        shotAt: input.shotAt,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        proofingEnabled: input.proofingEnabled === "on",
        downloadEnabled: input.downloadEnabled === "on",
        accessCodeHash,
        rightsNotes: input.rightsNotes,
        sortOrder: input.sortOrder,
        publishedAt: input.status === PortfolioGalleryStatus.PUBLISHED ? new Date() : undefined
      }
    });

    refreshPortfolio();
    galleryRedirect(gallery.id, "gallery");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/portfolio?error=${encodeURIComponent("A gallery with that slug already exists.")}`);
    }

    throw error;
  }
}

export async function updatePortfolioGalleryStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(galleryStatusSchema, formData, "/admin/modules/portfolio");

  await prisma.portfolioGallery.update({
    where: { id: input.id },
    data: {
      status: input.status,
      publishedAt: input.status === PortfolioGalleryStatus.PUBLISHED ? new Date() : undefined
    }
  });

  refreshPortfolio();
}

export async function addPortfolioGalleryItemAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(galleryItemSchema, formData, "/admin/modules/portfolio");
  const asset = input.mediaAssetId
    ? await prisma.mediaAsset.findUnique({
        where: { id: input.mediaAssetId },
        select: { url: true, alt: true, filename: true, deletedAt: true }
      })
    : null;

  if (asset?.deletedAt) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Choose an active media asset.")}`);
  }

  const imageUrl = input.imageUrl || asset?.url || "";
  const altText = input.altText || asset?.alt || input.title || asset?.filename || "";

  if (!imageUrl) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Choose a valid media asset or URL.")}`);
  }

  const itemData = {
    galleryId: input.galleryId,
    mediaAssetId: input.mediaAssetId || undefined,
    type: input.type,
    title: input.title,
    caption: input.caption,
    altText,
    imageUrl,
    thumbnailUrl: input.thumbnailUrl || imageUrl,
    sortOrder: input.sortOrder,
    isCover: input.isCover === "on",
    isDownloadable: input.isDownloadable === "on",
    isWatermarked: input.isWatermarked === "on",
    licenseNotes: input.licenseNotes
  };

  if (itemData.isCover) {
    await prisma.$transaction([
      prisma.portfolioGalleryItem.updateMany({
        where: { galleryId: input.galleryId },
        data: { isCover: false }
      }),
      prisma.portfolioGallery.update({
        where: { id: input.galleryId },
        data: { coverImageUrl: imageUrl }
      }),
      prisma.portfolioGalleryItem.create({ data: itemData })
    ]);
  } else {
    await prisma.portfolioGalleryItem.create({ data: itemData });
  }

  refreshPortfolio();
  galleryRedirect(input.galleryId, "item");
}

export async function createPortfolioAccessAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(accessSchema, formData, "/admin/modules/portfolio");

  await prisma.portfolioGalleryAccess.create({
    data: {
      galleryId: input.galleryId,
      clientId: input.clientId || undefined,
      recipientEmail: input.recipientEmail,
      accessToken: input.accessToken || randomUUID(),
      expiresAt: input.expiresAt
    }
  });

  refreshPortfolio();
  galleryRedirect(input.galleryId, "access");
}

export async function updatePortfolioAccessStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(accessStatusSchema, formData, "/admin/modules/portfolio");

  const access = await prisma.portfolioGalleryAccess.update({
    where: { id: input.id },
    data: { status: input.status },
    select: { galleryId: true }
  });

  refreshPortfolio();
  redirect(`/admin/modules/portfolio?saved=access&gallery=${access.galleryId}`);
}
