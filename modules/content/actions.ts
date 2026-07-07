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
  normalizeContentProfileKey,
  normalizeContentProfiles,
  type ContentProfileKey,
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
  const fallbackPresentation = {
    mode: "STATIC" as const,
    autoplayIntervalMs: 6500,
    slides: [defaultHeroSlideFromSettings(currentSettings)]
  };
  let heroPresentation = parseHeroPresentationPayload(formData.get("heroPresentation"), fallbackPresentation);
  const uploadedHeroUrl = await uploadHeroBackgroundIfPresent(formData, {
    headline: heroPresentation.slides[0]?.headline || currentSettings.heroHeadline,
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
  const introTitle = stringOrFallback(formData.get("introTitle"), currentSettings.introTitle);
  const introBody = stringOrFallback(formData.get("introBody"), currentSettings.introBody);

  await prisma.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { siteId: site.id },
      update: {
        heroImageUrl: primarySlide.imageUrl,
        heroHeadline: primarySlide.headline,
        heroSubheadline: primarySlide.caption,
        introTitle,
        introBody
      },
      create: {
        siteId: site.id,
        enabledModules: defaultEnabledModules,
        heroImageUrl: primarySlide.imageUrl,
        heroHeadline: primarySlide.headline,
        heroSubheadline: primarySlide.caption,
        introTitle,
        introBody
      }
    });

    const presentation = await tx.heroPresentation.upsert({
      where: { siteId: site.id },
      update: {
        mode: heroPresentation.mode === "SLIDESHOW" ? HeroPresentationMode.SLIDESHOW : HeroPresentationMode.STATIC,
        autoplayIntervalMs: heroPresentation.autoplayIntervalMs
      },
      create: {
        siteId: site.id,
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
  redirect("/admin/modules/content?saved=1");
}

export async function updateContentProfileAction(formData: FormData) {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  const profiles = normalizeContentProfiles(settings.publicContentConfig);
  const current = profiles[profileKey];
  const targetType = normalizeFeaturedTargetType(formData.get("featuredTargetType"));
  const serviceId = stringOrFallback(formData.get("featuredServiceId"), "").trim();
  const packageId = stringOrFallback(formData.get("featuredPackageId"), "").trim();
  const selectedTestimonialIds = formData
    .getAll("testimonialIds")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);

  profiles[profileKey] = {
    ...current,
    header: {
      copy: stringOrFallback(formData.get("headerCopy"), current.header.copy).trim(),
      ctaHref: stringOrFallback(formData.get("headerCtaHref"), current.header.ctaHref).trim(),
      ctaLabel: stringOrFallback(formData.get("headerCtaLabel"), current.header.ctaLabel).trim(),
      eyebrow: stringOrFallback(formData.get("headerEyebrow"), current.header.eyebrow).trim(),
      headline: stringOrFallback(formData.get("headerHeadline"), current.header.headline).trim()
    },
    featured: {
      categoryId: stringOrFallback(formData.get("featuredCategoryId"), current.featured.categoryId).trim(),
      copy: stringOrFallback(formData.get("featuredCopy"), current.featured.copy).trim(),
      cta: stringOrFallback(formData.get("featuredCta"), current.featured.cta).trim(),
      enabled: formData.get("featuredEnabled") === "on",
      imageUrl: stringOrFallback(formData.get("featuredImageUrl"), current.featured.imageUrl).trim(),
      packageId: targetType === "PACKAGE" ? packageId : "",
      serviceId: targetType === "SERVICE" ? serviceId : "",
      targetType,
      title: stringOrFallback(formData.get("featuredTitle"), current.featured.title).trim()
    },
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
  redirect(`/admin/modules/content?profile=${profileKey}&saved=profile`);
}

async function uploadHeroBackgroundIfPresent(
  formData: FormData,
  input: {
    headline: string;
    siteId: string;
    user: Awaited<ReturnType<typeof requireAdmin>>;
  }
) {
  const file = formData.get("heroBackgroundUpload");
  if (!(file instanceof File) || file.size === 0) return "";

  const ownerStaffIds = await getOwnerStaffIds(input.user, input.siteId);
  if ((await resolveDataScopeMode(input.user, input.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`/admin/modules/content?error=${encodeURIComponent("Create an active staff profile before uploading scoped media.")}`);
  }

  try {
    const settings = await getSiteSettingsForSite(input.siteId);
    const asset = await uploadMedia(
      file,
      {
        alt: input.headline ? `${input.headline} hero background` : "Homepage hero background",
        folder: "content/hero",
        tags: ["hero", "homepage"],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "homepage hero"
      },
      settings.mediaDriver,
      input.siteId
    );
    return mediaAssetDisplayUrl(asset, MediaVariantType.HERO);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hero image upload failed.";
    redirect(`/admin/modules/content?error=${encodeURIComponent(message)}`);
  }
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
