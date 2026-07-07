import "server-only";

import { revalidatePath } from "next/cache";
import { FormAttachmentTargetType, MediaVariantType } from "@prisma/client";
import { z } from "zod";
import { bookingSelfServicePath } from "@/lib/bookings/self-service";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { publicAppBaseUrl } from "@/lib/env";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { getPublicFormAttachments, publicFormAttachmentHref } from "@/lib/forms/attachments";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { icsCalendarAdapter } from "@/lib/scheduling/calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import type { Slot, SlotDiagnostics } from "@/lib/scheduling/types";
import { getSiteSettingsForSite } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { parseZonedDateKey } from "@/lib/timezone";

const hiddenHoneypotField = "companyWebsite";

const bookingSchema = z.object({
  serviceId: z.string().min(1, "Choose a service."),
  staffId: z.string().trim().optional(),
  resourceIds: z.array(z.string().trim().min(1)).optional(),
  startsAt: z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid appointment time."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  intakeResponse: z.string().trim().optional(),
  policyAccepted: z.boolean().optional(),
  [hiddenHoneypotField]: z.string().trim().optional()
});

type PublicService = Awaited<ReturnType<typeof nativeSchedulingAdapter.listActiveServices>>[number];
type PublicServiceCategory = Awaited<ReturnType<typeof listPublicSchedulingCategoryRows>>[number];

function cleanOptionalString(value: string | null) {
  const text = value?.trim();
  return text || null;
}

function categoryKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function publicAssetUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return new URL(value, publicAppBaseUrl()).toString();
  return value;
}

function publicServiceImageUrl(service: PublicService) {
  if (service.mediaAsset) return publicAssetUrl(mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD));
  return publicAssetUrl(cleanOptionalString(service.imageUrl));
}

function publicCategoryImageUrl(category: PublicServiceCategory) {
  if (category.mediaAsset) return publicAssetUrl(mediaAssetDisplayUrl(category.mediaAsset, MediaVariantType.CARD));
  return publicAssetUrl(cleanOptionalString(category.imageUrl));
}

const expectedBookingErrorStatuses = new Map<string, number>([
  ["That service is not available.", 404],
  ["Choose an available staff member for this service.", 400],
  ["Choose an available resource-backed slot for this service.", 400],
  ["Choose a valid appointment time.", 400],
  ["That service is not configured for online booking.", 400],
  ["Please accept the appointment policy before booking.", 400],
  ["That time is no longer available. Please choose another time.", 409],
  ["That time was just booked or blocked. Please choose another time.", 409]
]);

function mapPublicBookingError(error: unknown): never {
  if (error instanceof EmbedRequestError) throw error;
  if (error instanceof Error) {
    const status = expectedBookingErrorStatuses.get(error.message);
    if (status) throw new EmbedRequestError(error.message, status);
  }
  throw error;
}

export function hasPublicSchedulingBookingHoneypot(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>)[hiddenHoneypotField];
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function serializePublicSlot(slot: Slot) {
  return {
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    label: slot.label,
    resourceIds: slot.resourceIds,
    resourceNames: slot.resourceNames,
    staffId: slot.staffId || null,
    staffName: slot.staffName || null
  };
}

export function serializePublicSlotDiagnostics(diagnostics: SlotDiagnostics) {
  const slots = diagnostics.slots.filter((slot) => slot.available).map(serializePublicSlot);
  return {
    serviceId: diagnostics.serviceId,
    serviceName: diagnostics.serviceName,
    resourceIds: diagnostics.resourceIds,
    resourceNames: diagnostics.resourceNames,
    staffId: diagnostics.staffId || null,
    staffName: diagnostics.staffName || null,
    timezone: diagnostics.timezone,
    slotCount: slots.length,
    availableCount: slots.length,
    slots
  };
}

export function serializePublicService(service: PublicService, categoryRecord?: PublicServiceCategory) {
  const category = cleanOptionalString(service.category);
  const fallbackCategoryId = category ? slugify(category) || "general" : "general";
  return {
    id: service.id,
    slug: service.slug,
    categoryId: categoryRecord?.slug || fallbackCategoryId,
    categoryName: category,
    name: service.name,
    description: cleanOptionalString(service.description),
    imageUrl: publicServiceImageUrl(service) || (categoryRecord ? publicCategoryImageUrl(categoryRecord) : null),
    durationMinutes: service.durationMinutes,
    location: cleanOptionalString(service.location),
    minimumNoticeHours: service.minimumNoticeHours,
    maxAdvanceDays: service.maxAdvanceDays,
    slotIntervalMinutes: service.slotIntervalMinutes,
    intakePrompt: cleanOptionalString(service.intakePrompt),
    policyText: cleanOptionalString(service.policyText),
    requirePolicy: service.requirePolicy,
    requestOnly: service.requestOnly,
    waitlistEnabled: service.waitlistEnabled,
    staff: service.staffAssignments.map((assignment) => ({
      id: assignment.staff.id,
      name: assignment.staff.name,
      title: assignment.staff.title || null
    })),
    resources: service.resourceAssignments.map((assignment) => ({
      id: assignment.resource.id,
      name: assignment.resource.name,
      type: assignment.resource.type,
      location: assignment.resource.location || null
    }))
  };
}

function serializePublicCategory(category: PublicServiceCategory) {
  return {
    id: category.slug,
    slug: category.slug,
    name: category.name,
    description: cleanOptionalString(category.description),
    imageUrl: publicCategoryImageUrl(category),
    sort: category.sortOrder
  };
}

function serializeDerivedCategory(input: { id: string; name: string; sort: number }) {
  return {
    id: input.id,
    slug: input.id,
    name: input.name,
    description: null,
    imageUrl: null,
    sort: input.sort
  };
}

async function listPublicSchedulingCategoryRows(siteId: string) {
  return prisma.serviceCategory.findMany({
    where: { siteId },
    include: { mediaAsset: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function listPublicSchedulingCatalog(siteId: string) {
  const [services, serviceCategories] = await Promise.all([
    nativeSchedulingAdapter.listActiveServices({ siteId }),
    listPublicSchedulingCategoryRows(siteId)
  ]);
  const categoriesByName = new Map(serviceCategories.map((category) => [categoryKey(category.name), category]));
  const serializedServices = services.map((service) => serializePublicService(service, categoriesByName.get(categoryKey(service.category))));
  const usedCategoryIds = new Set(serializedServices.map((service) => service.categoryId));
  const categoriesById = new Map(
    serviceCategories
      .filter((category) => usedCategoryIds.has(category.slug))
      .map((category) => [category.slug, serializePublicCategory(category)])
  );

  serializedServices.forEach((service, index) => {
    if (categoriesById.has(service.categoryId)) return;
    categoriesById.set(
      service.categoryId,
      serializeDerivedCategory({
        id: service.categoryId,
        name: service.categoryName || "Services",
        sort: 10_000 + index
      })
    );
  });

  const categories = Array.from(categoriesById.values()).sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name));

  return {
    categories,
    services: serializedServices
  };
}

export async function listPublicSchedulingServices(siteId: string) {
  const catalog = await listPublicSchedulingCatalog(siteId);
  return catalog.services;
}

export async function getPublicSchedulingDiagnostics(input: {
  date: string | null;
  resourceId?: string;
  serviceId: string | null;
  siteId: string;
  staffId?: string;
}) {
  if (!input.serviceId) throw new EmbedRequestError("serviceId is required.", 400);
  if (!input.date) throw new EmbedRequestError("date is required.", 400);

  const settings = await getSiteSettingsForSite(input.siteId);
  const day = parseZonedDateKey(input.date, settings.timezone);
  if (!day) throw new EmbedRequestError("Choose a valid date in YYYY-MM-DD format.", 400);

  const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(input.serviceId, day, {
    resourceId: input.resourceId,
    siteId: input.siteId,
    staffId: input.staffId
  });
  if (!diagnostics) throw new EmbedRequestError("That service is not available.", 404);

  return serializePublicSlotDiagnostics(diagnostics);
}

export async function createPublicSchedulingBooking(input: {
  body: unknown;
  searchParams?: Record<string, string | undefined>;
  siteId: string;
}) {
  const parsed = bookingSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new EmbedRequestError(parsed.error.issues[0]?.message || "Check the booking request.", 400);
  }

  if (hasPublicSchedulingBookingHoneypot(parsed.data)) {
    return { ok: true, booking: null };
  }

  let booking: Awaited<ReturnType<typeof nativeSchedulingAdapter.createBooking>>;
  try {
    booking = await nativeSchedulingAdapter.createBooking({
      siteId: input.siteId,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      resourceIds: parsed.data.resourceIds,
      startsAt: new Date(parsed.data.startsAt),
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      notes: parsed.data.notes,
      intakeResponse: parsed.data.intakeResponse,
      policyAccepted: parsed.data.policyAccepted === true
    });
  } catch (error) {
    mapPublicBookingError(error);
  }

  await emitModuleEvent("booking.created", {
    ...(await requestAttribution(input.searchParams, "/api/public/v1/bookings")),
    actorEmail: booking.customerEmail,
    metadata: {
      serviceId: booking.serviceId,
      resourceIds: parsed.data.resourceIds,
      staffId: booking.staffId,
      startsAt: booking.startsAt.toISOString(),
      status: booking.status
    },
    relatedId: booking.id,
    relatedType: "booking",
    siteId: input.siteId
  });

  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/admin/modules/services");
  revalidatePath("/admin/modules/scheduling");
  revalidatePath("/book");

  const formAttachments = await getPublicFormAttachments({
    siteId: booking.siteId,
    targetId: booking.id,
    targetType: FormAttachmentTargetType.BOOKING
  });

  return {
    ok: true,
    booking: {
      id: booking.id,
      status: booking.status,
      serviceId: booking.serviceId,
      staffId: booking.staffId || null,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      calendarUrl: icsCalendarAdapter.bookingPath({ bookingId: booking.id, siteId: booking.siteId }),
      manageUrl: bookingSelfServicePath({
        bookingId: booking.id,
        customerEmail: booking.customerEmail,
        siteId: booking.siteId
      }),
      formLinks: formAttachments.map((attachment) => ({
        description: attachment.form.description,
        href: publicFormAttachmentHref({
          formSlug: attachment.form.slug,
          targetId: attachment.targetId,
          targetType: attachment.targetType
        }),
        isRequired: attachment.isRequired,
        name: attachment.form.name
      }))
    }
  };
}
