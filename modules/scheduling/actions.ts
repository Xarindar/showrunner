"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  availabilityFormSchema,
  blockoutFormSchema,
  csvList,
  parseForm,
  serviceFormSchema,
  serviceUpdateFormSchema
} from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";
import { generateUniqueServiceSlug } from "@/lib/services/service-slugs";
import { getSiteSettings } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { parseZonedDateTimeInput } from "@/lib/timezone";

const SERVICES_ADMIN_PATH = "/admin/modules/services";
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

function servicesAdminPath(params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `${SERVICES_ADMIN_PATH}${query ? `?${query}` : ""}`;
}

function refreshScheduling() {
  revalidatePath("/admin");
  revalidatePath(SERVICES_ADMIN_PATH);
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

export async function createServiceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");

  const input = await parseForm(serviceFormSchema, formData);
  const settings = await getSiteSettings();
  const slug = await generateUniqueServiceSlug(prisma, {
    name: input.name,
    slug: input.slug || "",
    siteId: settings.siteId
  });

  const service = await prisma.service.create({
    data: {
      siteId: settings.siteId,
      slug,
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
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
  await syncServiceStaff(service.id, settings.siteId, selectedStaffIds(formData));
  await syncServiceResources(service.id, settings.siteId, selectedResourceIds(formData));

  refreshScheduling();
  redirect(servicesAdminPath({ saved: "service" }));
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
}

export async function updateServiceAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(serviceUpdateFormSchema, formData);
  const settings = await getSiteSettings();

  await prisma.service.updateMany({
    where: { id: input.id, siteId: settings.siteId },
    data: {
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
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
  await syncServiceStaff(input.id, settings.siteId, selectedStaffIds(formData));
  await syncServiceResources(input.id, settings.siteId, selectedResourceIds(formData));

  refreshScheduling();
  redirect(servicesAdminPath({ saved: "service" }));
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

  await prisma.servicePackage.create({
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
  redirect(servicesAdminPath({ saved: "package", tab: "packages" }));
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
  redirect(servicesAdminPath({ saved: "package", tab: "packages" }));
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
    redirect(servicesAdminPath({ error: "Choose a valid service and package.", tab: "packages" }));
  }
  if (existing) {
    redirect(servicesAdminPath({ error: "That service is already in this package.", tab: "packages" }));
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
  redirect(servicesAdminPath({ saved: "package-item", tab: "packages" }));
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
    redirect(servicesAdminPath({ error: "Package item not found.", tab: "packages" }));
  }

  refreshScheduling();
  redirect(servicesAdminPath({ saved: "package-item", tab: "packages" }));
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
    redirect(servicesAdminPath({ error: parsed.error.issues[0]?.message || "Check the staff form.", tab: "team" }));
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
  redirect(servicesAdminPath({ saved: "staff", tab: "team" }));
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
    redirect(servicesAdminPath({ error: parsed.error?.issues[0]?.message || "Choose a staff member to update.", tab: "team" }));
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
  redirect(servicesAdminPath({ saved: "staff", tab: "team" }));
}

const staffAdminLinkFormSchema = z.object({
  staffId: z.string().trim().min(1),
  adminUserId: z.string().trim().optional()
});

export async function linkStaffMemberAdminUserAction(formData: FormData) {
  await requireAdmin("users:manage");
  const parsed = staffAdminLinkFormSchema.safeParse({
    staffId: formData.get("staffId"),
    adminUserId: formData.get("adminUserId") || ""
  });
  if (!parsed.success) {
    redirect(servicesAdminPath({ error: parsed.error.issues[0]?.message || "Choose a staff member to link.", tab: "team" }));
  }
  const settings = await getSiteSettings();
  const adminUserId = parsed.data.adminUserId || null;

  const staffMember = await prisma.staffMember.findFirst({
    where: { id: parsed.data.staffId, siteId: settings.siteId },
    select: { id: true }
  });
  if (!staffMember) {
    redirect(servicesAdminPath({ error: "Staff member not found.", tab: "team" }));
  }

  if (adminUserId) {
    const adminUser = await prisma.adminUser.findUnique({ where: { id: adminUserId }, select: { id: true } });
    if (!adminUser) {
      redirect(servicesAdminPath({ error: "Admin user not found.", tab: "team" }));
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
  redirect(servicesAdminPath({ saved: "staff-link", tab: "team" }));
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
    redirect(servicesAdminPath({ error: parsed.error.issues[0]?.message || "Check the resource form.", tab: "team" }));
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
  redirect(servicesAdminPath({ saved: "resource", tab: "team" }));
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
    redirect(servicesAdminPath({ error: parsed.error?.issues[0]?.message || "Choose a resource to update.", tab: "team" }));
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
  redirect(servicesAdminPath({ saved: "resource", tab: "team" }));
}

export async function updateReminderSettingsAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = reminderSettingsFormSchema.safeParse({
    enabled: formData.get("enabled") || undefined,
    leadHours: formData.get("leadHours") || 24
  });
  if (!parsed.success) {
    redirect(servicesAdminPath({ error: parsed.error.issues[0]?.message || "Check reminder settings.", tab: "calendar" }));
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
  redirect(servicesAdminPath({ saved: "reminders", tab: "calendar" }));
}

export async function createAvailabilityAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(availabilityFormSchema, formData);
  const settings = await getSiteSettings();
  const staffId = String(formData.get("staffId") || "");
  const resourceId = String(formData.get("resourceId") || "");
  if (staffId && resourceId) {
    redirect(servicesAdminPath({ error: "Choose staff or resource availability, not both.", tab: "availability" }));
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
  redirect(servicesAdminPath({ saved: "availability", tab: "availability" }));
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
    redirect(servicesAdminPath({ error: "blockout", tab: "availability" }));
  }
  if (resourceId) {
    const resource = await prisma.resource.findFirst({
      where: { id: resourceId, siteId: settings.siteId },
      select: { id: true }
    });
    if (!resource) {
      redirect(servicesAdminPath({ error: "Choose a valid resource for the blockout.", tab: "availability" }));
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
  redirect(servicesAdminPath({ saved: "blockout", tab: "availability" }));
}

export async function deleteBlockoutAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();

  await prisma.blockedTime.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}
