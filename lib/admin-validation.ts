import "server-only";

import { BookingStatus, CouponType, MediaDriver, ProductStatus, ProductType } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { timeToMinutes } from "@/lib/format";

export const maxIntCents = 2_147_483_647;
export const trimmed = z.string().transform((value) => value.trim());
export const requiredText = trimmed.pipe(z.string().min(1));
export const optionalText = trimmed.transform((value) => value || undefined);
export const optionalStoredText = trimmed.transform((value) => value || "");
export const optionalId = trimmed.transform((value) => value || undefined);
export const optionalEmail = trimmed
  .refine((value) => value === "" || z.email().safeParse(value).success, "Use a valid email address.")
  .transform((value) => (value ? value.toLowerCase() : undefined));
export const optionalEmailStored = trimmed
  .refine((value) => value === "" || z.email().safeParse(value).success, "Use a valid email address.")
  .transform((value) => (value ? value.toLowerCase() : ""));
export const id = requiredText;
export const nonNegativeInt = z.coerce.number().int().min(0);
export const optionalNonNegativeInt = trimmed
  .refine((value) => value === "" || /^\d+$/.test(value), "Use a whole number.")
  .transform((value) => (value === "" ? undefined : Number(value)));
export const moneyPattern = /^\d+(\.\d{1,2})?$/;
export const moneyCents = trimmed
  .refine((value) => moneyPattern.test(value), "Use dollars and cents, such as 25 or 25.00.")
  .transform((value) => Math.round(Number(value) * 100))
  .refine((value) => value <= maxIntCents, "Use an amount below $21,474,836.47.");
export const optionalMoneyCents = trimmed
  .refine((value) => value === "" || moneyPattern.test(value), "Use dollars and cents, such as 25 or 25.00.")
  .transform((value) => (value === "" ? undefined : Math.round(Number(value) * 100)))
  .refine((value) => value === undefined || value <= maxIntCents, "Use an amount below $21,474,836.47.");
export const zeroableMoneyCents = trimmed
  .refine((value) => value === "" || moneyPattern.test(value), "Use dollars and cents, such as 25 or 25.00.")
  .transform((value) => (value === "" ? 0 : Math.round(Number(value) * 100)))
  .refine((value) => value <= maxIntCents, "Use an amount below $21,474,836.47.");
export const currencyCode = trimmed
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/));

function isPrivateUrlHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "metadata.google.internal" || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;

  const private172 = /^172\.(\d{1,2})\./.exec(host);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function safeExternalHttpsUrlValue(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isPrivateUrlHostname(url.hostname);
  } catch {
    return false;
  }
}

export const safeExternalHttpsUrl = requiredText.refine(
  safeExternalHttpsUrlValue,
  "Use an https URL on a public host."
);
export const optionalSafeExternalHttpsUrl = trimmed
  .refine((value) => value === "" || safeExternalHttpsUrlValue(value), "Use an https URL on a public host.")
  .transform((value) => value || undefined);

export function csvList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function redirectWithValidationError(message: string, fallbackPath: string): Promise<never> {
  const headerStore = await headers();
  const referer = headerStore.get("referer");
  const target = new URL(referer || fallbackPath, "http://localhost");
  target.searchParams.delete("saved");
  target.searchParams.set("error", message);

  redirect(`${target.pathname}${target.search}`);
}

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .transform((value, context) => {
    const minutes = timeToMinutes(value);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
      context.addIssue({ code: "custom", message: "Use a valid time." });
      return z.NEVER;
    }

    return minutes;
  });

export const serviceFormSchema = z
  .object({
    name: requiredText,
    slug: optionalText,
    description: optionalStoredText,
    durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
    location: optionalStoredText,
    bufferBeforeMinutes: nonNegativeInt.max(24 * 60),
    bufferAfterMinutes: nonNegativeInt.max(24 * 60),
    minimumNoticeHours: nonNegativeInt.max(24 * 365),
    maxAdvanceDays: z.coerce.number().int().min(1).max(3650),
    slotIntervalMinutes: z.coerce.number().int().min(1).max(24 * 60),
    intakePrompt: optionalStoredText,
    policyText: optionalStoredText,
    requirePolicy: z.literal("on").optional(),
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    requirePolicy: Boolean(value.requirePolicy && value.policyText.trim()),
    isActive: value.isActive === "on"
  }));

export const serviceUpdateFormSchema = serviceFormSchema.and(z.object({ id }));

export const availabilityFormSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "Availability must end after it starts.",
    path: ["endTime"]
  });

export const blockoutFormSchema = z
  .object({
    startsAt: requiredText,
    endsAt: requiredText,
    reason: optionalStoredText
  });

export const bookingStatusFormSchema = z.object({
  id,
  status: z.enum(BookingStatus)
});

export const bookingDetailFormSchema = z.object({
  id,
  adminNotes: optionalStoredText,
  cancellationReason: optionalStoredText
});

export const clientFormSchema = z.object({
  name: requiredText,
  email: z.email().transform((value) => value.trim().toLowerCase()),
  phone: optionalStoredText,
  privateNotes: optionalStoredText
});

export const clientUpdateFormSchema = clientFormSchema.extend({
  id,
  status: z.enum(["active", "lead", "vip", "inactive"]).catch("active")
});

export const clientNoteFormSchema = z.object({
  clientId: id,
  content: requiredText
});

export const settingsFormSchema = z.object({
  businessName: requiredText,
  contactEmail: z.email().transform((value) => value.trim().toLowerCase()),
  timezone: requiredText.refine((value) => Intl.supportedValuesOf("timeZone").includes(value), "Use a valid timezone."),
  themePreset: optionalStoredText,
  themePrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch("#116466"),
  mediaDriver: z.enum(MediaDriver).catch(MediaDriver.REPO)
});

export const productFormSchema = z
  .object({
    name: requiredText,
    slug: optionalText,
    summary: optionalStoredText,
    description: optionalStoredText,
    type: z.enum(ProductType).catch(ProductType.PHYSICAL),
    status: z.enum(ProductStatus).catch(ProductStatus.DRAFT),
    basePrice: moneyCents,
    compareAtPrice: optionalMoneyCents,
    currency: currencyCode.catch("USD"),
    sku: optionalStoredText,
    imageUrl: optionalStoredText,
    tags: optionalStoredText,
    trackInventory: z.literal("on").optional(),
    inventoryQuantity: optionalNonNegativeInt
  })
  .transform((value) => ({
    ...value,
    tags: csvList(value.tags),
    trackInventory: value.trackInventory === "on",
    inventoryQuantity: value.trackInventory === "on" ? value.inventoryQuantity ?? 0 : undefined
  }));

export const productUpdateFormSchema = productFormSchema.and(z.object({ id }));

export const productStatusFormSchema = z.object({
  id,
  status: z.enum(ProductStatus)
});

export const productVariantFormSchema = z
  .object({
    productId: id,
    name: requiredText,
    sku: optionalStoredText,
    optionName: optionalStoredText,
    optionValue: optionalStoredText,
    price: optionalMoneyCents,
    compareAtPrice: optionalMoneyCents,
    trackInventory: z.literal("on").optional(),
    inventoryQuantity: optionalNonNegativeInt,
    isDefault: z.literal("on").optional(),
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    trackInventory: value.trackInventory === "on",
    inventoryQuantity: value.trackInventory === "on" ? value.inventoryQuantity ?? 0 : undefined,
    isDefault: value.isDefault === "on",
    isActive: value.isActive === "on"
  }));

export const collectionFormSchema = z.object({
  name: requiredText,
  slug: optionalText,
  description: optionalStoredText,
  status: z.enum(ProductStatus).catch(ProductStatus.DRAFT),
  isFeatured: z.literal("on").optional(),
  sortOrder: z.coerce.number().int().default(0)
});

export const collectionProductFormSchema = z.object({
  collectionId: id,
  productId: id
});

export const couponFormSchema = z
  .object({
    code: requiredText.transform((value) => value.toUpperCase()),
    type: z.enum(CouponType).catch(CouponType.FIXED),
    amount: optionalMoneyCents,
    percentOff: optionalNonNegativeInt,
    maxRedemptions: optionalNonNegativeInt,
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    amount: value.type === CouponType.FIXED ? value.amount ?? 0 : undefined,
    percentOff: value.type === CouponType.PERCENT ? Math.min(value.percentOff ?? 0, 100) : undefined,
    isActive: value.isActive === "on"
  }))
  .refine((value) => value.type !== CouponType.FIXED || (value.amount || 0) > 0, {
    message: "Fixed coupons need an amount greater than zero.",
    path: ["amount"]
  })
  .refine((value) => value.type !== CouponType.PERCENT || (value.percentOff || 0) > 0, {
    message: "Percent coupons need a percent greater than zero.",
    path: ["percentOff"]
  });

export async function parseForm<T>(schema: z.ZodType<T>, formData: FormData, fallbackPath = "/admin") {
  const parsed = schema.safeParse(formObject(formData));

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    await redirectWithValidationError(`${field}${issue?.message || "Check the form and try again."}`, fallbackPath);
    throw new Error("Unreachable after validation redirect.");
  }

  return parsed.data;
}
