"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { HeroPresentationMode, HeroSlideElementType, MediaVariantType } from "@prisma/client";
import { getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, resolveCurrentSite } from "@/lib/site";
import { defaultEnabledModules } from "@/shell/modules";
import {
  contentProfilesToJson,
  featuredBookingTargetTypes,
  heroFallbackForProfile,
  normalizeContentProfileKey,
  normalizeContentProfiles,
  type FeaturedBookingTargetType
} from "./content-profiles";
import {
  defaultHeroSlideFromSettings,
  heroElementsArray,
  parseHeroPresentationPayload,
  type HeroElementType
} from "./hero-presentation";

const heroElementTypeMap: Record<HeroElementType, HeroSlideElementType> = {
  IMAGE: HeroSlideElementType.IMAGE,
  HEADLINE: HeroSlideElementType.HEADLINE,
  CAPTION: HeroSlideElementType.CAPTION,
  CTA: HeroSlideElementType.CTA
};

export async function updateContentAction(formData: FormData) {
  const user = await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const currentSettings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  const fallbackPresentation = {
    mode: "STATIC" as const,
    autoplayIntervalMs: 6500,
    slides: [defaultHeroSlideFromSettings(heroFallbackForProfile(currentSettings, profileKey))]
  };
  let heroPresentation = parseHeroPresentationPayload(formData.get("heroPresentation"), fallbackPresentation);
  const uploadedHeroUrl = await uploadHeroBackgroundIfPresent(formData, {
    headline: heroPresentation.slides[0]?.headline || currentSettings.heroHeadline,
    profileKey,
    siteId: site.id,
    user
  });
  if (uploadedHeroUrl) {
    const slideIndex = clampUploadSlideIndex(formData.get("activeHeroSlideIndex"), heroPresentation.slides.length);
    heroPresentation = {
      ...heroPresentation,
      slides: heroPresentation.slides.map((slide, index) => (index === slideIndex ? { ...slide, imageUrl: uploadedHeroUrl } : slide))
    };
  }
  const primarySlide = heroPresentation.slides[0] || fallbackPresentation.slides[0];

  await prisma.$transaction(async (tx) => {
    // Site-wide hero settings mirror the primary venue so legacy consumers
    // (SEO snippets, admin summaries) keep showing the main homepage content.
    if (profileKey === "cottage616") {
      await tx.siteSettings.upsert({
        where: { siteId: site.id },
        update: {
          heroImageUrl: primarySlide.imageUrl,
          heroHeadline: primarySlide.headline,
          heroSubheadline: primarySlide.caption
        },
        create: {
          siteId: site.id,
          enabledModules: defaultEnabledModules,
          heroImageUrl: primarySlide.imageUrl,
          heroHeadline: primarySlide.headline,
          heroSubheadline: primarySlide.caption
        }
      });
    }

    const presentation = await tx.heroPresentation.upsert({
      where: { siteId_profileKey: { siteId: site.id, profileKey } },
      update: {
        mode: heroPresentation.mode === "SLIDESHOW" ? HeroPresentationMode.SLIDESHOW : HeroPresentationMode.STATIC,
        autoplayIntervalMs: heroPresentation.autoplayIntervalMs
      },
      create: {
        siteId: site.id,
        profileKey,
        mode: heroPresentation.mode === "SLIDESHOW" ? HeroPresentationMode.SLIDESHOW : HeroPresentationMode.STATIC,
        autoplayIntervalMs: heroPresentation.autoplayIntervalMs
      }
    });

    await tx.heroSlide.deleteMany({
      where: { presentationId: presentation.id }
    });

    for (const [index, slide] of heroPresentation.slides.entries()) {
      await tx.heroSlide.create({
        data: {
          presentationId: presentation.id,
          sortOrder: index,
          headline: slide.headline,
          caption: slide.caption,
          imageUrl: slide.imageUrl,
          ctaLabel: slide.ctaLabel,
          ctaHref: slide.ctaHref,
          elements: {
            create: heroElementsArray(slide.elements).map((element) => ({
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
  redirect(`/admin/modules/content?profile=${profileKey}&saved=hero`);
}

export async function updateFeaturedCardAction(formData: FormData) {
  const user = await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  const profiles = normalizeContentProfiles(settings.publicContentConfig);
  const current = profiles[profileKey];
  const targetType = normalizeFeaturedTargetType(formData.get("featuredTargetType"));
  const serviceId = stringOrFallback(formData.get("featuredServiceId"), "").trim();
  const packageId = stringOrFallback(formData.get("featuredPackageId"), "").trim();
  const uploadedImageUrl = await uploadFeaturedImageIfPresent(formData, {
    profileKey,
    siteId: site.id,
    title: stringOrFallback(formData.get("featuredTitle"), current.featured.title),
    user
  });

  profiles[profileKey] = {
    ...current,
    featured: {
      categoryId: stringOrFallback(formData.get("featuredCategoryId"), current.featured.categoryId).trim(),
      copy: stringOrFallback(formData.get("featuredCopy"), current.featured.copy).trim(),
      cta: stringOrFallback(formData.get("featuredCta"), current.featured.cta).trim(),
      enabled: formData.get("featuredEnabled") === "on",
      imageUrl: uploadedImageUrl || storableImageUrl(stringOrFallback(formData.get("featuredImageUrl"), current.featured.imageUrl)),
      packageId: targetType === "PACKAGE" ? packageId : "",
      serviceId: targetType === "SERVICE" ? serviceId : "",
      targetType,
      title: stringOrFallback(formData.get("featuredTitle"), current.featured.title).trim()
    }
  };

  await prisma.siteSettings.update({
    where: { siteId: site.id },
    data: { publicContentConfig: contentProfilesToJson(profiles) }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect(`/admin/modules/content?profile=${profileKey}&saved=featured`);
}

export async function updateProfileTestimonialsAction(formData: FormData) {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  const profiles = normalizeContentProfiles(settings.publicContentConfig);
  const current = profiles[profileKey];
  const selectedTestimonialIds = formData
    .getAll("testimonialIds")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);

  profiles[profileKey] = {
    ...current,
    testimonialHeading: stringOrFallback(formData.get("testimonialHeading"), current.testimonialHeading).trim(),
    testimonialIds: selectedTestimonialIds,
    testimonialIntro: stringOrFallback(formData.get("testimonialIntro"), current.testimonialIntro).trim()
  };

  await prisma.siteSettings.update({
    where: { siteId: site.id },
    data: { publicContentConfig: contentProfilesToJson(profiles) }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect(`/admin/modules/content?profile=${profileKey}&saved=curation`);
}

async function uploadHeroBackgroundIfPresent(
  formData: FormData,
  input: {
    headline: string;
    profileKey: string;
    siteId: string;
    user: Awaited<ReturnType<typeof requireAdmin>>;
  }
) {
  const file = formData.get("heroBackgroundUpload");
  if (!(file instanceof File) || file.size === 0) return "";

  const ownerStaffIds = await getOwnerStaffIds(input.user, input.siteId);
  if ((await resolveDataScopeMode(input.user, input.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`/admin/modules/content?profile=${input.profileKey}&error=${encodeURIComponent("Create an active staff profile before uploading scoped media.")}`);
  }

  try {
    const settings = await getSiteSettingsForSite(input.siteId);
    const asset = await uploadMedia(
      file,
      {
        alt: input.headline ? `${input.headline} hero background` : "Homepage hero background",
        folder: "content/hero",
        tags: ["hero", "homepage", input.profileKey],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "homepage hero"
      },
      settings.mediaDriver,
      input.siteId
    );
    return mediaAssetDisplayUrl(asset, MediaVariantType.HERO);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hero image upload failed.";
    redirect(`/admin/modules/content?profile=${input.profileKey}&error=${encodeURIComponent(message)}`);
  }
}

async function uploadFeaturedImageIfPresent(
  formData: FormData,
  input: {
    profileKey: string;
    siteId: string;
    title: string;
    user: Awaited<ReturnType<typeof requireAdmin>>;
  }
) {
  const file = formData.get("featuredImageUpload");
  if (!(file instanceof File) || file.size === 0) return "";

  const ownerStaffIds = await getOwnerStaffIds(input.user, input.siteId);
  if ((await resolveDataScopeMode(input.user, input.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`/admin/modules/content?profile=${input.profileKey}&error=${encodeURIComponent("Create an active staff profile before uploading scoped media.")}`);
  }

  try {
    const settings = await getSiteSettingsForSite(input.siteId);
    const asset = await uploadMedia(
      file,
      {
        alt: input.title ? `${input.title} booking feature` : "Featured booking card",
        folder: "content/featured",
        tags: ["featured", "booking", input.profileKey],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "featured booking card"
      },
      settings.mediaDriver,
      input.siteId
    );
    return mediaAssetDisplayUrl(asset, MediaVariantType.HERO);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Featured image upload failed.";
    redirect(`/admin/modules/content?profile=${input.profileKey}&error=${encodeURIComponent(message)}`);
  }
}

// Persist only site paths or public URLs; blob/object URLs from in-browser
// previews must never be stored.
function storableImageUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "";
}

function clampUploadSlideIndex(value: FormDataEntryValue | null, slideCount: number) {
  const index = Number(value || 0);
  if (!Number.isFinite(index) || slideCount < 1) return 0;
  return Math.max(0, Math.min(slideCount - 1, Math.round(index)));
}

function stringOrFallback(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeFeaturedTargetType(value: FormDataEntryValue | null): FeaturedBookingTargetType {
  return featuredBookingTargetTypes.includes(value as FeaturedBookingTargetType) ? (value as FeaturedBookingTargetType) : "CATEGORY";
}
