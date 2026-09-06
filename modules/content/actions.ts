"use server";
import { requireLegacyContentSite } from "@/clients/cottage616/guard";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MediaVariantType } from "@prisma/client";
import { getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, resolveCurrentSite } from "@/lib/site";
import {
  contentProfilesToJson,
  featuredBookingTargetTypes,
  normalizeContentProfileKey,
  normalizeContentProfiles,
  type FeaturedBookingTargetType
} from "./content-profiles";
export async function updateContentAction() { throw new Error("Hero layout editing is deployment-only. Use the content editor."); }

export async function updateFeaturedCardAction(formData: FormData) {
  const user = await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  await requireLegacyContentSite(site.id);
  const profiles = normalizeContentProfiles(settings.publicContentConfig);
  const current = profiles[profileKey];
  const targetType = normalizeFeaturedTargetType(formData.get("featuredTargetType"));
  const serviceId = stringOrFallback(formData.get("featuredServiceId"), "").trim();
  const packageId = stringOrFallback(formData.get("featuredPackageId"), "").trim();
  if (targetType === "SERVICE" && !await prisma.service.findFirst({ where: { id: serviceId, siteId: site.id, isActive: true }, select: { id: true } })) throw new Error("Select a service belonging to this site");
  if (targetType === "PACKAGE" && !await prisma.servicePackage.findFirst({ where: { id: packageId, siteId: site.id, isActive: true }, select: { id: true } })) throw new Error("Select a package belonging to this site");
  if (targetType === "CATEGORY" && !await prisma.serviceCategory.findFirst({ where: { slug: String(formData.get("featuredCategoryId") || ""), siteId: site.id }, select: { id: true } })) throw new Error("Select a category belonging to this site");
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
      enabled: current.featured.enabled,
      imageUrl: uploadedImageUrl || storableImageUrl(stringOrFallback(formData.get("featuredImageUrl"), current.featured.imageUrl)),
      packageId: targetType === "PACKAGE" ? packageId : "",
      serviceId: targetType === "SERVICE" ? serviceId : "",
      targetType,
      title: stringOrFallback(formData.get("featuredTitle"), current.featured.title).trim()
    }
  };

  const saved = await prisma.siteSettings.updateMany({
    where: { siteId: site.id, updatedAt: settings.updatedAt },
    data: { publicContentConfig: contentProfilesToJson(profiles, settings.publicContentConfig) }
  });

  if (saved.count !== 1) throw new Error("Site content changed while saving. Reload before retrying.");
  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect(`/admin/modules/content?profile=${profileKey}&saved=featured`);
}

export async function updateProfileTestimonialsAction(formData: FormData) {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  const profileKey = normalizeContentProfileKey(stringOrFallback(formData.get("profileKey"), "cottage616"));
  await requireLegacyContentSite(site.id);
  const profiles = normalizeContentProfiles(settings.publicContentConfig);
  const current = profiles[profileKey];
  const selectedTestimonialIds = formData
    .getAll("testimonialIds")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);

  if (selectedTestimonialIds.length > 12 || new Set(selectedTestimonialIds).size !== selectedTestimonialIds.length) throw new Error("Select at most 12 unique testimonials");
  if (await prisma.testimonial.count({ where: { siteId: site.id, id: { in: selectedTestimonialIds }, status: "APPROVED" } }) !== selectedTestimonialIds.length) throw new Error("Select approved testimonials belonging to this site");

  profiles[profileKey] = {
    ...current,
    testimonialHeading: stringOrFallback(formData.get("testimonialHeading"), current.testimonialHeading).trim(),
    testimonialIds: selectedTestimonialIds,
    testimonialIntro: stringOrFallback(formData.get("testimonialIntro"), current.testimonialIntro).trim()
  };

  const saved = await prisma.siteSettings.updateMany({
    where: { siteId: site.id, updatedAt: settings.updatedAt },
    data: { publicContentConfig: contentProfilesToJson(profiles, settings.publicContentConfig) }
  });

  if (saved.count !== 1) throw new Error("Site content changed while saving. Reload before retrying.");
  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect(`/admin/modules/content?profile=${profileKey}&saved=curation`);
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

function stringOrFallback(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeFeaturedTargetType(value: FormDataEntryValue | null): FeaturedBookingTargetType {
  return featuredBookingTargetTypes.includes(value as FeaturedBookingTargetType) ? (value as FeaturedBookingTargetType) : "CATEGORY";
}
