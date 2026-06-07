"use server";

import { TestimonialStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formObject, parseForm } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

const trimmed = z.string().transform((value) => value.trim());
const requiredText = trimmed.pipe(z.string().min(1));
const optionalStoredText = trimmed.transform((value) => value || "");
const optionalEmailStored = trimmed
  .refine((value) => value === "" || z.email().safeParse(value).success, "Use a valid email address.")
  .transform((value) => (value ? value.toLowerCase() : ""));

const testimonialSchema = z
  .object({
    authorName: requiredText,
    authorEmail: optionalEmailStored,
    authorRole: optionalStoredText,
    quote: requiredText.pipe(z.string().min(10)),
    rating: z.coerce.number().int().min(1).max(5),
    source: optionalStoredText,
    sourceUrl: optionalStoredText,
    serviceName: optionalStoredText,
    productName: optionalStoredText,
    permissionGranted: z.literal("on").optional(),
    status: z.enum(TestimonialStatus).catch(TestimonialStatus.PENDING),
    featured: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    source: value.source || "first-party",
    permissionGranted: value.permissionGranted === "on",
    featured: value.featured === "on"
  }));

const moderationSchema = z.object({
  id: requiredText,
  status: z.enum(TestimonialStatus).optional(),
  featured: z.enum(["true", "false"]).optional()
});

const deleteTestimonialSchema = z.object({
  id: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the testimonial." })
});

const publicTestimonialSchema = z.object({
  authorName: requiredText,
  authorEmail: optionalEmailStored,
  authorRole: optionalStoredText,
  quote: requiredText.pipe(z.string().min(10)),
  rating: z.coerce.number().int().min(1).max(5),
  serviceName: optionalStoredText,
  permissionGranted: z.literal("on")
});

function refreshTestimonials() {
  revalidatePath("/");
  revalidatePath("/testimonials");
  revalidatePath("/admin");
  revalidatePath("/admin/modules/testimonials");
  revalidatePath("/admin/modules/clients");
}

async function findOrCreateClient(authorName: string, authorEmail: string, updateExistingName = false) {
  if (!authorEmail) return undefined;

  const client = await prisma.client.upsert({
    where: { email: authorEmail },
    update: updateExistingName && authorName ? { name: authorName } : {},
    create: {
      name: authorName || authorEmail,
      email: authorEmail
    },
    select: { id: true }
  });

  return client.id;
}

export async function createTestimonialAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(testimonialSchema, formData, "/admin/modules/testimonials");
  const clientId = await findOrCreateClient(input.authorName, input.authorEmail, true);

  await prisma.testimonial.create({
    data: {
      clientId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      authorRole: input.authorRole,
      quote: input.quote,
      rating: input.rating,
      source: input.source,
      sourceUrl: input.sourceUrl,
      serviceName: input.serviceName,
      productName: input.productName,
      permissionGranted: input.permissionGranted,
      status: input.status,
      featured: input.featured
    }
  });

  refreshTestimonials();
  redirect("/admin/modules/testimonials?saved=testimonial");
}

export async function updateTestimonialModerationAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(moderationSchema, formData, "/admin/modules/testimonials");

  await prisma.testimonial.update({
    where: { id: input.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.featured ? { featured: input.featured === "true" } : {}),
      ...(input.status === TestimonialStatus.REJECTED ? { featured: false } : {})
    }
  });

  refreshTestimonials();
}

export async function deleteTestimonialAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(deleteTestimonialSchema, formData, "/admin/modules/testimonials");

  await prisma.testimonial.delete({
    where: { id: input.id }
  });

  refreshTestimonials();
  redirect("/admin/modules/testimonials?saved=delete");
}

export async function createPublicTestimonialAction(formData: FormData) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("testimonials")) {
    redirect("/");
  }

  if (String(formData.get("companyWebsite") || "").trim()) {
    redirect("/testimonials?submitted=1");
  }

  const rateLimitMessage = await publicRateLimitMessage("testimonial_submission");
  if (rateLimitMessage) {
    redirect(`/testimonials?error=${encodeURIComponent(rateLimitMessage)}`);
  }

  const parsed = publicTestimonialSchema.safeParse(formObject(formData));

  if (!parsed.success) {
    redirect(`/testimonials?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Check the testimonial form.")}`);
  }

  const input = parsed.data;
  const clientId = await findOrCreateClient(input.authorName, input.authorEmail, false);

  await prisma.testimonial.create({
    data: {
      clientId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      authorRole: input.authorRole,
      quote: input.quote,
      rating: input.rating,
      source: "first-party",
      serviceName: input.serviceName,
      permissionGranted: true,
      status: TestimonialStatus.PENDING,
      featured: false
    }
  });

  refreshTestimonials();
  redirect("/testimonials?submitted=1");
}
