"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  availabilityFormSchema,
  blockoutFormSchema,
  parseForm,
  serviceFormSchema,
  serviceUpdateFormSchema
} from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";
import { generateUniqueServiceSlug } from "@/lib/services/service-slugs";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateTimeInput } from "@/lib/timezone";

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

function refreshScheduling() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/scheduling");
  revalidatePath("/book");
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
  redirect("/admin/modules/scheduling?saved=service");
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
  redirect("/admin/modules/scheduling?saved=service");
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
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Check the staff form.")}`);
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
  redirect("/admin/modules/scheduling?saved=staff");
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
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent(parsed.error?.issues[0]?.message || "Choose a staff member to update.")}`);
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
  redirect("/admin/modules/scheduling?saved=staff");
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
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Check the resource form.")}`);
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
  redirect("/admin/modules/scheduling?saved=resource");
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
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent(parsed.error?.issues[0]?.message || "Choose a resource to update.")}`);
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
  redirect("/admin/modules/scheduling?saved=resource");
}

export async function updateReminderSettingsAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const parsed = reminderSettingsFormSchema.safeParse({
    enabled: formData.get("enabled") || undefined,
    leadHours: formData.get("leadHours") || 24
  });
  if (!parsed.success) {
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Check reminder settings.")}`);
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
  redirect("/admin/modules/scheduling?saved=reminders");
}

export async function createAvailabilityAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const input = await parseForm(availabilityFormSchema, formData);
  const settings = await getSiteSettings();
  const staffId = String(formData.get("staffId") || "");
  const resourceId = String(formData.get("resourceId") || "");
  if (staffId && resourceId) {
    redirect(`/admin/modules/scheduling?error=${encodeURIComponent("Choose staff or resource availability, not both.")}`);
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
  redirect("/admin/modules/scheduling?saved=availability");
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
    redirect("/admin/modules/scheduling?error=blockout");
  }
  if (resourceId) {
    const resource = await prisma.resource.findFirst({
      where: { id: resourceId, siteId: settings.siteId },
      select: { id: true }
    });
    if (!resource) {
      redirect(`/admin/modules/scheduling?error=${encodeURIComponent("Choose a valid resource for the blockout.")}`);
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
  redirect("/admin/modules/scheduling?saved=blockout");
}

export async function deleteBlockoutAction(formData: FormData) {
  await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();

  await prisma.blockedTime.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}
