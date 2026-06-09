"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function refreshScheduling() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/scheduling");
  revalidatePath("/book");
}

export async function createServiceAction(formData: FormData) {
  await requireAdmin();

  const input = await parseForm(serviceFormSchema, formData);
  const settings = await getSiteSettings();
  const slug = await generateUniqueServiceSlug(prisma, {
    name: input.name,
    slug: input.slug || "",
    siteId: settings.siteId
  });

  await prisma.service.create({
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
      isActive: input.isActive
    }
  });

  refreshScheduling();
  redirect("/admin/modules/scheduling?saved=service");
}

export async function toggleServiceAction(formData: FormData) {
  await requireAdmin();

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
  await requireAdmin();
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
      isActive: input.isActive
    }
  });

  refreshScheduling();
  redirect("/admin/modules/scheduling?saved=service");
}

export async function createAvailabilityAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(availabilityFormSchema, formData);
  const settings = await getSiteSettings();

  await prisma.availabilityRule.create({
    data: {
      siteId: settings.siteId,
      weekday: input.weekday,
      startMinutes: input.startTime,
      endMinutes: input.endTime
    }
  });

  refreshScheduling();
  redirect("/admin/modules/scheduling?saved=availability");
}

export async function deleteAvailabilityAction(formData: FormData) {
  await requireAdmin();
  const settings = await getSiteSettings();

  await prisma.availabilityRule.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}

export async function createBlockoutAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(blockoutFormSchema, formData);
  const settings = await getSiteSettings();
  const startsAt = parseZonedDateTimeInput(input.startsAt, settings.timezone);
  const endsAt = parseZonedDateTimeInput(input.endsAt, settings.timezone);

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    redirect("/admin/modules/scheduling?error=blockout");
  }

  await prisma.blockedTime.create({
    data: {
      siteId: settings.siteId,
      startsAt,
      endsAt,
      reason: input.reason
    }
  });

  refreshScheduling();
  redirect("/admin/modules/scheduling?saved=blockout");
}

export async function deleteBlockoutAction(formData: FormData) {
  await requireAdmin();
  const settings = await getSiteSettings();

  await prisma.blockedTime.deleteMany({
    where: { id: String(formData.get("id") || ""), siteId: settings.siteId }
  });

  refreshScheduling();
}
