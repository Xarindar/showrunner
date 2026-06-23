"use server";

import { MediaVariantType, TestimonialStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { optionalStoredText, parseForm, requiredText, trimmed } from "@/lib/admin-validation";
import { getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId, getSiteSettingsForSite } from "@/lib/site";

const contentPath = "/admin/modules/content";
const adminPermissionText = "Permission to display this testimonial publicly was recorded by an admin.";

// Persist only site paths or public URLs picked from the media library; object
// URLs from in-browser upload previews must never be stored (the file upload
// below resolves them to a real asset URL instead).
const storedImageUrl = trimmed.transform((value) =>
  value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://") ? value : ""
);

const contentTestimonialSchema = z
  .object({
    authorName: requiredText,
    authorRole: optionalStoredText,
    serviceName: optionalStoredText,
    quote: requiredText.pipe(z.string().min(10, "Use a quote with at least 10 characters.")),
    rating: z.coerce.number().int().min(1).max(5).catch(5),
    imageUrl: storedImageUrl,
    featured: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    featured: value.featured === "on"
  }));

const removeTestimonialSchema = z.object({
  id: requiredText
});

function refreshTestimonials() {
  revalidatePath("/");
  revalidatePath("/testimonials");
  revalidatePath("/admin");
  revalidatePath(contentPath);
  revalidatePath("/admin/modules/testimonials");
}

export async function createContentTestimonialAction(formData: FormData) {
  const user = await requireAdmin("content:manage");
  const input = await parseForm(contentTestimonialSchema, formData, contentPath);
  const siteId = await getCurrentSiteId();

  const uploadedImageUrl = await uploadTestimonialImageIfPresent(formData, {
    authorName: input.authorName,
    siteId,
    user
  });
  const imageUrl = uploadedImageUrl || input.imageUrl;

  await prisma.testimonial.create({
    data: {
      siteId,
      authorName: input.authorName,
      authorRole: input.authorRole,
      serviceName: input.serviceName,
      quote: input.quote,
      rating: input.rating,
      imageUrl,
      source: "first-party",
      permissionGranted: true,
      permissionText: adminPermissionText,
      permissionGrantedAt: new Date(),
      status: TestimonialStatus.APPROVED,
      featured: input.featured
    }
  });

  refreshTestimonials();
  redirect(`${contentPath}?saved=testimonial`);
}

// Archive rather than delete so the entry can be restored from the moderation
// page; archived testimonials drop out of the rail and every public surface.
export async function removeContentTestimonialAction(formData: FormData) {
  await requireAdmin("content:manage");
  const input = await parseForm(removeTestimonialSchema, formData, contentPath);
  const siteId = await getCurrentSiteId();

  await prisma.testimonial.updateMany({
    where: { id: input.id, siteId },
    data: { status: TestimonialStatus.ARCHIVED, featured: false }
  });

  refreshTestimonials();
  redirect(`${contentPath}?saved=testimonial-removed`);
}

async function uploadTestimonialImageIfPresent(
  formData: FormData,
  input: {
    authorName: string;
    siteId: string;
    user: Awaited<ReturnType<typeof requireAdmin>>;
  }
) {
  const file = formData.get("testimonialImageUpload");
  if (!(file instanceof File) || file.size === 0) return "";

  const ownerStaffIds = await getOwnerStaffIds(input.user, input.siteId);
  if ((await resolveDataScopeMode(input.user, input.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`${contentPath}?error=${encodeURIComponent("Create an active staff profile before uploading scoped media.")}`);
  }

  try {
    const settings = await getSiteSettingsForSite(input.siteId);
    const asset = await uploadMedia(
      file,
      {
        alt: input.authorName ? `${input.authorName} testimonial photo` : "Testimonial photo",
        folder: "content/testimonials",
        tags: ["testimonial"],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "testimonial"
      },
      settings.mediaDriver,
      input.siteId
    );
    return mediaAssetDisplayUrl(asset, MediaVariantType.CARD);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Testimonial image upload failed.";
    redirect(`${contentPath}?error=${encodeURIComponent(message)}`);
  }
}
