"use server";

import { randomUUID } from "crypto";
import {
  MediaVariantType,
  PortfolioAccessStatus,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioItemType,
  PortfolioProofRoundStatus,
  Prisma
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm } from "@/lib/admin-validation";
import { getAccessibleClientWhere, getAccessibleGalleryWhere, getAccessibleMediaWhere, getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
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
  confirmArchive: z.literal("on").optional(),
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

const proofRoundSchema = z.object({
  dueAt: optionalDate,
  galleryId: requiredText,
  instructions: optionalStoredText,
  title: optionalStoredText
});

const proofRoundStatusSchema = z.object({
  confirmTransition: z.literal("on").optional(),
  id: requiredText,
  status: z.enum(PortfolioProofRoundStatus)
});

async function generateUniquePortfolioSlug(input: { title: string; slug?: string; siteId: string; exceptId?: string }) {
  const siteId = input.siteId;
  const base = slugify(input.slug || input.title) || "gallery";
  let candidate = base;
  let suffix = 2;

  while (
    await prisma.portfolioGallery.findFirst({
      where: {
        siteId,
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

async function scopedPortfolioOwnerId(user: Awaited<ReturnType<typeof requireAdmin>>, siteId: string) {
  if ((await resolveDataScopeMode(user, siteId, "portfolio")) !== "OWN") return undefined;

  const staffIds = await getOwnerStaffIds(user, siteId);
  if (!staffIds.length) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Create an active staff profile using this admin email before creating scoped galleries.")}`);
  }

  return staffIds[0];
}

function refreshPortfolio() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/portfolio");
}

function galleryRedirect(galleryId: string, saved: string) {
  redirect(`/admin/modules/portfolio?saved=${saved}&gallery=${galleryId}`);
}

async function nextProofRoundNumber(galleryId: string) {
  const latest = await prisma.portfolioProofRound.findFirst({
    where: { galleryId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true }
  });

  return (latest?.roundNumber || 0) + 1;
}

export async function createPortfolioGalleryAction(formData: FormData) {
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(gallerySchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const photographerId = await scopedPortfolioOwnerId(user, siteId);
  const slug = await generateUniquePortfolioSlug({ title: input.title, slug: input.slug, siteId });
  const accessCodeHash = input.accessCode ? await bcrypt.hash(input.accessCode, 12) : "";

  try {
    const gallery = await prisma.portfolioGallery.create({
      data: {
        siteId,
        photographerId,
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
        publishedAt: input.status === PortfolioGalleryStatus.PUBLISHED ? new Date() : undefined,
        proofRounds:
          input.proofingEnabled === "on"
            ? {
                create: {
                  siteId,
                  roundNumber: 1,
                  title: "Round 1"
                }
              }
            : undefined
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
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(galleryStatusSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();

  if (input.status === PortfolioGalleryStatus.ARCHIVED && input.confirmArchive !== "on") {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Confirm archive before marking a gallery archived.")}`);
  }

  await prisma.portfolioGallery.updateMany({
    where: await getAccessibleGalleryWhere(user, siteId, { id: input.id }),
    data: {
      status: input.status,
      publishedAt: input.status === PortfolioGalleryStatus.PUBLISHED ? new Date() : undefined
    }
  });

  refreshPortfolio();
}

export async function createPortfolioProofRoundAction(formData: FormData) {
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(proofRoundSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const gallery = await prisma.portfolioGallery.findFirst({
    where: await getAccessibleGalleryWhere(user, siteId, { id: input.galleryId }),
    select: { id: true, proofingEnabled: true }
  });

  if (!gallery) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Gallery not found.")}`);
  }

  if (!gallery.proofingEnabled) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Enable proofing before starting a revision round.")}`);
  }

  const openRound = await prisma.portfolioProofRound.findFirst({
    where: {
      galleryId: gallery.id,
      status: PortfolioProofRoundStatus.OPEN
    },
    select: { id: true }
  });

  if (openRound) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Lock or approve the open round before starting another revision round.")}`);
  }

  const roundNumber = await nextProofRoundNumber(gallery.id);
  await prisma.portfolioProofRound.create({
    data: {
      siteId,
      galleryId: gallery.id,
      roundNumber,
      title: input.title || `Round ${roundNumber}`,
      instructions: input.instructions,
      dueAt: input.dueAt
    }
  });

  refreshPortfolio();
  galleryRedirect(gallery.id, "round");
}

export async function updatePortfolioProofRoundStatusAction(formData: FormData) {
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(proofRoundStatusSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const galleryWhere = await getAccessibleGalleryWhere(user, siteId);
  const round = await prisma.portfolioProofRound.findFirst({
    where: { id: input.id, siteId, gallery: galleryWhere },
    select: { galleryId: true, status: true }
  });

  if (!round) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Proofing round not found.")}`);
  }

  const confirmStatuses: PortfolioProofRoundStatus[] = [
    PortfolioProofRoundStatus.APPROVED,
    PortfolioProofRoundStatus.CHANGES_REQUESTED,
    PortfolioProofRoundStatus.LOCKED
  ];
  const needsConfirm = confirmStatuses.includes(input.status);

  if (needsConfirm && input.confirmTransition !== "on") {
    redirect(`/admin/modules/portfolio?gallery=${round.galleryId}&error=${encodeURIComponent("Confirm the proofing status change before saving it.")}`);
  }

  await prisma.portfolioProofRound.updateMany({
    where: { id: input.id, siteId, gallery: galleryWhere },
    data: {
      status: input.status,
      closedAt: input.status === PortfolioProofRoundStatus.OPEN ? null : new Date()
    }
  });

  refreshPortfolio();
  galleryRedirect(round.galleryId, "round");
}

export async function addPortfolioGalleryItemAction(formData: FormData) {
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(galleryItemSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const gallery = await prisma.portfolioGallery.findFirst({
    where: await getAccessibleGalleryWhere(user, siteId, { id: input.galleryId }),
    select: { id: true, slug: true, visibility: true }
  });

  if (!gallery) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Gallery not found.")}`);
  }

  const asset = input.mediaAssetId
    ? await prisma.mediaAsset.findFirst({
        where: await getAccessibleMediaWhere(user, siteId, { id: input.mediaAssetId }),
        select: { alt: true, deletedAt: true, filename: true, id: true, isDecorative: true, isPrivate: true, url: true }
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

  if (asset && !asset.isDecorative && !altText.trim()) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Add alt text or mark the media asset decorative before public use.")}`);
  }

  if (asset?.isPrivate && gallery.visibility === PortfolioGalleryVisibility.PUBLIC) {
    redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Private media assets require a private or password gallery.")}`);
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
    await prisma.$transaction(async (tx) => {
      await tx.portfolioGalleryItem.updateMany({
        where: { galleryId: input.galleryId },
        data: { isCover: false }
      });
      const created = await tx.portfolioGalleryItem.create({ data: itemData });
      await tx.portfolioGallery.update({
        where: { id: input.galleryId },
        data: {
          coverImageUrl: input.mediaAssetId
            ? `/galleries/${encodeURIComponent(gallery.slug)}/media/${encodeURIComponent(created.id)}?variant=${MediaVariantType.HERO}`
            : imageUrl
        }
      });
    });
  } else {
    await prisma.portfolioGalleryItem.create({ data: itemData });
  }

  refreshPortfolio();
  galleryRedirect(input.galleryId, "item");
}

export async function createPortfolioAccessAction(formData: FormData) {
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(accessSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const gallery = await prisma.portfolioGallery.findFirst({
    where: await getAccessibleGalleryWhere(user, siteId, { id: input.galleryId }),
    select: { siteId: true }
  });
  if (!gallery) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Gallery not found.")}`);
  }
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: await getAccessibleClientWhere(user, siteId, { id: input.clientId }),
      select: { id: true }
    });
    if (!client) {
      redirect(`/admin/modules/portfolio?gallery=${input.galleryId}&error=${encodeURIComponent("Client not found.")}`);
    }
  }

  await prisma.portfolioGalleryAccess.create({
    data: {
      siteId: gallery.siteId,
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
  const user = await requireAdmin("portfolio:manage");
  const input = await parseForm(accessStatusSchema, formData, "/admin/modules/portfolio");
  const siteId = await getCurrentSiteId();
  const galleryWhere = await getAccessibleGalleryWhere(user, siteId);

  const access = await prisma.portfolioGalleryAccess.findFirst({
    where: { id: input.id, siteId, gallery: galleryWhere },
    select: { galleryId: true }
  });

  if (!access) {
    redirect(`/admin/modules/portfolio?error=${encodeURIComponent("Access link not found.")}`);
  }

  await prisma.portfolioGalleryAccess.updateMany({
    where: { id: input.id, siteId, gallery: galleryWhere },
    data: { status: input.status }
  });

  refreshPortfolio();
  redirect(`/admin/modules/portfolio?saved=access&gallery=${access.galleryId}`);
}
