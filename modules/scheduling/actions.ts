"use server";

import { imageFramingSchema } from "@/modules/content/studio/image-framing";
import { initialBusinessHoursSchema } from "@/lib/scheduling/session-input";
import { readSessionOffering } from "@/lib/scheduling/session-offering";
import { hydrateSessionServiceLibrary } from "@/lib/scheduling/service-library-store";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { MediaVariantType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  availabilityFormSchema,
  blockoutFormSchema,
  csvList,
  optionalStoredText,
  parseForm,
  requiredText,
  serviceFormSchema,
  serviceUpdateFormSchema
} from "@/lib/admin-validation";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { generateUniqueServiceSlug } from "@/lib/services/service-slugs";
import { getSiteSettings } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { parseZonedDateTimeInput } from "@/lib/timezone";

const SERVICES_ADMIN_PATH = "/admin/modules/services";
const APPOINTMENTS_ADMIN_PATH = "/admin/modules/appointments";
const LEGACY_SCHEDULING_ADMIN_PATH = "/admin/modules/scheduling";

const staffMemberFormSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, "Add a staff name."),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Use a valid staff email."),
  phone: z.string().trim(),
  title: z.string().trim(),
  bio: z.string().trim(),
  isActive: z.literal("on").optional()
});

const resourceFormSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, "Add a resource name."),
  type: z.string().trim().min(1).max(60).default("ROOM"),
  description: z.string().trim().max(1000).default(""),
  location: z.string().trim().max(200).default(""),
  capacity: z.coerce.number().int().min(1).max(1000).default(1),
  isActive: z.literal("on").optional()
});

const reminderSettingsFormSchema = z.object({
  enabled: z.literal("on").optional(),
  leadHours: z.coerce.number().int().min(1, "Use at least 1 hour.").max(720, "Use 720 hours or fewer.")
});

const servicePackageFormSchema = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().min(1, "Add a package name."),
    slug: z.string().trim().optional(),
    description: z.string().trim().max(2000).default(""),
    tags: z.string().trim().default(""),
    sortOrder: z.coerce.number().int().default(0),
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    description: value.description || "",
    isActive: value.isActive === "on",
    slug: value.slug || "",
    tags: csvList(value.tags)
  }));

const servicePackageItemFormSchema = z.object({
  packageId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  sortOrder: z.coerce.number().int().optional(),
  notes: z.string().trim().max(1000).default("")
});

const servicePackageItemDeleteSchema = z.object({
  id: z.string().trim().min(1),
  packageId: z.string().trim().min(1)
});

const serviceCategoryFormSchema = z.object({
  description: optionalStoredText,
  name: requiredText,
  slug: optionalStoredText.optional(),
  sortOrder: z.coerce.number().int().default(0)
});

const serviceCategoryUpdateSchema = z.object({
  description: optionalStoredText,
  id: requiredText,
  sortOrder: z.coerce.number().int().default(0)
});

const serviceImageUploadSchema = z.object({
  alt: optionalStoredText,
  serviceId: requiredText
});

const serviceImageAttachSchema = serviceImageUploadSchema.extend({
  mediaAssetId: requiredText
});

const serviceImageRemoveSchema = z.object({
  serviceId: requiredText
});

const serviceCategoryImageUploadSchema = z.object({
  alt: optionalStoredText,
  categoryId: requiredText
});

const serviceCategoryImageAttachSchema = serviceCategoryImageUploadSchema.extend({
  mediaAssetId: requiredText
});

const serviceCategoryImageRemoveSchema = z.object({
  categoryId: requiredText
});

function servicesAdminPath(params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `${SERVICES_ADMIN_PATH}${query ? `?${query}` : ""}`;
}

function serviceEditPath(serviceId: string, params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `${SERVICES_ADMIN_PATH}/${serviceId}${query ? `?${query}` : ""}`;
}

function servicePackageEditPath(packageId: string, params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `${SERVICES_ADMIN_PATH}/packages/${packageId}${query ? `?${query}` : ""}`;
}

function serviceCategoriesPath(params?: Record<string, string>) {
  return servicesAdminPath({ tab: "categories", ...(params || {}) });
}

function appointmentRulesPath(tab: "availability" | "team" | "calendar", params?: Record<string, string>) {
  const query = new URLSearchParams({ panel: "rules", tab, ...params }).toString();
  return `${APPOINTMENTS_ADMIN_PATH}?${query}`;
}

function refreshScheduling() {
  revalidatePath("/admin");
  revalidatePath(SERVICES_ADMIN_PATH);
  revalidatePath(APPOINTMENTS_ADMIN_PATH);
  revalidatePath(LEGACY_SCHEDULING_ADMIN_PATH);
  revalidatePath("/book");
}

async function generateUniqueServicePackageSlug(input: { exceptId?: string; name: string; siteId: string; slug?: string }) {
  const baseSlug = slugify(input.slug || input.name) || "package";
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await prisma.servicePackage.findFirst({
      where: {
        siteId: input.siteId,
        slug: candidate,
        ...(input.exceptId ? { id: { not: input.exceptId } } : {})
      },
      select: { id: true }
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function generateUniqueServiceCategorySlug(input: { exceptId?: string; name: string; siteId: string; slug?: string }) {
  const baseSlug = slugify(input.slug || input.name) || "category";
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await prisma.serviceCategory.findFirst({
      where: {
        siteId: input.siteId,
        slug: candidate,
        ...(input.exceptId ? { id: { not: input.exceptId } } : {})
      },
      select: { id: true }
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureServiceCategory(siteId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) return null;

  const existing = await prisma.serviceCategory.findFirst({
    where: { siteId, name: normalizedName },
    select: { id: true }
  });
  if (existing) return existing;

  const slug = await generateUniqueServiceCategorySlug({ name: normalizedName, siteId });
  const sortOrder = await prisma.serviceCategory.count({ where: { siteId } });

  return prisma.serviceCategory.create({
    data: {
      siteId,
      slug,
      name: normalizedName,
      sortOrder
    },
    select: { id: true }
  });
}

function hasUpload(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

async function assertServiceForSite(serviceId: string, siteId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, siteId },
    select: { id: true, name: true }
  });
  if (!service) {
    redirect(servicesAdminPath({ error: "Service not found." }));
  }
  return service;
}

async function assertServiceCategoryForSite(categoryId: string, siteId: string) {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: categoryId, siteId },
    select: { id: true, name: true }
  });
  if (!category) {
    redirect(serviceCategoriesPath({ error: "Service category not found." }));
  }
  return category;
}

function selectedStaffIds(formData: FormData) {
  return formData
    .getAll("staffIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function selectedResourceIds(formData: FormData) {
  return formData
    .getAll("resourceIds")
    .map((value) => String(value))
    .filter(Boolean);
}

async function syncServiceStaff(serviceId: string, siteId: string, staffIds: string[]) {
  const activeStaff = await prisma.staffMember.findMany({
    where: { id: { in: staffIds }, siteId, isActive: true },
    select: { id: true }
  });
  const activeIds = new Set(activeStaff.map((staff) => staff.id));
  const normalizedIds = [...new Set(staffIds.filter((id) => activeIds.has(id)))];
  const existing = await prisma.serviceStaff.findMany({
    where: { serviceId, siteId },
    select: { id: true, staffId: true }
  });
  const existingIds = new Set(existing.map((assignment) => assignment.staffId));
  const nextIds = new Set(normalizedIds);

  await prisma.$transaction([
    prisma.serviceStaff.deleteMany({
      where: {
        serviceId,
        siteId,
        staffId: { in: existing.filter((assignment) => !nextIds.has(assignment.staffId)).map((assignment) => assignment.staffId) }
      }
    }),
    ...normalizedIds
      .filter((staffId) => !existingIds.has(staffId))
      .map((staffId) =>
        prisma.serviceStaff.create({
          data: {
            siteId,
            serviceId,
            staffId
          }
        })
      )
  ]);
}

async function syncServiceResources(serviceId: string, siteId: string, resourceIds: string[]) {
  const activeResources = await prisma.resource.findMany({
    where: { id: { in: resourceIds }, siteId, isActive: true },
    select: { id: true }
  });
  const activeIds = new Set(activeResources.map((resource) => resource.id));
  const normalizedIds = [...new Set(resourceIds.filter((id) => activeIds.has(id)))];
  const existing = await prisma.serviceResource.findMany({
    where: { serviceId, siteId },
    select: { id: true, resourceId: true }
  });
  const existingIds = new Set(existing.map((assignment) => assignment.resourceId));
  const nextIds = new Set(normalizedIds);

  await prisma.$transaction([
    prisma.serviceResource.deleteMany({
      where: {
        serviceId,
        siteId,
        resourceId: { in: existing.filter((assignment) => !nextIds.has(assignment.resourceId)).map((assignment) => assignment.resourceId) }
      }
    }),
    ...normalizedIds
      .filter((resourceId) => !existingIds.has(resourceId))
      .map((resourceId) =>
        prisma.serviceResource.create({
          data: {
            siteId,
            serviceId,
            resourceId
          }
        })
      )
  ]);
}

export async function createServiceAction(_previous: { error: string }, formData: FormData) {
  await requireAdmin("scheduling:manage");

  const parsed = serviceFormSchema.safeParse({ slug: "", category: "", tags: "", location: "", intakePrompt: "", policyText: "", ...Object.fromEntries(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const settings = await getSiteSettings();
  let service;
  try {
    const offering = await hydrateSessionServiceLibrary(input.sessionOffering ?? null, settings.siteId);
    const slug = await generateUniqueServiceSlug(prisma, {
      name: input.name,
      slug: input.slug || "",
      siteId: settings.siteId
    });

    service = await prisma.$transaction(async tx => {
      const existingHours = await tx.availabilityRule.count({ where: { siteId: settings.siteId, staffId: null, resourceId: null } });
      if (input.isActive && !existingHours) {
        const hours = initialBusinessHoursSchema.safeParse({ weekdays: formData.getAll("weekdays"), start: formData.get("hoursStart"), end: formData.get("hoursEnd") });
        if (!hours.success) throw new Error(hours.error.issues[0].message);
        const longestTier = Math.max(input.durationMinutes, ...(input.sessionOffering?.tiers.map(tier => tier.durationMinutes) ?? []));
        if (hours.data.end - hours.data.start < longestTier) throw new Error("Business hours must be long enough for every package.");
        await tx.availabilityRule.createMany({ data: [...new Set(hours.data.weekdays)].map(weekday => ({ siteId: settings.siteId, weekday, startMinutes: hours.data.start, endMinutes: hours.data.end })) });
      }
        return tx.service.create({
        data: {
          siteId: settings.siteId,
          slug,
          name: input.name,
          description: input.description,
          durationMinutes: input.durationMinutes,
          ...(offering ? { sessionOffering: offering } : {}),
          ...(input.price !== undefined ? { priceCents: input.price === "" ? null : input.price } : {}),
          location: input.location,
          category: input.category,
          tags: input.tags,
          bufferBeforeMinutes: input.bufferBeforeMinutes,
          bufferAfterMinutes: input.bufferAfterMinutes,
          minimumNoticeHours: input.minimumNoticeHours,
          maxAdvanceDays: input.maxAdvanceDays,
          slotIntervalMinutes: input.slotIntervalMinutes,
          intakePrompt: input.intakePrompt,
          policyText: input.policyText,
          requirePolicy: input.requirePolicy,
          requestOnly: input.requestOnly,
          waitlistEnabled: input.waitlistEnabled,
          isActive: input.isActive
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  } catch (error) {
    return { error: error instanceof Error && !("code" in error) ? error.message : "The session type could not be saved. Your details are still here; please try again." };
  }

  refreshScheduling();
  revalidatePath(serviceEditPath(service.id));
  redirect(serviceEditPath(service.id, { saved: "created" }));
}

export async function toggleServiceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");

  const id = String(formData.get("id") || "");
  const isActive = String(formData.get("isActive") || "") === "true";
  const settings = await getSiteSettings();

  await prisma.service.updateMany({
    where: { id, siteId: settings.siteId },
    data: { isActive }
  });

  refreshScheduling();
  redirect(servicesAdminPath());
}

export async function updateServiceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceUpdateFormSchema, formData);
  const settings = await getSiteSettings();
  const current = await prisma.service.findFirst({ where: { id: input.id, siteId: settings.siteId } });
  if (!current) redirect(servicesAdminPath({ error: "Session type not found." }));
  const offering = await hydrateSessionServiceLibrary(input.sessionOffering ?? readSessionOffering(current.sessionOffering), settings.siteId);
  // Older service forms edit the default package; keep the other tiers and coverage intact.
  if (offering && !input.sessionOffering) {
    offering.tiers[0].durationMinutes = input.durationMinutes;
    if (input.price !== undefined) offering.tiers[0].priceCents = input.price === "" ? null : input.price;
    if (offering.tiers.length > 1 && offering.tiers[0].priceCents === null) redirect(serviceEditPath(input.id, { error: "Set a price for every package." }));
  }

  await prisma.service.updateMany({
    where: { id: input.id, siteId: settings.siteId },
    data: {
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
      ...(offering ? { sessionOffering: offering } : {}),
      ...(input.price !== undefined ? { priceCents: input.price === "" ? null : input.price } : {}),
      location: input.location,
      category: input.category,
      tags: input.tags,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      minimumNoticeHours: input.minimumNoticeHours,
      maxAdvanceDays: input.maxAdvanceDays,
      slotIntervalMinutes: input.slotIntervalMinutes,
      intakePrompt: input.intakePrompt,
      policyText: input.policyText,
      requirePolicy: input.requirePolicy,
      requestOnly: input.requestOnly,
      waitlistEnabled: input.waitlistEnabled,
      isActive: input.isActive
    }
  });
  await ensureServiceCategory(settings.siteId, input.category);
  if (formData.has("syncStaffAssignments")) {
    await syncServiceStaff(input.id, settings.siteId, selectedStaffIds(formData));
  }
  if (formData.has("syncResourceAssignments")) {
    await syncServiceResources(input.id, settings.siteId, selectedResourceIds(formData));
  }

  refreshScheduling();
  revalidatePath(serviceEditPath(input.id));
  redirect(serviceEditPath(input.id, { saved: "service" }));
}

export async function updateSessionTypeAction(_previous: { error: string }, formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = serviceUpdateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const settings = await getSiteSettings();
  if (!await prisma.service.findFirst({ where: { id: parsed.data.id, siteId: settings.siteId, isOneOff: false }, select: { id: true } })) {
    return { error: "This session type is no longer available." };
  }
  try { await updateServiceAction(formData); }
  catch (error) {
    unstable_rethrow(error);
    return { error: "The session type could not be saved. Your changes are still here; please try again." };
  }
  return { error: "" };
}

export async function createServiceCategoryAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceCategoryFormSchema, formData, serviceCategoriesPath());
  const settings = await getSiteSettings();
  const slug = await generateUniqueServiceCategorySlug({
    name: input.name,
    siteId: settings.siteId,
    slug: input.slug
  });
  const sortOrder = input.sortOrder || (await prisma.serviceCategory.count({ where: { siteId: settings.siteId } }));

  await prisma.serviceCategory.create({
    data: {
      siteId: settings.siteId,
      slug,
      name: input.name,
      description: input.description,
      sortOrder
    }
  });

  refreshScheduling();
  redirect(serviceCategoriesPath({ saved: "category" }));
}

export async function updateServiceCategoryAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceCategoryUpdateSchema, formData, serviceCategoriesPath());
  const settings = await getSiteSettings();

  await prisma.serviceCategory.updateMany({
    where: { id: input.id, siteId: settings.siteId },
    data: {
      description: input.description,
      sortOrder: input.sortOrder
    }
  });

  refreshScheduling();
  redirect(serviceCategoriesPath({ saved: "category" }));
}

export async function saveServiceImageFramingAction(raw: unknown) {
  await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();
  const input = z.object({ id: requiredText, updatedAt: z.iso.datetime(), framing: imageFramingSchema }).safeParse(raw);
  if (!input.success) return { error: "Choose valid image framing and try again." };
  try {
    const result = await prisma.service.updateMany({
      where: { id: input.data.id, siteId: settings.siteId, updatedAt: new Date(input.data.updatedAt) },
      data: { imageFraming: input.data.framing }
    });
    if (result.count !== 1) return { error: "This service changed. Reload before adjusting its photo." };
    revalidatePath("/", "layout");
    return { saved: true };
  } catch { return { error: "Framing could not be saved. Try again." }; }
}

export async function uploadServiceImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceImageUploadSchema, formData);
  const settings = await getSiteSettings();
  const service = await assertServiceForSite(input.serviceId, settings.siteId);
  const file = formData.get("file");
  if (!hasUpload(file)) {
    redirect(serviceEditPath(input.serviceId, { error: "Choose an image before uploading." }));
  }

  let asset: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    asset = await uploadMedia(
      file,
      {
        alt: input.alt || service.name,
        folder: "services",
        tags: ["service", service.name],
        usageContext: "service booking image"
      },
      settings.mediaDriver,
      settings.siteId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service image upload failed.";
    redirect(serviceEditPath(input.serviceId, { error: message }));
  }

  await prisma.service.updateMany({
    where: { id: input.serviceId, siteId: settings.siteId },
    data: {
      imageUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
      mediaAssetId: asset.id,
      imageFraming: Prisma.DbNull
    }
  });

  refreshScheduling();
  revalidatePath(serviceEditPath(input.serviceId));
  redirect(serviceEditPath(input.serviceId, { saved: "media" }));
}

export async function attachServiceImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceImageAttachSchema, formData);
  const settings = await getSiteSettings();
  await assertServiceForSite(input.serviceId, settings.siteId);

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaAssetId, siteId: settings.siteId, deletedAt: null, isPrivate: false },
    select: { alt: true, driver: true, filename: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
  });
  if (!asset) {
    redirect(serviceEditPath(input.serviceId, { error: "Choose an active public media asset." }));
  }

  await prisma.service.updateMany({
    where: { id: input.serviceId, siteId: settings.siteId },
    data: {
      imageUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
      mediaAssetId: asset.id,
      imageFraming: Prisma.DbNull
    }
  });

  refreshScheduling();
  revalidatePath(serviceEditPath(input.serviceId));
  redirect(serviceEditPath(input.serviceId, { saved: "media" }));
}

export async function removeServiceImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceImageRemoveSchema, formData);
  const settings = await getSiteSettings();
  await assertServiceForSite(input.serviceId, settings.siteId);

  await prisma.service.updateMany({
    where: { id: input.serviceId, siteId: settings.siteId },
    data: {
      imageUrl: "",
      mediaAssetId: null,
      imageFraming: Prisma.DbNull
    }
  });

  refreshScheduling();
  revalidatePath(serviceEditPath(input.serviceId));
  redirect(serviceEditPath(input.serviceId, { saved: "media" }));
}

export async function uploadServiceCategoryImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceCategoryImageUploadSchema, formData, serviceCategoriesPath());
  const settings = await getSiteSettings();
  const category = await assertServiceCategoryForSite(input.categoryId, settings.siteId);
  const file = formData.get("file");
  if (!hasUpload(file)) {
    redirect(serviceCategoriesPath({ error: "Choose an image before uploading." }));
  }

  let asset: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    asset = await uploadMedia(
      file,
      {
        alt: input.alt || category.name,
        folder: "services/categories",
        tags: ["service-category", category.name],
        usageContext: "service category booking image"
      },
      settings.mediaDriver,
      settings.siteId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Category image upload failed.";
    redirect(serviceCategoriesPath({ error: message }));
  }

  await prisma.serviceCategory.updateMany({
    where: { id: input.categoryId, siteId: settings.siteId },
    data: {
      imageUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
      mediaAssetId: asset.id
    }
  });

  refreshScheduling();
  redirect(serviceCategoriesPath({ saved: "category-media" }));
}

export async function attachServiceCategoryImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceCategoryImageAttachSchema, formData, serviceCategoriesPath());
  const settings = await getSiteSettings();
  await assertServiceCategoryForSite(input.categoryId, settings.siteId);

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaAssetId, siteId: settings.siteId, deletedAt: null, isPrivate: false },
    select: { alt: true, driver: true, filename: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
  });
  if (!asset) {
    redirect(serviceCategoriesPath({ error: "Choose an active public media asset." }));
  }

  await prisma.serviceCategory.updateMany({
    where: { id: input.categoryId, siteId: settings.siteId },
    data: {
      imageUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
      mediaAssetId: asset.id
    }
  });

  refreshScheduling();
  redirect(serviceCategoriesPath({ saved: "category-media" }));
}

export async function removeServiceCategoryImageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceCategoryImageRemoveSchema, formData, serviceCategoriesPath());
  const settings = await getSiteSettings();
  await assertServiceCategoryForSite(input.categoryId, settings.siteId);

  await prisma.serviceCategory.updateMany({
    where: { id: input.categoryId, siteId: settings.siteId },
    data: {
      imageUrl: "",
      mediaAssetId: null
    }
  });

  refreshScheduling();
  redirect(serviceCategoriesPath({ saved: "category-media" }));
}

export async function createServicePackageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(servicePackageFormSchema, formData, SERVICES_ADMIN_PATH);
  const settings = await getSiteSettings();
  const slug = await generateUniqueServicePackageSlug({
    name: input.name,
    siteId: settings.siteId,
    slug: input.slug
  });

  const servicePackage = await prisma.servicePackage.create({
    data: {
      siteId: settings.siteId,
      slug,
      name: input.name,
      description: input.description,
      tags: input.tags,
      sortOrder: input.sortOrder,
      isActive: input.isActive
    }
  });

  refreshScheduling();
  revalidatePath(servicePackageEditPath(servicePackage.id));
  redirect(servicePackageEditPath(servicePackage.id, { saved: "created" }));
}

export async function updateServicePackageAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(servicePackageFormSchema, formData, SERVICES_ADMIN_PATH);
  if (!input.id) {
    redirect(servicesAdminPath({ error: "Choose a package to update.", tab: "packages" }));
  }

  const settings = await getSiteSettings();
  const currentPackage = await prisma.servicePackage.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    select: { id: true, slug: true }
  });
  if (!currentPackage) {
    redirect(servicesAdminPath({ error: "Package not found.", tab: "packages" }));
  }

  const slug = await generateUniqueServicePackageSlug({
    exceptId: input.id,
    name: input.name,
    siteId: settings.siteId,
    slug: input.slug || currentPackage.slug
  });

  await prisma.servicePackage.update({
    where: { id: input.id },
    data: {
      slug,
      name: input.name,
      description: input.description,
      tags: input.tags,
      sortOrder: input.sortOrder,
      isActive: input.isActive
    }
  });

  refreshScheduling();
  revalidatePath(servicePackageEditPath(input.id));
  redirect(servicePackageEditPath(input.id, { saved: "package" }));
}

export async function addServicePackageItemAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(servicePackageItemFormSchema, formData, SERVICES_ADMIN_PATH);
  const settings = await getSiteSettings();
  const [servicePackage, service, existing, itemCount] = await Promise.all([
    prisma.servicePackage.findFirst({ where: { id: input.packageId, siteId: settings.siteId }, select: { id: true } }),
    prisma.service.findFirst({ where: { id: input.serviceId, siteId: settings.siteId }, select: { id: true } }),
    prisma.servicePackageItem.findFirst({
      where: { packageId: input.packageId, serviceId: input.serviceId },
      select: { id: true }
    }),
    prisma.servicePackageItem.count({ where: { packageId: input.packageId, siteId: settings.siteId } })
  ]);

  if (!servicePackage || !service) {
    redirect(servicePackageEditPath(input.packageId, { error: "Choose a valid service and package." }));
  }
  if (existing) {
    redirect(servicePackageEditPath(input.packageId, { error: "That service is already in this package." }));
  }

  await prisma.servicePackageItem.create({
    data: {
      siteId: settings.siteId,
      packageId: input.packageId,
      serviceId: input.serviceId,
      quantity: input.quantity,
      sortOrder: input.sortOrder ?? itemCount,
      notes: input.notes
    }
  });

  refreshScheduling();
  revalidatePath(servicePackageEditPath(input.packageId));
  redirect(servicePackageEditPath(input.packageId, { saved: "package-item" }));
}

export async function removeServicePackageItemAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(servicePackageItemDeleteSchema, formData, SERVICES_ADMIN_PATH);
  const settings = await getSiteSettings();
  const deleted = await prisma.servicePackageItem.deleteMany({
    where: {
      id: input.id,
      packageId: input.packageId,
      siteId: settings.siteId
    }
  });

  if (deleted.count !== 1) {
    redirect(servicePackageEditPath(input.packageId, { error: "Package item not found." }));
  }

  refreshScheduling();
  revalidatePath(servicePackageEditPath(input.packageId));
  redirect(servicePackageEditPath(input.packageId, { saved: "package-item" }));
}

export async function createStaffMemberAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = staffMemberFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
    title: formData.get("title") || "",
    bio: formData.get("bio") || "",
    isActive: formData.get("isActive") || undefined
  });
  if (!parsed.success) {
    redirect(appointmentRulesPath("team", { error: parsed.error.issues[0]?.message || "Check the staff form." }));
  }
  const settings = await getSiteSettings();

  await prisma.staffMember.create({
    data: {
      siteId: settings.siteId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      title: parsed.data.title,
      bio: parsed.data.bio,
      isActive: parsed.data.isActive === "on"
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("team", { saved: "staff" }));
}

export async function updateStaffMemberAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = staffMemberFormSchema.safeParse({
    id: formData.get("id") || "",
    name: formData.get("name"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
    title: formData.get("title") || "",
    bio: formData.get("bio") || "",
    isActive: formData.get("isActive") || undefined
  });
  if (!parsed.success || !parsed.data.id) {
    redirect(appointmentRulesPath("team", { error: parsed.error?.issues[0]?.message || "Choose a staff member to update." }));
  }
  const settings = await getSiteSettings();

  await prisma.staffMember.updateMany({
    where: { id: parsed.data.id, siteId: settings.siteId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      title: parsed.data.title,
      bio: parsed.data.bio,
      isActive: parsed.data.isActive === "on"
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("team", { saved: "staff" }));
}

const staffAdminLinkFormSchema = z.object({
  staffId: z.string().trim().min(1),
  adminUserId: z.string().trim().optional()
});

export async function linkStaffMemberAdminUserAction(formData: FormData) {
  const actor = await requireAdmin("users:manage");
  const parsed = staffAdminLinkFormSchema.safeParse({
    staffId: formData.get("staffId"),
    adminUserId: formData.get("adminUserId") || ""
  });
  if (!parsed.success) {
    redirect(appointmentRulesPath("team", { error: parsed.error.issues[0]?.message || "Choose a staff member to link." }));
  }
  const settings = await getSiteSettings();
  const adminUserId = parsed.data.adminUserId || null;

  const staffMember = await prisma.staffMember.findFirst({
    where: { id: parsed.data.staffId, siteId: settings.siteId },
    select: { id: true }
  });
  if (!staffMember) {
    redirect(appointmentRulesPath("team", { error: "Staff member not found." }));
  }

  if (adminUserId) {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: adminUserId, tenantId: actor.tenantId },
      select: { id: true }
    });
    if (!adminUser) {
      redirect(appointmentRulesPath("team", { error: "Admin user not found." }));
    }
  }

  await prisma.$transaction(async (tx) => {
    if (adminUserId) {
      await tx.staffMember.updateMany({
        where: { siteId: settings.siteId, adminUserId, id: { not: parsed.data.staffId } },
        data: { adminUserId: null }
      });
    }

    await tx.staffMember.update({
      where: { id: parsed.data.staffId },
      data: { adminUserId }
    });
  });

  refreshScheduling();
  redirect(appointmentRulesPath("team", { saved: "staff-link" }));
}

export async function createResourceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = resourceFormSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "ROOM",
    description: formData.get("description") || "",
    location: formData.get("location") || "",
    capacity: formData.get("capacity") || 1,
    isActive: formData.get("isActive") || undefined
  });
  if (!parsed.success) {
    redirect(appointmentRulesPath("team", { error: parsed.error.issues[0]?.message || "Check the resource form." }));
  }
  const settings = await getSiteSettings();

  await prisma.resource.create({
    data: {
      siteId: settings.siteId,
      name: parsed.data.name,
      type: parsed.data.type.toUpperCase(),
      description: parsed.data.description,
      location: parsed.data.location,
      capacity: parsed.data.capacity,
      isActive: parsed.data.isActive === "on"
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("team", { saved: "resource" }));
}

export async function updateResourceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = resourceFormSchema.safeParse({
    id: formData.get("id") || "",
    name: formData.get("name"),
    type: formData.get("type") || "ROOM",
    description: formData.get("description") || "",
    location: formData.get("location") || "",
    capacity: formData.get("capacity") || 1,
    isActive: formData.get("isActive") || undefined
  });
  if (!parsed.success || !parsed.data.id) {
    redirect(appointmentRulesPath("team", { error: parsed.error?.issues[0]?.message || "Choose a resource to update." }));
  }
  const settings = await getSiteSettings();

  await prisma.resource.updateMany({
    where: { id: parsed.data.id, siteId: settings.siteId },
    data: {
      name: parsed.data.name,
      type: parsed.data.type.toUpperCase(),
      description: parsed.data.description,
      location: parsed.data.location,
      capacity: parsed.data.capacity,
      isActive: parsed.data.isActive === "on"
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("team", { saved: "resource" }));
}

export async function updateReminderSettingsAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = reminderSettingsFormSchema.safeParse({
    enabled: formData.get("enabled") || undefined,
    leadHours: formData.get("leadHours") || 24
  });
  if (!parsed.success) {
    redirect(appointmentRulesPath("calendar", { error: parsed.error.issues[0]?.message || "Check reminder settings." }));
  }
  const settings = await getSiteSettings();
  const leadMinutes = parsed.data.leadHours * 60;

  await prisma.schedulingSettings.upsert({
    where: { siteId: settings.siteId },
    update: {
      bookingReminderEnabled: parsed.data.enabled === "on",
      bookingReminderLeadMinutes: leadMinutes
    },
    create: {
      siteId: settings.siteId,
      bookingReminderEnabled: parsed.data.enabled === "on",
      bookingReminderLeadMinutes: leadMinutes
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("calendar", { saved: "reminders" }));
}

export async function createAvailabilityAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(availabilityFormSchema, formData);
  const settings = await getSiteSettings();
  const staffId = String(formData.get("staffId") || "");
  const resourceId = String(formData.get("resourceId") || "");
  if (staffId && resourceId) {
    redirect(appointmentRulesPath("availability", { error: "Choose staff or resource availability, not both." }));
  }

  await prisma.availabilityRule.create({
    data: {
      siteId: settings.siteId,
      staffId: staffId || undefined,
      resourceId: resourceId || undefined,
      weekday: input.weekday,
      startMinutes: input.startTime,
      endMinutes: input.endTime
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("availability", { saved: "availability" }));
}

export async function deleteAvailabilityAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();

  await prisma.availabilityRule.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}

export async function createBlockoutAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(blockoutFormSchema, formData);
  const settings = await getSiteSettings();
  const startsAt = parseZonedDateTimeInput(input.startsAt, settings.timezone);
  const endsAt = parseZonedDateTimeInput(input.endsAt, settings.timezone);
  const resourceId = String(formData.get("resourceId") || "");

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    redirect(appointmentRulesPath("availability", { error: "blockout" }));
  }
  if (resourceId) {
    const resource = await prisma.resource.findFirst({
      where: { id: resourceId, siteId: settings.siteId },
      select: { id: true }
    });
    if (!resource) {
      redirect(appointmentRulesPath("availability", { error: "Choose a valid resource for the blockout." }));
    }
  }

  await prisma.blockedTime.create({
    data: {
      siteId: settings.siteId,
      resourceId: resourceId || undefined,
      startsAt,
      endsAt,
      reason: input.reason
    }
  });

  refreshScheduling();
  redirect(appointmentRulesPath("availability", { saved: "blockout" }));
}

export async function deleteBlockoutAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();

  await prisma.blockedTime.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}
