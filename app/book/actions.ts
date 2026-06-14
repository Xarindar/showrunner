"use server";

import { revalidatePath } from "next/cache";
import { FormAttachmentTargetType } from "@prisma/client";
import { z } from "zod";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { bookingSelfServicePath } from "@/lib/bookings/self-service";
import { upsertPublicClient } from "@/lib/clients/public-client";
import { getPublicFormAttachments, publicFormAttachmentHref } from "@/lib/forms/attachments";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { icsCalendarAdapter } from "@/lib/scheduling/calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateKey } from "@/lib/timezone";

const hiddenHoneypotField = "companyWebsite";

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().trim().optional(),
  resourceIds: z.string().trim().optional(),
  startsAt: z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid appointment time."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  intakeResponse: z.string().trim().optional(),
  policyAccepted: z.string().optional()
});

const waitlistSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().trim().optional(),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid waitlist date."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  intakeResponse: z.string().trim().optional(),
  policyAccepted: z.string().optional()
});

export type BookingFormState = {
  calendarUrl?: string;
  formLinks?: Array<{
    description: string;
    href: string;
    isRequired: boolean;
    name: string;
  }>;
  manageUrl?: string;
  status?: string;
  ok?: boolean;
  error?: string;
};

export type WaitlistFormState = {
  ok?: boolean;
  error?: string;
};

export async function createPublicBookingAction(_state: BookingFormState, formData: FormData): Promise<BookingFormState> {
  if (String(formData.get(hiddenHoneypotField) || "").trim()) {
    return { ok: true };
  }

  const rateLimitMessage = await publicRateLimitMessage("booking_submission", { limit: 6, windowMinutes: 10 });
  if (rateLimitMessage) {
    return { error: rateLimitMessage };
  }

  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId") || undefined,
    resourceIds: formData.get("resourceIds") || undefined,
    startsAt: formData.get("startsAt"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    notes: formData.get("notes"),
    intakeResponse: formData.get("intakeResponse"),
    policyAccepted: formData.get("policyAccepted")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the booking form." };
  }

  try {
    const booking = await nativeSchedulingAdapter.createBooking({
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      resourceIds: parsed.data.resourceIds?.split(",").map((id) => id.trim()).filter(Boolean),
      startsAt: new Date(parsed.data.startsAt),
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      notes: parsed.data.notes,
      intakeResponse: parsed.data.intakeResponse,
      policyAccepted: parsed.data.policyAccepted === "on"
    });
    await emitModuleEvent("booking.created", {
      ...(await requestAttribution(undefined, "/book")),
      actorEmail: parsed.data.customerEmail,
      metadata: {
        serviceId: parsed.data.serviceId,
        resourceIds: parsed.data.resourceIds,
        staffId: parsed.data.staffId,
        startsAt: parsed.data.startsAt,
        status: booking.status
      },
      relatedId: booking.id,
      relatedType: "booking"
    });
    revalidatePath("/admin");
    revalidatePath("/admin/modules/appointments");
    revalidatePath("/admin/modules/clients");
    revalidatePath("/admin/modules/scheduling");
    revalidatePath("/book");
    const formAttachments = await getPublicFormAttachments({
      siteId: booking.siteId,
      targetId: booking.id,
      targetType: FormAttachmentTargetType.BOOKING
    });
    return {
      calendarUrl: icsCalendarAdapter.bookingPath({ bookingId: booking.id, siteId: booking.siteId }),
      formLinks: formAttachments.map((attachment) => ({
        description: attachment.form.description,
        href: publicFormAttachmentHref({
          formSlug: attachment.form.slug,
          targetId: attachment.targetId,
          targetType: attachment.targetType
        }),
        isRequired: attachment.isRequired,
        name: attachment.form.name
      })),
      manageUrl: bookingSelfServicePath({ bookingId: booking.id, customerEmail: booking.customerEmail, siteId: booking.siteId }),
      status: booking.status,
      ok: true
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create booking." };
  }
}

export async function joinPublicWaitlistAction(_state: WaitlistFormState, formData: FormData): Promise<WaitlistFormState> {
  if (String(formData.get(hiddenHoneypotField) || "").trim()) {
    return { ok: true };
  }

  const rateLimitMessage = await publicRateLimitMessage("waitlist_join", { limit: 6, windowMinutes: 10 });
  if (rateLimitMessage) {
    return { error: rateLimitMessage };
  }

  const parsed = waitlistSchema.safeParse({
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId") || undefined,
    desiredDate: formData.get("desiredDate"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    notes: formData.get("notes"),
    intakeResponse: formData.get("intakeResponse"),
    policyAccepted: formData.get("policyAccepted")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the waitlist form." };
  }

  const settings = await getSiteSettings();
  const startsAt = parseZonedDateKey(parsed.data.desiredDate, settings.timezone);
  if (!startsAt) {
    return { error: "Choose a valid waitlist date." };
  }

  const service = await prisma.service.findFirst({
    where: { id: parsed.data.serviceId, siteId: settings.siteId, isActive: true },
    include: {
      staffAssignments: {
        where: { staff: { isActive: true } },
        include: { staff: true }
      }
    }
  });

  if (!service || !service.waitlistEnabled) {
    return { error: "Waitlist is not available for that service." };
  }

  const selectedStaff = parsed.data.staffId
    ? service.staffAssignments.find((assignment) => assignment.staffId === parsed.data.staffId)?.staff
    : null;

  if (parsed.data.staffId && !selectedStaff) {
    return { error: "Choose a valid staff member for this waitlist request." };
  }

  if (service.requirePolicy && service.policyText?.trim() && parsed.data.policyAccepted !== "on") {
    return { error: "Please accept the appointment policy before joining the waitlist." };
  }

  const entry = await prisma.$transaction(async (tx) => {
    await upsertPublicClient(tx, {
      siteId: service.siteId,
      email: parsed.data.customerEmail,
      name: parsed.data.customerName,
      phone: parsed.data.customerPhone
    });

    return tx.bookingWaitlistEntry.create({
      data: {
        siteId: service.siteId,
        serviceId: service.id,
        staffId: selectedStaff?.id,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone,
        notes: parsed.data.notes,
        intakeResponse: parsed.data.intakeResponse,
        policyAccepted: parsed.data.policyAccepted === "on",
        startsAt
      }
    });
  });

  await emitModuleEvent("booking.waitlist.joined", {
    ...(await requestAttribution(undefined, "/book")),
    actorEmail: entry.customerEmail,
    metadata: {
      desiredDate: parsed.data.desiredDate,
      serviceId: service.id,
      serviceName: service.name,
      staffId: selectedStaff?.id
    },
    relatedId: entry.id,
    relatedType: "booking_waitlist_entry"
  });

  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/scheduling");
  revalidatePath("/book");

  return { ok: true };
}
