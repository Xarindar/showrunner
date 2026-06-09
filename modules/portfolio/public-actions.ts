"use server";

import { PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
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

function galleryRedirect(slug: string, accessToken: string, key: "favorited" | "error", value: string): never {
  const params = new URLSearchParams();
  if (accessToken) params.set("access", accessToken);
  params.set(key, value);
  redirect(`/galleries/${slug}?${params.toString()}`);
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

  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) {
    redirect("/");
  }

  const rateLimitMessage = await publicRateLimitMessage(`gallery_favorite:${input.galleryId}`, {
    limit: 20,
    windowMinutes: 10
  });
  if (rateLimitMessage) {
    galleryRedirect(input.slug, input.accessToken, "error", rateLimitMessage);
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
  if (gallery.visibility !== PortfolioGalleryVisibility.PUBLIC && !access) {
    galleryRedirect(input.slug, input.accessToken, "error", "This gallery needs an active access link.");
  }

  const item = await prisma.portfolioGalleryItem.findFirst({
    where: {
      id: input.itemId,
      galleryId: gallery.id
    },
    select: {
      id: true,
      mediaAssetId: true,
      title: true
    }
  });

  if (!item) {
    galleryRedirect(input.slug, input.accessToken, "error", "That gallery item was not found.");
  }

  if (!item.mediaAssetId && gallery.visibility !== PortfolioGalleryVisibility.PUBLIC) {
    galleryRedirect(input.slug, input.accessToken, "error", "That gallery item is not available for proofing.");
  }

  if (item.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: item.mediaAssetId, siteId: settings.siteId },
      select: { deletedAt: true, isPrivate: true }
    });

    if (!asset || asset.deletedAt || (asset.isPrivate && !access)) {
      galleryRedirect(input.slug, input.accessToken, "error", "That gallery item is not available for proofing.");
    }
  }

  const existingFavorite = await prisma.portfolioGalleryFavorite.findFirst({
    where: {
      galleryId: gallery.id,
      itemId: item.id,
      viewerEmail: input.viewerEmail
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
          clientId: access?.clientId || undefined,
          viewerEmail: input.viewerEmail,
          notes: input.notes
        }
      });

  await emitModuleEvent("favorite.added", {
    actorEmail: input.viewerEmail,
    metadata: {
      accessId: access?.id,
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
