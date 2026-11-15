import { MediaVariantType } from "@prisma/client";
import { publicAppBaseUrl } from "@/lib/env";
import { mediaAssetDisplayUrl, mediaAssetIdFromUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import type { SiteSettingsWithModules } from "@/lib/site";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { slugify } from "@/lib/slug";
import { resolveBusinessInfo } from "@/modules/content/studio/business-info";
import { emailBrandProfile } from "./brand-profiles";

export const publicEmailImage = {
  deletedAt: null,
  isPrivate: false,
  mimeType: { startsWith: "image/" },
  portfolioItems: { none: { gallery: { OR: [{ visibility: { not: "PUBLIC" } }, { clientId: { not: null } }] } } },
  purchasedSelections: { none: {} }
} satisfies import("@prisma/client").Prisma.MediaAssetWhereInput;

function publicImageUrl(value: string, origin: string) {
  if (!value) return "";
  try {
    const url = value.startsWith("/") && !value.startsWith("//") && origin ? new URL(value, origin) : new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.toString();
  } catch {
    // Invalid or unavailable URLs fall back to the business name.
  }
  return "";
}

export async function customerEmailBrand(settings: SiteSettingsWithModules, category = "", coverImageUrl = "") {
  const [storedCategory, domain] = await Promise.all([
    category ? prisma.serviceCategory.findFirst({
      where: { siteId: settings.siteId, name: { equals: category, mode: "insensitive" } },
      select: { slug: true }
    }) : null,
    settings.siteId !== DEFAULT_SITE_ID ? prisma.siteDomain.findFirst({
      where: { siteId: settings.siteId }, orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }], select: { hostname: true }
    }) : null
  ]);
  const origin = domain ? `https://${domain.hostname}` : settings.siteId === DEFAULT_SITE_ID ? publicAppBaseUrl() : "";
  const profile = emailBrandProfile(settings, storedCategory?.slug || slugify(category));
  const siteLogoId = mediaAssetIdFromUrl(settings.logoImageUrl);
  const coverId = mediaAssetIdFromUrl(coverImageUrl);
  const [header, siteLogo, cover] = await Promise.all([
    prisma.emailHeaderLogo.findUnique({
      where: { siteId_profile: { siteId: settings.siteId, profile: profile.key }, mediaAsset: { ...publicEmailImage, siteId: settings.siteId } },
      include: { mediaAsset: true }
    }),
    siteLogoId ? prisma.mediaAsset.findFirst({ where: { ...publicEmailImage, id: siteLogoId, siteId: settings.siteId } }) : null,
    coverId ? prisma.mediaAsset.findFirst({ where: { ...publicEmailImage, id: coverId, siteId: settings.siteId } }) : null
  ]);
  const logo = header ? publicImageUrl(mediaAssetDisplayUrl(header.mediaAsset, MediaVariantType.FULL), origin) : "";
  const business = resolveBusinessInfo(settings);
  return {
    businessName: profile.name,
    emailLogoUrl: logo || publicImageUrl(siteLogo ? mediaAssetDisplayUrl(siteLogo, MediaVariantType.FULL) : siteLogoId ? "" : settings.logoImageUrl, origin),
    // Private client photos stay in the gallery. Only an explicitly chosen public media cover can appear in email.
    galleryCoverUrl: cover ? publicImageUrl(mediaAssetDisplayUrl(cover, MediaVariantType.CARD), origin) : "",
    emailIconUrl: publicImageUrl("/email-icons/email.png", origin),
    phoneIconUrl: publicImageUrl("/email-icons/phone.png", origin),
    contactPhone: typeof business.phone === "string" ? business.phone.trim() : "",
    contactEmail: settings.contactEmail
  };
}
