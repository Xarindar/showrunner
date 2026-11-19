import "server-only";
import { createHash } from "node:crypto";
import { bookingPaymentProvider, onlineBookingUnavailable, releaseUnpaidBookingHolds, startBookingCheckout } from "@/lib/bookings/payment";
import { getPackageFields } from "@/lib/scheduling/package-fields-store";
import { listBookingDocuments } from "@/lib/scheduling/booking-document-store";
import { resolveBookingRequirements } from "@/lib/scheduling/booking-documents";
import { BookingRuleAnswerError, intakeAnswersSchema, readBookingRules } from "@/lib/scheduling/booking-rules";
import { packagesInDisplayOrder, readSessionOffering, selectSessionPackage, suggestedSessionAddOns, sessionAddOnPriceCents, priceSessionOffering } from "@/lib/scheduling/session-offering";
import { addOnQuantitiesSchema } from "@/lib/scheduling/session-input";
import { servicePriceCents } from "@/lib/scheduling/pricing";
import { readImageFraming } from "@/modules/content/studio/image-framing";

import { revalidatePath } from "next/cache";
import { MediaVariantType } from "@prisma/client";
import { z } from "zod";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { publicAppBaseUrl } from "@/lib/env";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { icsCalendarAdapter } from "@/lib/scheduling/calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import type { Slot, SlotDiagnostics } from "@/lib/scheduling/types";
import { getSiteSettingsForSite } from "@/lib/site";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { slugify } from "@/lib/slug";
import { parseZonedDateKey } from "@/lib/timezone";

const hiddenHoneypotField = "companyWebsite";

const bookingSchema = z.object({
  submissionKey: z.uuid().optional(),
  checkoutSupported: z.literal(true).optional(),
  serviceId: z.string().min(1, "Choose a service."),
  tierId: z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  addOnIds: z.array(z.string().min(1).max(100)).max(50).optional(),
  addOnQuantities: addOnQuantitiesSchema.optional(),
  serviceRevision: z.string().max(100).optional(),
  acceptedTerms: z.string().max(100000).optional(),
  staffId: z.string().trim().optional(),
  resourceIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  startsAt: z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid appointment time."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string({ error: "Add your phone number." }).trim().min(1, "Add your phone number."),
  customerCompany: z.string().trim().max(200, "Company must be 200 characters or fewer.").optional(),
  notes: z.string().trim().max(5000).optional(),
  intakeResponse: z.string().trim().max(5000).optional(),
  intakeAnswers: intakeAnswersSchema.optional(),
  policyAccepted: z.boolean().optional(),
  photoMarketingConsent: z.boolean().optional(),
  sessionAddress: z.object({
    address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(60),
    zip: z.string().trim().min(1).max(20)
  }).optional(),
  bookingRequirementsRevision: z.string().max(500).optional(),
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
  if (service.mediaAsset) return publicAssetUrl(mediaAssetDisplayUrl(service.mediaAsset, service.imageFraming ? MediaVariantType.FULL : MediaVariantType.CARD));
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
  ["Please agree to the Booking Terms & Conditions before booking.", 400],
  ["That time is no longer available. Please choose another time.", 409],
  ["That time was just booked or blocked. Please choose another time.", 409]
]);

function mapPublicBookingError(error: unknown): never {
  if (error instanceof BookingRuleAnswerError) throw new EmbedRequestError(error.message, 400);
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
  const slots = diagnostics.slots.filter((slot) => slot.available).map(slot =>
    serializePublicSlot(slot.sessionEndsAt ? { ...slot, endsAt: slot.sessionEndsAt } : slot));
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
  const offering = readSessionOffering(service.sessionOffering);
  const packages = offering ? packagesInDisplayOrder(offering.tiers, offering.packageOrder, tier => tier.priceCents ?? Infinity).map(tier => {
    const snapshot = selectSessionPackage(offering, tier.id)!;
    return { id: tier.id, name: tier.name, durationMinutes: tier.durationMinutes, unlimitedDuration: tier.unlimitedDuration, priceCents: snapshot.priceCents, pricingType: tier.pricingType, hourlyRateCents: tier.hourlyRate?.amountCents,
      deliverables: snapshot.deliverables, coverage: snapshot.coverage,
      addOns: suggestedSessionAddOns(offering, tier.id).map(item => ({ id: item.id, name: item.name,
        priceCents: sessionAddOnPriceCents(item, tier.durationMinutes), pricingType: item.pricingType, hourlyRateCents: item.hourlyRate?.amountCents, deliverables: item.deliverables })) };
  }) : [];
  const category = cleanOptionalString(service.category);
  const fallbackCategoryId = category ? slugify(category) || "general" : "general";
  return {
    id: service.id,
    slug: service.slug,
    packages,
    serviceRevision: service.updatedAt?.toISOString(),
    categoryId: categoryRecord?.slug || fallbackCategoryId,
    categoryName: category,
    name: service.name,
    description: cleanOptionalString(service.description),
    ...readImageFraming(service.imageFraming),
    imageUrl: publicServiceImageUrl(service) || (categoryRecord ? publicCategoryImageUrl(categoryRecord) : null),
    media: {
      square: publicServiceImageUrl(service) ? { url: publicServiceImageUrl(service), aspectRatio: 1, ...readImageFraming(service.imageFraming) } : null,
      rectangular: service.rectangularMediaAsset && !service.rectangularMediaAsset.isPrivate && !service.rectangularMediaAsset.deletedAt
        ? { url: publicAssetUrl(mediaAssetDisplayUrl(service.rectangularMediaAsset, MediaVariantType.FULL)), aspectRatio: 4 / 3, ...readImageFraming(service.rectangularImageFraming) } : null
    },
    durationMinutes: service.durationMinutes,
    priceCents: servicePriceCents(service),
    pricingType: service.pricingType,
    hourlyRateCents: service.pricingType === "HOURLY" ? service.hourlyRate?.amountCents ?? null : null,
    currency: "USD",
    location: cleanOptionalString(service.location),
    minimumNoticeHours: service.minimumNoticeHours,
    maxAdvanceDays: service.maxAdvanceDays,
    slotIntervalMinutes: service.slotIntervalMinutes,
    intakePrompt: cleanOptionalString(service.intakePrompt),
    bookingRules: service.bookingRules == null ? null : readBookingRules(service.bookingRules),
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
  const [services, serviceCategories, documents, packageFields, hourlyRates, paymentProvider] = await Promise.all([
    nativeSchedulingAdapter.listActiveServices({ siteId }),
    listPublicSchedulingCategoryRows(siteId),
    listBookingDocuments(siteId),
    getPackageFields(siteId),
    prisma.hourlyRate.findMany({ where: { siteId }, select: { id: true, name: true, amountCents: true } }),
    bookingPaymentProvider(siteId)
  ]);
  const categoriesByName = new Map(serviceCategories.map((category) => [categoryKey(category.name), category]));
  const serializedServices = services.map(service=>{
    const offering = readSessionOffering(service.sessionOffering);
    if (offering) service = { ...service, sessionOffering: priceSessionOffering(offering, hourlyRates, { pricingType: service.pricingType === "HOURLY" ? "HOURLY" : "FLAT_RATE", hourlyRateId: service.hourlyRateId ?? "" }) };
    const requirements=resolveBookingRequirements(service,documents);
    return {...serializePublicService(service,categoriesByName.get(categoryKey(service.category))),bookingRules:requirements.bookingRules,policyText:requirements.policyText || null,requirePolicy:requirements.requirePolicy,bookingRequirementsRevision:requirements.revision,
      bookingFormTitle:requirements.documents.find(document=>document.kind==="INTAKE")?.name || "Session details",
      bookingTermsTitle:requirements.documents.find(document=>document.kind==="TERMS")?.name || "Booking terms"};
  });
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
    services: serializedServices,
    packageFields,
    onlineBookingEnabled: Boolean(paymentProvider)
  };
}

export async function listPublicSchedulingServices(siteId: string) {
  const catalog = await listPublicSchedulingCatalog(siteId);
  return catalog.services;
}

type PublicAvailabilityInput = {
  date: string | null;
  tierId?: string;
  durationMinutes?: number;
  resourceId?: string;
  serviceId: string | null;
  siteId: string;
  staffId?: string;
};

async function preparePublicAvailability(siteId: string) {
  if (!await bookingPaymentProvider(siteId)) throw new EmbedRequestError(onlineBookingUnavailable, 503);
  await releaseUnpaidBookingHolds(siteId);
}

export async function getPublicSchedulingDiagnostics(input: PublicAvailabilityInput) {
  await preparePublicAvailability(input.siteId);
  return readPublicAvailability(input);
}

async function readPublicAvailability(input: PublicAvailabilityInput) {
  if (!input.serviceId) throw new EmbedRequestError("serviceId is required.", 400);
  if (!input.date) throw new EmbedRequestError("date is required.", 400);

  const settings = await getSiteSettingsForSite(input.siteId);
  const day = parseZonedDateKey(input.date, settings.timezone);
  if (!day) throw new EmbedRequestError("Choose a valid date in YYYY-MM-DD format.", 400);

  const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(input.serviceId, day, {
    tierId: input.tierId,
    requireDuration: true,
    durationMinutes: input.durationMinutes,
    resourceId: input.resourceId,
    siteId: input.siteId,
    staffId: input.staffId
  }).catch(mapPublicBookingError);
  if (!diagnostics) throw new EmbedRequestError("That service is not available.", 404);

  return serializePublicSlotDiagnostics(diagnostics);
}

export async function getPublicNextAvailability(input: PublicAvailabilityInput, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new EmbedRequestError("Search between 1 and 14 days at a time.", 400);
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new EmbedRequestError("Choose a valid date in YYYY-MM-DD format.", 400);
  const start = new Date(`${input.date}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== input.date) throw new EmbedRequestError("Choose a valid date in YYYY-MM-DD format.", 400);
  await preparePublicAvailability(input.siteId);
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    const diagnostics = await readPublicAvailability({ ...input, date });
    if (diagnostics.slots.length) return { date, slots: diagnostics.slots };
  }
  return null;
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

  const { submissionKey, ...submittedFields } = parsed.data;
  const submission = submissionKey ? {
    keyHash: createHash("sha256").update(submissionKey).digest("hex"),
    fingerprint: createHash("sha256").update(JSON.stringify(submittedFields)).digest("hex")
  } : undefined;
  const recover = async () => {
    if (!submission) return null;
    const booking = await prisma.booking.findUnique({
      where: { siteId_publicSubmissionKeyHash: { siteId: input.siteId, publicSubmissionKeyHash: submission.keyHash } },
      include: { billingDocument: { select: { bookingApprovalRequired: true, publicAccessToken: true } } }
    });
    if (!booking) return null;
    if (booking.publicSubmissionFingerprint !== submission.fingerprint) {
      throw new EmbedRequestError("This submission already belongs to a different booking request.", 409);
    }
    return {
      ...booking,
      paymentToken: booking.billingDocument?.bookingApprovalRequired ? undefined : booking.billingDocument?.publicAccessToken || undefined,
      paymentAfterApproval: booking.billingDocument?.bookingApprovalRequired ?? false
    };
  };
  const existing = await recover();
  if (existing) return publicBookingResponse(existing);

  if (!await bookingPaymentProvider(input.siteId)) throw new EmbedRequestError(onlineBookingUnavailable, 503);

  await releaseUnpaidBookingHolds(input.siteId);
  let booking: Awaited<ReturnType<typeof nativeSchedulingAdapter.createBooking>>;
  try {
    booking = await nativeSchedulingAdapter.createBooking({
      siteId: input.siteId,
      onlinePayment: { checkoutSupported: parsed.data.checkoutSupported === true, submission },
      serviceId: parsed.data.serviceId,
      tierId: parsed.data.tierId,
      durationMinutes: parsed.data.durationMinutes,
      addOnIds: parsed.data.addOnIds,
      addOnQuantities: parsed.data.addOnQuantities,
      serviceRevision: parsed.data.serviceRevision,
      acceptedTerms: parsed.data.acceptedTerms,
      staffId: parsed.data.staffId,
      resourceIds: parsed.data.resourceIds,
      startsAt: new Date(parsed.data.startsAt),
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      customerCompany: parsed.data.customerCompany,
      notes: parsed.data.notes,
      intakeResponse: parsed.data.intakeResponse,
      intakeAnswers: parsed.data.intakeAnswers,
      bookingRequirementsRevision: parsed.data.bookingRequirementsRevision,
      policyAccepted: parsed.data.policyAccepted === true,
      photoMarketingConsent: parsed.data.photoMarketingConsent,
      sessionLocation: parsed.data.sessionAddress
        ? `${parsed.data.sessionAddress.address}, ${parsed.data.sessionAddress.city}, ${parsed.data.sessionAddress.state} ${parsed.data.sessionAddress.zip}`
        : undefined
    });
  } catch (error) {
    const committed = await recover();
    if (committed) return publicBookingResponse(committed);
    mapPublicBookingError(error);
  }

  if (booking.paymentToken) return publicBookingResponse(booking);

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

  return publicBookingResponse(booking);
}

async function publicBookingResponse(booking: Awaited<ReturnType<typeof nativeSchedulingAdapter.createBooking>>) {
  if (booking.paymentToken) return { ok: true, paymentUrl: await startBookingCheckout(booking.paymentToken) };
  if (booking.status !== "CONFIRMED" && booking.status !== "PENDING") {
    throw new EmbedRequestError("This booking request is closed. Contact us for help.", 409);
  }
  const calendarHost = booking.status !== "CONFIRMED" ? null : booking.siteId === DEFAULT_SITE_ID
    ? publicAppBaseUrl()
    : await prisma.siteDomain.findFirst({
      where: { siteId: booking.siteId, isPrimary: true },
      orderBy: { hostname: "asc" },
      select: { hostname: true }
    }).then((domain) => domain ? `https://${domain.hostname}` : null);
  const calendarUrl = calendarHost ? new URL(
    icsCalendarAdapter.bookingPath({ bookingId: booking.id, siteId: booking.siteId }), calendarHost
  ).href : null;

  return {
    ok: true,
    booking: {
      id: booking.id,
      status: booking.status,
      paymentAfterApproval: booking.paymentAfterApproval,
      serviceId: booking.serviceId,
      staffId: booking.staffId || null,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      calendarUrl,
      manageUrl: null,
      formLinks: []
    }
  };
}
