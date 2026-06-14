"use server";

import {
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioProofApprovalStatus,
  PortfolioProofItemStatus,
  PortfolioProofRoundStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { emitModuleEvent } from "@/lib/events/emit";
import { formDataObject } from "@/lib/form-data";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

const favoriteSchema = z.object({
  accessToken: z.string().trim().optional().default(""),
  companyWebsite: z.string().trim().optional().default(""),
  galleryId: z.string().min(1),
  itemId: z.string().min(1),
  notes: z.string().trim().max(1000).optional().default(""),
  pathname: z.string().trim().optional().default(""),
  slug: z.string().trim().min(1),
  viewerEmail: z.email("Use a valid email for proofing favorites.").transform((value) => value.trim().toLowerCase())
});

const proofCommentSchema = z.object({
  accessToken: z.string().trim().optional().default(""),
  authorName: z.string().trim().max(160).optional().default(""),
  body: z.string().trim().min(2, "Add a comment before submitting.").max(2000, "Keep comments under 2,000 characters."),
  companyWebsite: z.string().trim().optional().default(""),
  galleryId: z.string().min(1),
  itemId: z.string().trim().optional().default(""),
  pathname: z.string().trim().optional().default(""),
  roundId: z.string().min(1),
  slug: z.string().trim().min(1),
  viewerEmail: z.email("Use a valid email for proofing comments.").transform((value) => value.trim().toLowerCase())
});

const proofItemDecisionSchema = z.object({
  accessToken: z.string().trim().optional().default(""),
  companyWebsite: z.string().trim().optional().default(""),
  galleryId: z.string().min(1),
  itemId: z.string().min(1),
  notes: z.string().trim().max(1000).optional().default(""),
  pathname: z.string().trim().optional().default(""),
  roundId: z.string().min(1),
  slug: z.string().trim().min(1),
  status: z.enum(PortfolioProofItemStatus),
  viewerEmail: z.email("Use a valid email for proofing decisions.").transform((value) => value.trim().toLowerCase())
});

const proofApprovalSchema = z.object({
  accessToken: z.string().trim().optional().default(""),
  approvalConfirmed: z.literal("on").optional(),
  approverName: z.string().trim().max(160).optional().default(""),
  companyWebsite: z.string().trim().optional().default(""),
  galleryId: z.string().min(1),
  notes: z.string().trim().max(2000).optional().default(""),
  pathname: z.string().trim().optional().default(""),
  roundId: z.string().min(1),
  slug: z.string().trim().min(1),
  status: z.enum(PortfolioProofApprovalStatus),
  viewerEmail: z.email("Use a valid email for proof approval.").transform((value) => value.trim().toLowerCase())
});

function galleryRedirect(
  slug: string,
  accessToken: string,
  key: "approved" | "commented" | "decision" | "favorited" | "error",
  value: string
): never {
  const params = new URLSearchParams();
  if (accessToken) params.set("access", accessToken);
  params.set(key, value);
  redirect(`/galleries/${slug}?${params.toString()}`);
}

async function requirePublicProofingContext(input: {
  accessToken: string;
  galleryId: string;
  itemId?: string;
  roundId: string;
  slug: string;
}) {
  const context = await requirePublicGalleryContext({
    ...input,
    requireAccess: true,
    requireOpenRound: true
  });

  if (!context.round) {
    galleryRedirect(input.slug, input.accessToken, "error", "This proofing round is not open for changes.");
  }
  if (!context.access) {
    galleryRedirect(input.slug, input.accessToken, "error", "This gallery needs an active access link.");
  }

  return { ...context, access: context.access, round: context.round };
}

async function requirePublicGalleryContext(input: {
  accessToken: string;
  galleryId: string;
  itemId?: string;
  requireAccess?: boolean;
  requireOpenRound?: boolean;
  roundId?: string;
  slug: string;
}) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) {
    redirect("/");
  }

  const gallery = await prisma.portfolioGallery.findFirst({
    where: {
      siteId: settings.siteId,
      id: input.galleryId,
      status: PortfolioGalleryStatus.PUBLISHED
    },
    select: {
      id: true,
      proofingEnabled: true,
      slug: true,
      title: true,
      visibility: true
    }
  });

  if (!gallery || gallery.slug !== input.slug) {
    redirect("/");
  }

  if (!gallery.proofingEnabled) {
    galleryRedirect(input.slug, input.accessToken, "error", "Proofing is not enabled for this gallery.");
  }

  const access = input.accessToken ? await findActiveGalleryAccess(input.accessToken, gallery.id, settings.siteId) : null;
  if ((input.requireAccess || gallery.visibility !== PortfolioGalleryVisibility.PUBLIC) && !access) {
    galleryRedirect(input.slug, input.accessToken, "error", "This gallery needs an active access link.");
  }

  const round =
    input.roundId && input.requireOpenRound
      ? await prisma.portfolioProofRound.findFirst({
          where: {
            id: input.roundId,
            galleryId: gallery.id,
            siteId: settings.siteId,
            status: PortfolioProofRoundStatus.OPEN
          },
          select: { id: true, roundNumber: true, title: true }
        })
      : null;

  if (input.requireOpenRound && !round) {
    galleryRedirect(input.slug, input.accessToken, "error", "This proofing round is not open for changes.");
  }

  const item = input.itemId
    ? await prisma.portfolioGalleryItem.findFirst({
        where: {
          id: input.itemId,
          galleryId: gallery.id
        },
        select: {
          id: true,
          mediaAssetId: true,
          title: true
        }
      })
    : null;

  if (input.itemId && !item) {
    galleryRedirect(input.slug, input.accessToken, "error", "That gallery item was not found.");
  }

  if (item?.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: item.mediaAssetId, siteId: settings.siteId },
      select: { deletedAt: true, isPrivate: true }
    });

    if (!asset || asset.deletedAt || (asset.isPrivate && !access)) {
      galleryRedirect(input.slug, input.accessToken, "error", "That gallery item is not available for proofing.");
    }
  }

  if (item && !item.mediaAssetId && gallery.visibility !== PortfolioGalleryVisibility.PUBLIC) {
    galleryRedirect(input.slug, input.accessToken, "error", "That gallery item is not available for proofing.");
  }

  return { access, gallery, item, round, settings };
}

function accessIdentity(access: NonNullable<Awaited<ReturnType<typeof findActiveGalleryAccess>>>) {
  return {
    accessId: access.id,
    clientId: access.clientId || undefined,
    viewerEmail: access.recipientEmail.trim().toLowerCase()
  };
}

export async function favoriteGalleryItemAction(formData: FormData) {
  const parsed = favoriteSchema.safeParse(formDataObject(formData));
  const fallbackSlug = String(formData.get("slug") || "");
  const fallbackToken = String(formData.get("accessToken") || "");

  if (!parsed.success) {
    galleryRedirect(fallbackSlug || "missing", fallbackToken, "error", parsed.error.issues[0]?.message || "Check the favorite form.");
  }

  const input = parsed.data;

  if (input.companyWebsite) {
    galleryRedirect(input.slug, input.accessToken, "favorited", input.itemId);
  }

  const rateLimitMessage = await publicRateLimitMessage(`gallery_favorite:${input.galleryId}`, {
    limit: 20,
    windowMinutes: 10
  });
  if (rateLimitMessage) {
    galleryRedirect(input.slug, input.accessToken, "error", rateLimitMessage);
  }

  const { access, gallery, item } = await requirePublicGalleryContext({
    accessToken: input.accessToken,
    galleryId: input.galleryId,
    itemId: input.itemId,
    slug: input.slug
  });
  if (!item) {
    galleryRedirect(input.slug, input.accessToken, "error", "That gallery item was not found.");
  }
  const actor = access ? accessIdentity(access) : { accessId: undefined, clientId: undefined, viewerEmail: input.viewerEmail };

  const existingFavorite = await prisma.portfolioGalleryFavorite.findFirst({
    where: {
      galleryId: gallery.id,
      itemId: item.id,
      viewerEmail: actor.viewerEmail
    }
  });
  const favorite = existingFavorite
    ? await prisma.portfolioGalleryFavorite.update({
        where: { id: existingFavorite.id },
        data: { notes: input.notes }
      })
    : await prisma.portfolioGalleryFavorite.create({
        data: {
          galleryId: gallery.id,
          itemId: item.id,
          clientId: actor.clientId,
          viewerEmail: actor.viewerEmail,
          notes: input.notes
        }
      });

  await emitModuleEvent("favorite.added", {
    actorEmail: actor.viewerEmail,
    metadata: {
      accessId: actor.accessId,
      galleryId: gallery.id,
      gallerySlug: gallery.slug,
      galleryTitle: gallery.title,
      itemId: item.id,
      itemTitle: item.title
    },
    pathname: input.pathname || `/galleries/${gallery.slug}`,
    relatedId: favorite.id,
    relatedType: "portfolio_gallery_favorite"
  });

  revalidatePath("/admin/modules/portfolio");
  revalidatePath(`/galleries/${gallery.slug}`);
  galleryRedirect(input.slug, input.accessToken, "favorited", input.itemId);
}

export async function commentOnGalleryItemAction(formData: FormData) {
  const parsed = proofCommentSchema.safeParse(formDataObject(formData));
  const fallbackSlug = String(formData.get("slug") || "");
  const fallbackToken = String(formData.get("accessToken") || "");

  if (!parsed.success) {
    galleryRedirect(fallbackSlug || "missing", fallbackToken, "error", parsed.error.issues[0]?.message || "Check the comment form.");
  }

  const input = parsed.data;

  if (input.companyWebsite) {
    galleryRedirect(input.slug, input.accessToken, "commented", input.itemId || input.roundId);
  }

  const rateLimitMessage = await publicRateLimitMessage(`gallery_comment:${input.galleryId}`, {
    limit: 15,
    windowMinutes: 10
  });
  if (rateLimitMessage) {
    galleryRedirect(input.slug, input.accessToken, "error", rateLimitMessage);
  }

  const { access, gallery, item, round, settings } = await requirePublicProofingContext(input);
  const actor = accessIdentity(access);
  await prisma.portfolioProofComment.create({
    data: {
      siteId: settings.siteId,
      galleryId: gallery.id,
      roundId: round.id,
      itemId: item?.id,
      accessId: actor.accessId,
      clientId: actor.clientId,
      viewerEmail: actor.viewerEmail,
      authorName: input.authorName,
      body: input.body
    }
  });

  revalidatePath("/admin/modules/portfolio");
  revalidatePath(`/galleries/${gallery.slug}`);
  galleryRedirect(input.slug, input.accessToken, "commented", item?.id || round.id);
}

export async function saveGalleryItemDecisionAction(formData: FormData) {
  const parsed = proofItemDecisionSchema.safeParse(formDataObject(formData));
  const fallbackSlug = String(formData.get("slug") || "");
  const fallbackToken = String(formData.get("accessToken") || "");

  if (!parsed.success) {
    galleryRedirect(fallbackSlug || "missing", fallbackToken, "error", parsed.error.issues[0]?.message || "Check the image decision form.");
  }

  const input = parsed.data;

  if (input.companyWebsite) {
    galleryRedirect(input.slug, input.accessToken, "decision", input.itemId);
  }

  const rateLimitMessage = await publicRateLimitMessage(`gallery_decision:${input.galleryId}`, {
    limit: 30,
    windowMinutes: 10
  });
  if (rateLimitMessage) {
    galleryRedirect(input.slug, input.accessToken, "error", rateLimitMessage);
  }

  const { access, gallery, item, round, settings } = await requirePublicProofingContext(input);
  if (!item) {
    galleryRedirect(input.slug, input.accessToken, "error", "Choose an image before saving a proofing decision.");
  }
  const actor = accessIdentity(access);

  await prisma.portfolioProofItemDecision.upsert({
    where: {
      roundId_itemId_accessId: {
        roundId: round.id,
        itemId: item.id,
        accessId: actor.accessId
      }
    },
    update: {
      clientId: actor.clientId || null,
      notes: input.notes,
      status: input.status,
      viewerEmail: actor.viewerEmail
    },
    create: {
      siteId: settings.siteId,
      galleryId: gallery.id,
      roundId: round.id,
      itemId: item.id,
      accessId: actor.accessId,
      clientId: actor.clientId,
      viewerEmail: actor.viewerEmail,
      status: input.status,
      notes: input.notes
    }
  });

  revalidatePath("/admin/modules/portfolio");
  revalidatePath(`/galleries/${gallery.slug}`);
  galleryRedirect(input.slug, input.accessToken, "decision", item.id);
}

export async function submitGalleryApprovalAction(formData: FormData) {
  const parsed = proofApprovalSchema.safeParse(formDataObject(formData));
  const fallbackSlug = String(formData.get("slug") || "");
  const fallbackToken = String(formData.get("accessToken") || "");

  if (!parsed.success) {
    galleryRedirect(fallbackSlug || "missing", fallbackToken, "error", parsed.error.issues[0]?.message || "Check the approval form.");
  }

  const input = parsed.data;

  if (input.companyWebsite) {
    galleryRedirect(input.slug, input.accessToken, "approved", input.status);
  }

  if (input.status === PortfolioProofApprovalStatus.APPROVED && input.approvalConfirmed !== "on") {
    galleryRedirect(input.slug, input.accessToken, "error", "Confirm the gallery approval before submitting.");
  }

  const rateLimitMessage = await publicRateLimitMessage(`gallery_approval:${input.galleryId}`, {
    limit: 8,
    windowMinutes: 10
  });
  if (rateLimitMessage) {
    galleryRedirect(input.slug, input.accessToken, "error", rateLimitMessage);
  }

  const { access, gallery, round, settings } = await requirePublicProofingContext(input);
  const actor = accessIdentity(access);
  const nextRoundStatus =
    input.status === PortfolioProofApprovalStatus.APPROVED
      ? PortfolioProofRoundStatus.APPROVED
      : PortfolioProofRoundStatus.CHANGES_REQUESTED;

  const approval = await prisma.$transaction(async (tx) => {
    const claimedRound = await tx.portfolioProofRound.updateMany({
      where: {
        id: round.id,
        status: PortfolioProofRoundStatus.OPEN
      },
      data: {
        closedAt: new Date(),
        status: nextRoundStatus
      }
    });

    if (claimedRound.count !== 1) {
      throw new Error("This proofing round is no longer open for changes.");
    }

    return tx.portfolioProofApproval.create({
      data: {
        siteId: settings.siteId,
        galleryId: gallery.id,
        roundId: round.id,
        accessId: actor.accessId,
        clientId: actor.clientId,
        viewerEmail: actor.viewerEmail,
        approverName: input.approverName,
        status: input.status,
        notes: input.notes
      }
    });
  }).catch((error) => {
    galleryRedirect(
      input.slug,
      input.accessToken,
      "error",
      error instanceof Error ? error.message : "This proofing round is no longer open for changes."
    );
  });

  const eventName =
    input.status === PortfolioProofApprovalStatus.APPROVED ? "gallery.approved" : "gallery.changes_requested";
  await emitModuleEvent(eventName, {
    actorEmail: actor.viewerEmail,
    metadata: {
      accessId: actor.accessId,
      galleryId: gallery.id,
      gallerySlug: gallery.slug,
      galleryTitle: gallery.title,
      roundId: round.id,
      roundNumber: round.roundNumber,
      status: input.status
    },
    pathname: input.pathname || `/galleries/${gallery.slug}`,
    relatedId: approval.id,
    relatedType: "portfolio_gallery_approval"
  });

  revalidatePath("/admin/modules/portfolio");
  revalidatePath(`/galleries/${gallery.slug}`);
  galleryRedirect(input.slug, input.accessToken, "approved", input.status);
}
