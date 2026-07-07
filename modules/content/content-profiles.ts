import "server-only";

import { MediaVariantType, TestimonialStatus, type MediaAsset, type Prisma } from "@prisma/client";
import { publicAppBaseUrl } from "@/lib/env";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, type SiteSettingsWithModules } from "@/lib/site";
import { slugify } from "@/lib/slug";

export const contentProfileKeys = ["cottage616", "the-hive"] as const;
export type ContentProfileKey = (typeof contentProfileKeys)[number];

export const featuredBookingTargetTypes = ["CATEGORY", "SERVICE", "PACKAGE", "NONE"] as const;
export type FeaturedBookingTargetType = (typeof featuredBookingTargetTypes)[number];

export type ContentProfileDraft = {
  featured: {
    categoryId: string;
    copy: string;
    cta: string;
    enabled: boolean;
    imageUrl: string;
    packageId: string;
    serviceId: string;
    targetType: FeaturedBookingTargetType;
    title: string;
  };
  header: {
    copy: string;
    ctaHref: string;
    ctaLabel: string;
    eyebrow: string;
    headline: string;
  };
  label: string;
  testimonialHeading: string;
  testimonialIds: string[];
  testimonialIntro: string;
};

export type PublicContentProfilePayload = {
  bookingPromotion: {
    categoryId: string | null;
    copy: string;
    cta: string;
    enabled: boolean;
    imageUrl: string | null;
    packageId: string | null;
    serviceId: string | null;
    serviceIds: string[];
    targetType: FeaturedBookingTargetType;
    title: string;
  };
  header: ContentProfileDraft["header"];
  label: string;
  profileKey: ContentProfileKey;
  testimonials: {
    heading: string;
    intro: string;
    items: Array<{
      authorName: string;
      authorRole: string | null;
      id: string;
      imageUrl: string | null;
      quote: string;
      rating: number;
      serviceName: string | null;
    }>;
  };
};

const defaultProfiles: Record<ContentProfileKey, ContentProfileDraft> = {
  cottage616: {
    label: "Cottage 616",
    header: {
      copy:
        "A peaceful indoor and outdoor event venue and head-spa retreat for intimate weddings, baby showers, birthday parties, girls' nights, and relaxing appointments surrounded by serene country views.",
      ctaHref: "booking.html",
      ctaLabel: "Book Now",
      eyebrow: "",
      headline: "Cottage 616"
    },
    featured: {
      categoryId: "events",
      copy: "Request celebrations, showers, intimate weddings, and Hive head-spa appointments.",
      cta: "Start booking",
      enabled: true,
      imageUrl: "",
      packageId: "",
      serviceId: "",
      targetType: "CATEGORY",
      title: "Let's get this party started"
    },
    testimonialHeading: "Sweet words from Cottage guests",
    testimonialIds: [],
    testimonialIntro: "A few kind notes from celebrations, showers, and peaceful days at Cottage 616."
  },
  "the-hive": {
    label: "The Hive",
    header: {
      copy: "A quiet head-spa retreat for scalp care, deep relaxation, hydration, and healthy shine at Cottage 616.",
      ctaHref: "booking.html",
      ctaLabel: "Book The Hive",
      eyebrow: "",
      headline: "Buzz off, stress."
    },
    featured: {
      categoryId: "the-hive",
      copy: "Choose a restorative head-spa appointment inside The Hive at Cottage 616.",
      cta: "Book The Hive",
      enabled: true,
      imageUrl: "",
      packageId: "",
      serviceId: "",
      targetType: "CATEGORY",
      title: "Book your Hive reset"
    },
    testimonialHeading: "What Hive guests are saying",
    testimonialIds: [],
    testimonialIntro: "Notes from head-spa guests who came in ready for softer hair and quieter shoulders."
  }
};

type JsonRecord = Record<string, Prisma.JsonValue>;

function isRecord(value: Prisma.JsonValue | null | undefined): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: Prisma.JsonValue | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: Prisma.JsonValue | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayValue(value: Prisma.JsonValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function normalizeTargetType(value: Prisma.JsonValue | undefined, fallback: FeaturedBookingTargetType): FeaturedBookingTargetType {
  return featuredBookingTargetTypes.includes(value as FeaturedBookingTargetType) ? (value as FeaturedBookingTargetType) : fallback;
}

export function normalizeContentProfileKey(value: string | null | undefined): ContentProfileKey {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "hive" || normalized === "thehive" || normalized === "the_hive") return "the-hive";
  return contentProfileKeys.includes(normalized as ContentProfileKey) ? (normalized as ContentProfileKey) : "cottage616";
}

function normalizeProfile(key: ContentProfileKey, rawValue: Prisma.JsonValue | undefined): ContentProfileDraft {
  const fallback = defaultProfiles[key];
  const raw = isRecord(rawValue) ? rawValue : {};
  const rawHeader = isRecord(raw.header) ? raw.header : {};
  const rawFeatured = isRecord(raw.featured) ? raw.featured : {};

  return {
    label: stringValue(raw.label, fallback.label),
    header: {
      copy: stringValue(rawHeader.copy, fallback.header.copy),
      ctaHref: stringValue(rawHeader.ctaHref, fallback.header.ctaHref),
      ctaLabel: stringValue(rawHeader.ctaLabel, fallback.header.ctaLabel),
      eyebrow: stringValue(rawHeader.eyebrow, fallback.header.eyebrow),
      headline: stringValue(rawHeader.headline, fallback.header.headline)
    },
    featured: {
      categoryId: stringValue(rawFeatured.categoryId, fallback.featured.categoryId),
      copy: stringValue(rawFeatured.copy, fallback.featured.copy),
      cta: stringValue(rawFeatured.cta, fallback.featured.cta),
      enabled: booleanValue(rawFeatured.enabled, fallback.featured.enabled),
      imageUrl: stringValue(rawFeatured.imageUrl, fallback.featured.imageUrl),
      packageId: stringValue(rawFeatured.packageId, fallback.featured.packageId),
      serviceId: stringValue(rawFeatured.serviceId, fallback.featured.serviceId),
      targetType: normalizeTargetType(rawFeatured.targetType, fallback.featured.targetType),
      title: stringValue(rawFeatured.title, fallback.featured.title)
    },
    testimonialHeading: stringValue(raw.testimonialHeading, fallback.testimonialHeading),
    testimonialIds: stringArrayValue(raw.testimonialIds),
    testimonialIntro: stringValue(raw.testimonialIntro, fallback.testimonialIntro)
  };
}

export function normalizeContentProfiles(value: Prisma.JsonValue | null | undefined) {
  const config = isRecord(value) ? value : {};
  const profiles = isRecord(config.profiles) ? config.profiles : {};

  return {
    cottage616: normalizeProfile("cottage616", profiles.cottage616),
    "the-hive": normalizeProfile("the-hive", profiles["the-hive"])
  } satisfies Record<ContentProfileKey, ContentProfileDraft>;
}

export function contentProfilesToJson(profiles: Record<ContentProfileKey, ContentProfileDraft>) {
  return {
    profiles
  } satisfies Prisma.InputJsonObject;
}

export function contentProfileLabels() {
  return contentProfileKeys.map((key) => ({
    key,
    label: defaultProfiles[key].label
  }));
}

function publicAssetUrl(value: string | null | undefined) {
  const url = value?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return new URL(url, publicAppBaseUrl()).toString();
  return url;
}

function categoryKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function categoryIdForService(service: { category: string | null }, categoriesByName: Map<string, { slug: string }>) {
  const category = service.category?.trim();
  if (!category) return "general";
  return categoriesByName.get(categoryKey(category))?.slug || slugify(category) || "general";
}

type PublicMediaAsset = Pick<MediaAsset, "driver" | "id" | "isPrivate" | "key" | "storageProviderId" | "url">;

function publicServiceImageUrl(service: { imageUrl: string; mediaAsset: PublicMediaAsset | null }) {
  if (service.mediaAsset) return publicAssetUrl(mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD));
  return publicAssetUrl(service.imageUrl);
}

function publicCategoryImageUrl(category: { imageUrl: string; mediaAsset: PublicMediaAsset | null } | null | undefined) {
  if (!category) return null;
  if (category.mediaAsset) return publicAssetUrl(mediaAssetDisplayUrl(category.mediaAsset, MediaVariantType.CARD));
  return publicAssetUrl(category.imageUrl);
}

function testimonialOrder(ids: string[], id: string) {
  const index = ids.indexOf(id);
  return index === -1 ? ids.length : index;
}

async function publicTestimonials(siteId: string, profile: ContentProfileDraft) {
  const selectedIds = profile.testimonialIds.slice(0, 12);
  const testimonials = await prisma.testimonial.findMany({
    where: {
      siteId,
      status: TestimonialStatus.APPROVED,
      ...(selectedIds.length ? { id: { in: selectedIds } } : { featured: true })
    },
    orderBy: selectedIds.length ? { submittedAt: "desc" } : [{ featured: "desc" }, { submittedAt: "desc" }],
    take: selectedIds.length ? selectedIds.length : 6,
    select: {
      authorName: true,
      authorRole: true,
      id: true,
      imageUrl: true,
      quote: true,
      rating: true,
      serviceName: true
    }
  });

  return testimonials
    .sort((left, right) => (selectedIds.length ? testimonialOrder(selectedIds, left.id) - testimonialOrder(selectedIds, right.id) : 0))
    .map((testimonial) => ({
      authorName: testimonial.authorName,
      authorRole: testimonial.authorRole || null,
      id: testimonial.id,
      imageUrl: publicAssetUrl(testimonial.imageUrl),
      quote: testimonial.quote,
      rating: testimonial.rating,
      serviceName: testimonial.serviceName || null
    }));
}

async function publicBookingPromotion(siteId: string, profile: ContentProfileDraft) {
  const featured = profile.featured;
  const categories = await prisma.serviceCategory.findMany({
    where: { siteId },
    include: { mediaAsset: true }
  });
  const categoriesByName = new Map(categories.map((category) => [categoryKey(category.name), category]));
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
  const fallbackCategory = categoriesBySlug.get(featured.categoryId) || null;
  const fallback = {
    categoryId: featured.categoryId || null,
    copy: featured.copy,
    cta: featured.cta || "Start booking",
    enabled: featured.enabled && featured.targetType !== "NONE",
    imageUrl: publicAssetUrl(featured.imageUrl) || publicCategoryImageUrl(fallbackCategory),
    packageId: null as string | null,
    serviceId: null as string | null,
    serviceIds: [] as string[],
    targetType: featured.targetType,
    title: featured.title
  };

  if (!fallback.enabled) return fallback;

  if (featured.targetType === "SERVICE" && featured.serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: featured.serviceId, isActive: true, siteId },
      include: { mediaAsset: true }
    });
    if (service) {
      const categoryId = categoryIdForService(service, categoriesByName);
      const category = categoriesBySlug.get(categoryId) || null;
      return {
        ...fallback,
        categoryId,
        copy: featured.copy || service.description || `${service.durationMinutes} minute appointment.`,
        imageUrl: publicAssetUrl(featured.imageUrl) || publicServiceImageUrl(service) || publicCategoryImageUrl(category),
        serviceId: service.id,
        serviceIds: [service.id],
        title: featured.title || service.name
      };
    }
  }

  if (featured.targetType === "PACKAGE" && featured.packageId) {
    const servicePackage = await prisma.servicePackage.findFirst({
      where: { id: featured.packageId, isActive: true, siteId },
      include: {
        items: {
          include: { service: { include: { mediaAsset: true } } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    const activeServices = servicePackage?.items.map((item) => item.service).filter((service) => service.isActive) || [];
    if (servicePackage) {
      const firstService = activeServices[0] || null;
      const categoryId = firstService ? categoryIdForService(firstService, categoriesByName) : fallback.categoryId;
      const category = categoryId ? categoriesBySlug.get(categoryId) || null : null;
      return {
        ...fallback,
        categoryId,
        copy: featured.copy || servicePackage.description || activeServices.map((service) => service.name).join(", "),
        imageUrl: publicAssetUrl(featured.imageUrl) || (firstService ? publicServiceImageUrl(firstService) : null) || publicCategoryImageUrl(category),
        packageId: servicePackage.id,
        serviceIds: activeServices.map((service) => service.id),
        title: featured.title || servicePackage.name
      };
    }
  }

  if (featured.targetType === "CATEGORY" && featured.categoryId) {
    const category = categoriesBySlug.get(featured.categoryId) || null;
    return {
      ...fallback,
      categoryId: featured.categoryId,
      copy: featured.copy || category?.description || fallback.copy,
      imageUrl: publicAssetUrl(featured.imageUrl) || publicCategoryImageUrl(category),
      title: featured.title || category?.name || fallback.title
    };
  }

  return fallback;
}

export function contentProfileFromSettings(settings: SiteSettingsWithModules, key: string | null | undefined) {
  return normalizeContentProfiles(settings.publicContentConfig)[normalizeContentProfileKey(key)];
}

export async function getPublicContentProfilePayload(siteId: string, key: string | null | undefined): Promise<PublicContentProfilePayload> {
  const settings = await getSiteSettingsForSite(siteId);
  const profileKey = normalizeContentProfileKey(key);
  const profile = contentProfileFromSettings(settings, profileKey);
  const [bookingPromotion, testimonials] = await Promise.all([
    publicBookingPromotion(siteId, profile),
    publicTestimonials(siteId, profile)
  ]);

  return {
    bookingPromotion,
    header: profile.header,
    label: profile.label,
    profileKey,
    testimonials: {
      heading: profile.testimonialHeading,
      intro: profile.testimonialIntro,
      items: testimonials
    }
  };
}
