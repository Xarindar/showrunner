"use server";

import { AnalyticsEventType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { enumLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

const maxIntCents = 2_147_483_647;
const trimmed = z.string().transform((value) => value.trim());
const requiredText = trimmed.pipe(z.string().min(1));
const optionalStoredText = trimmed.transform((value) => value || "");
const optionalEmail = trimmed
  .refine((value) => value === "" || z.email().safeParse(value).success, "Use a valid email address.")
  .transform((value) => (value ? value.toLowerCase() : ""));
const moneyPattern = /^\d+(\.\d{1,2})?$/;
const optionalMoneyCents = trimmed
  .refine((value) => value === "" || moneyPattern.test(value), "Use dollars and cents, such as 25 or 25.00.")
  .transform((value) => (value === "" ? undefined : Math.round(Number(value) * 100)))
  .refine((value) => value === undefined || value <= maxIntCents, "Use an amount below $21,474,836.47.");
const currencyCode = trimmed
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/))
  .catch("USD");
const positiveInt = trimmed
  .refine((value) => /^\d+$/.test(value), "Use a whole number.")
  .transform((value) => Number(value))
  .pipe(z.number().int().min(1));
const optionalDateTime = trimmed.transform((value, context) => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: "custom", message: "Use a valid date and time." });
    return z.NEVER;
  }

  return date;
});

const eventSchema = z
  .object({
    eventType: z.enum(AnalyticsEventType).catch(AnalyticsEventType.CUSTOM),
    eventName: optionalStoredText,
    source: optionalStoredText,
    medium: optionalStoredText,
    campaign: optionalStoredText,
    landingPage: optionalStoredText,
    referrer: optionalStoredText,
    pathname: optionalStoredText,
    sessionId: optionalStoredText,
    visitorId: optionalStoredText,
    clientEmail: optionalEmail,
    relatedType: optionalStoredText,
    relatedId: optionalStoredText,
    value: optionalMoneyCents,
    currency: currencyCode,
    occurredAt: optionalDateTime,
    metadataKey: optionalStoredText,
    metadataValue: optionalStoredText
  })
  .transform((value) => ({
    ...value,
    eventName: value.eventName || enumLabel(value.eventType),
    metadata: value.metadataKey ? { [value.metadataKey]: value.metadataValue } : {}
  }));

const goalSchema = z
  .object({
    key: optionalStoredText,
    name: requiredText,
    eventType: z.enum(AnalyticsEventType).catch(AnalyticsEventType.CUSTOM),
    eventName: optionalStoredText,
    targetCount: positiveInt,
    targetValue: optionalMoneyCents,
    currency: currencyCode,
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    key: slugify(value.key || value.name) || "goal",
    eventName: value.eventName || enumLabel(value.eventType),
    isActive: value.isActive === "on"
  }));

const goalStatusSchema = z.object({
  id: requiredText,
  isActive: z.enum(["true", "false"]).transform((value) => value === "true")
});

function refreshAnalytics() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/analytics");
}

export async function recordAnalyticsEventAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(eventSchema, formData, "/admin/modules/analytics");

  await prisma.analyticsEvent.create({
    data: {
      eventType: input.eventType,
      eventName: input.eventName,
      source: input.source,
      medium: input.medium,
      campaign: input.campaign,
      landingPage: input.landingPage,
      referrer: input.referrer,
      pathname: input.pathname,
      sessionId: input.sessionId,
      visitorId: input.visitorId,
      clientEmail: input.clientEmail,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      valueCents: input.value,
      currency: input.currency,
      metadata: input.metadata,
      occurredAt: input.occurredAt
    }
  });

  refreshAnalytics();
  redirect("/admin/modules/analytics?saved=event");
}

export async function createAnalyticsGoalAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(goalSchema, formData, "/admin/modules/analytics");

  try {
    await prisma.analyticsGoal.create({
      data: {
        key: input.key,
        name: input.name,
        eventType: input.eventType,
        eventName: input.eventName,
        targetCount: input.targetCount,
        targetValueCents: input.targetValue,
        currency: input.currency,
        isActive: input.isActive
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/analytics?error=${encodeURIComponent(`Goal key ${input.key} already exists.`)}`);
    }

    throw error;
  }

  refreshAnalytics();
  redirect("/admin/modules/analytics?saved=goal");
}

export async function updateAnalyticsGoalStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(goalStatusSchema, formData, "/admin/modules/analytics");

  await prisma.analyticsGoal.update({
    where: { id: input.id },
    data: { isActive: input.isActive }
  });

  refreshAnalytics();
}
