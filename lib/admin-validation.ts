import "server-only";

import { AdminRole, BookingStatus, BookingWaitlistStatus, ClientPipelineStage, CouponType, MediaDriver, ProductStatus, ProductType } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formDataObject } from "@/lib/form-data";
import { timeToMinutes } from "@/lib/format";
import { clientStatusValues, defaultClientStatus } from "@/lib/clients/status";
import { isSafeExternalHttpsUrl } from "@/lib/security/urls";
import { normalizeThemeColorValue } from "@/lib/theme/palette-url";

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
const optionalStoredDate = trimmed.transform((value, context) => {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: "custom", message: "Use a valid date." });
    return z.NEVER;
  }
  return date;
});
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

export const safeExternalHttpsUrl = requiredText.refine(
  isSafeExternalHttpsUrl,
  "Use an https URL on a public host."
);
export const optionalSafeExternalHttpsUrl = trimmed
  .refine((value) => value === "" || isSafeExternalHttpsUrl(value), "Use an https URL on a public host.")
  .transform((value) => value || undefined);

export function csvList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formObject(formData: FormData) {
  return formDataObject(formData);
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
    category: optionalStoredText,
    tags: optionalStoredText,
    bufferBeforeMinutes: nonNegativeInt.max(24 * 60),
    bufferAfterMinutes: nonNegativeInt.max(24 * 60),
    minimumNoticeHours: nonNegativeInt.max(24 * 365),
    maxAdvanceDays: z.coerce.number().int().min(1).max(3650),
    slotIntervalMinutes: z.coerce.number().int().min(1).max(24 * 60),
    intakePrompt: optionalStoredText,
    policyText: optionalStoredText,
    requirePolicy: z.literal("on").optional(),
    requestOnly: z.literal("on").optional(),
    waitlistEnabled: z.literal("on").optional(),
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    tags: csvList(value.tags),
    requirePolicy: Boolean(value.requirePolicy && value.policyText.trim()),
    requestOnly: value.requestOnly === "on",
    waitlistEnabled: value.waitlistEnabled === "on",
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

export const bookingRescheduleFormSchema = z.object({
  id,
  startsAt: requiredText
});

export const bookingWaitlistPromoteFormSchema = z.object({
  id,
  staffId: optionalId,
  startsAt: requiredText
});

export const bookingWaitlistStatusFormSchema = z.object({
  id,
  status: z.enum(BookingWaitlistStatus)
});

export const clientFormSchema = z.object({
  name: requiredText,
  email: z.email().transform((value) => value.trim().toLowerCase()),
  phone: optionalStoredText,
  status: z.enum(clientStatusValues).catch(defaultClientStatus),
  pipelineStage: z.enum(ClientPipelineStage).catch(ClientPipelineStage.INQUIRY),
  companyName: optionalStoredText,
  familyName: optionalStoredText,
  alternateEmails: trimmed
    .refine(
      (value) => value === "" || csvList(value).every((item) => z.email().safeParse(item).success),
      "Use valid alternate email addresses."
    )
    .transform((value) => csvList(value).map((item) => item.toLowerCase())),
  alternatePhones: trimmed.transform(csvList),
  addressLine1: optionalStoredText,
  addressLine2: optionalStoredText,
  city: optionalStoredText,
  region: optionalStoredText,
  postalCode: optionalStoredText,
  country: optionalStoredText,
  timezone: optionalStoredText,
  pronouns: optionalStoredText,
  photoUrl: optionalStoredText,
  birthday: optionalStoredDate,
  anniversary: optionalStoredDate,
  tags: trimmed.transform(csvList),
  preferences: optionalStoredText,
  emailOptIn: z.literal("on").optional(),
  smsOptIn: z.literal("on").optional(),
  photoUsageRelease: z.literal("on").optional(),
  policyAccepted: z.literal("on").optional(),
  dataExportRequested: z.literal("on").optional(),
  dataDeletionRequested: z.literal("on").optional(),
  privateNotes: optionalStoredText
});

export const clientUpdateFormSchema = clientFormSchema.extend({
  id
});

export const clientNoteFormSchema = z.object({
  clientId: id,
  content: requiredText
});

export const clientNoteDeleteFormSchema = z.object({
  id,
  clientId: id,
  confirmDelete: z.literal("on").optional()
});

export const clientFileFormSchema = z.object({
  clientId: id,
  title: requiredText,
  category: optionalStoredText,
  notes: optionalStoredText
});

export const clientFileDeleteFormSchema = z.object({
  id,
  clientId: id,
  confirmDelete: z.literal("on").optional()
});

export const clientSegmentFormSchema = z.object({
  name: requiredText,
  status: optionalStoredText,
  pipelineStage: optionalStoredText,
  tag: optionalStoredText,
  pastDue: z.literal("on").optional(),
  upcomingAppointment: z.literal("on").optional(),
  recentPurchaseDays: optionalNonNegativeInt,
  noRecentActivityDays: optionalNonNegativeInt
});

export const clientSegmentDeleteFormSchema = z.object({
  id,
  confirmDelete: z.literal("on").optional()
});

export const clientCsvImportFormSchema = z.object({
  file: z
    .custom<File>(
      (value) =>
        Boolean(value) &&
        typeof (value as File).text === "function" &&
        typeof (value as File).size === "number" &&
        (value as File).size > 0,
      "Choose a CSV file."
    )
    .refine((file) => file.size <= 1_000_000, "Use a CSV file under 1 MB.")
});

export const clientMergeFormSchema = z.object({
  survivorId: id,
  duplicateId: id,
  confirmMerge: z.literal("on").optional()
});

export const settingsFormSchema = z.object({
  businessName: requiredText,
  contactEmail: z.email().transform((value) => value.trim().toLowerCase()),
  timezone: requiredText.refine((value) => Intl.supportedValuesOf("timeZone").includes(value), "Use a valid timezone."),
  themePreset: optionalStoredText,
  themePrimary: trimmed.transform((value) => normalizeThemeColorValue(value)),
  mediaDriver: z.enum(MediaDriver).catch(MediaDriver.REPO),
  ga4MeasurementId: optionalStoredText,
  googleAdsTagId: optionalStoredText,
  metaPixelId: optionalStoredText,
  searchConsoleVerification: optionalStoredText,
  analyticsRetentionDays: z.coerce.number().int().min(30).max(3650).catch(365)
});

export const adminUserCreateFormSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12, "Use at least 12 characters."),
  role: z.enum(AdminRole).catch(AdminRole.STAFF)
});

export const adminUserRoleFormSchema = z.object({
  id,
  role: z.enum(AdminRole)
});

export const adminUserDeleteFormSchema = z.object({
  id,
  confirmDelete: z.literal("on").optional()
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
    imageUrl: optionalStoredText.optional().transform((value) => value || ""),
    seoTitle: optionalStoredText,
    seoDescription: optionalStoredText,
    vendor: optionalStoredText,
    externalReference: optionalStoredText,
    newCategoryName: optionalStoredText.optional().transform((value) => value || ""),
    newCategorySlug: optionalText.optional(),
    taxable: z.literal("on").optional(),
    requiresShipping: z.literal("on").optional(),
    weightGrams: optionalNonNegativeInt,
    tags: optionalStoredText,
    trackInventory: z.literal("on").optional(),
    inventoryQuantity: optionalNonNegativeInt
  })
  .transform((value) => ({
    ...value,
    taxable: value.taxable !== undefined,
    requiresShipping: value.requiresShipping === "on",
    tags: csvList(value.tags),
    trackInventory: value.trackInventory === "on",
    inventoryQuantity: value.trackInventory === "on" ? value.inventoryQuantity ?? 0 : undefined
  }));

export const productUpdateFormSchema = productFormSchema.and(z.object({ id }));

export const productQuickCreateFormSchema = z.object({
  name: requiredText,
  basePrice: optionalMoneyCents,
  type: z.enum(ProductType).catch(ProductType.PHYSICAL)
});

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
