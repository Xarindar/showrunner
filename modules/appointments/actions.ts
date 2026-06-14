"use server";

import { BookingStatus, BookingWaitlistStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessibleBookingWaitlistWhere, getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import {
  bookingDetailFormSchema,
  bookingRescheduleFormSchema,
  bookingStatusFormSchema,
  bookingWaitlistPromoteFormSchema,
  bookingWaitlistStatusFormSchema,
  parseForm
} from "@/lib/admin-validation";
import { rescheduleBookingWithAvailability } from "@/lib/bookings/reschedule";
import { updateBookingStatus } from "@/lib/bookings/status";
import { emitModuleEvent } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateTimeInput } from "@/lib/timezone";

function refreshAppointments() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/book");
}

export async function updateBookingStatusAction(formData: FormData) {
  const user = await requireAdmin("appointments:manage");
  const input = await parseForm(bookingStatusFormSchema, formData);
  const settings = await getSiteSettings();

  const booking = await prisma.booking.findFirst({
    where: await getAccessibleBookingWhere(user, settings.siteId, { id: input.id }),
    select: { id: true }
  });

  if (!booking) {
    redirect("/admin/modules/appointments?error=Appointment%20not%20found.");
  }

  await updateBookingStatus({ bookingId: input.id, status: input.status as BookingStatus, siteId: settings.siteId });

  refreshAppointments();
}

export async function updateBookingDetailAction(formData: FormData) {
  const user = await requireAdmin("appointments:manage");
  const input = await parseForm(bookingDetailFormSchema, formData);
  const settings = await getSiteSettings();
  const bookingWhere = await getAccessibleBookingWhere(user, settings.siteId, { id: input.id });
  const booking = await prisma.booking.findFirst({
    where: bookingWhere,
    select: { id: true }
  });

  if (!booking) {
    redirect("/admin/modules/appointments?error=Appointment%20not%20found.");
  }

  await prisma.booking.updateMany({
    where: bookingWhere,
    data: {
      adminNotes: input.adminNotes,
      cancellationReason: input.cancellationReason
    }
  });

  refreshAppointments();
  revalidatePath(`/admin/appointments/${input.id}`);
}

export async function rescheduleBookingAction(formData: FormData) {
  const user = await requireAdmin("appointments:manage");
  const input = await parseForm(bookingRescheduleFormSchema, formData);
  const detailPath = `/admin/appointments/${input.id}`;
  const settings = await getSiteSettings();

  const booking = await prisma.booking.findFirst({
    where: await getAccessibleBookingWhere(user, settings.siteId, { id: input.id }),
    include: { service: true, staff: true }
  });

  if (!booking) {
    redirect(`${detailPath}?error=${encodeURIComponent("Appointment not found.")}`);
  }

  if (booking.status === BookingStatus.CANCELED || booking.status === BookingStatus.COMPLETED) {
    redirect(`${detailPath}?error=${encodeURIComponent("Only pending or confirmed appointments can be rescheduled.")}`);
  }

  const startsAt = parseZonedDateTimeInput(input.startsAt, settings.timezone);
  if (!startsAt) {
    redirect(`${detailPath}?error=${encodeURIComponent("Choose a valid new appointment time.")}`);
  }

  let updated;
  try {
    updated = await rescheduleBookingWithAvailability({
      bookingId: booking.id,
      siteId: settings.siteId,
      startsAt
    });
  } catch (error) {
    redirect(`${detailPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to reschedule appointment.")}`);
  }

  await emitModuleEvent("booking.rescheduled", {
    actorEmail: updated.customerEmail,
    metadata: {
      previousEndsAt: booking.endsAt.toISOString(),
      previousStartsAt: booking.startsAt.toISOString(),
      serviceId: updated.serviceId,
      serviceName: updated.service.name,
      staffId: updated.staffId,
      startsAt: updated.startsAt.toISOString()
    },
    relatedId: updated.id,
    relatedType: "booking"
  });

  refreshAppointments();
  revalidatePath(detailPath);
  redirect(`${detailPath}?saved=reschedule`);
}

export async function rescheduleBookingFromCalendarAction(input: {
  bookingId: string;
  dateKey: string;
  hour: number;
  minute: number;
}) {
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const detailPath = `/admin/appointments/${input.bookingId}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey) || !Number.isInteger(input.hour) || !Number.isInteger(input.minute)) {
    return { error: "Choose a valid calendar time.", ok: false };
  }
  if (input.hour < 0 || input.hour > 23 || input.minute < 0 || input.minute > 59) {
    return { error: "Choose a valid calendar time.", ok: false };
  }

  const booking = await prisma.booking.findFirst({
    where: await getAccessibleBookingWhere(user, settings.siteId, { id: input.bookingId }),
    include: { service: true, staff: true }
  });

  if (!booking) {
    return { error: "Appointment not found.", ok: false };
  }
  if (booking.status === BookingStatus.CANCELED || booking.status === BookingStatus.COMPLETED) {
    return { error: "Only pending or confirmed appointments can be rescheduled.", ok: false };
  }

  const startsAt = parseZonedDateTimeInput(
    `${input.dateKey}T${String(input.hour).padStart(2, "0")}:${String(input.minute).padStart(2, "0")}`,
    settings.timezone
  );
  if (!startsAt) {
    return { error: "Choose a valid calendar time.", ok: false };
  }

  let updated;
  try {
    updated = await rescheduleBookingWithAvailability({
      bookingId: booking.id,
      siteId: settings.siteId,
      startsAt
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reschedule appointment.", ok: false };
  }

  await emitModuleEvent("booking.rescheduled", {
    actorEmail: updated.customerEmail,
    metadata: {
      previousEndsAt: booking.endsAt.toISOString(),
      previousStartsAt: booking.startsAt.toISOString(),
      serviceId: updated.serviceId,
      serviceName: updated.service.name,
      staffId: updated.staffId,
      startsAt: updated.startsAt.toISOString()
    },
    relatedId: updated.id,
    relatedType: "booking"
  });

  refreshAppointments();
  revalidatePath(detailPath);

  return {
    bookingId: updated.id,
    endsAt: updated.endsAt.toISOString(),
    ok: true,
    startsAt: updated.startsAt.toISOString()
  };
}

export async function promoteWaitlistEntryAction(formData: FormData) {
  const user = await requireAdmin("appointments:manage");
  const input = await parseForm(bookingWaitlistPromoteFormSchema, formData);
  const settings = await getSiteSettings();
  const startsAt = parseZonedDateTimeInput(input.startsAt, settings.timezone);

  if (!startsAt) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("Choose a valid promotion time.")}`);
  }

  const entry = await prisma.bookingWaitlistEntry.findFirst({
    where: await getAccessibleBookingWaitlistWhere(user, settings.siteId, {
      id: input.id,
      status: BookingWaitlistStatus.WAITING
    }),
    include: {
      service: {
        include: {
          staffAssignments: {
            where: { staff: { isActive: true } },
            include: { staff: true },
            orderBy: { staff: { name: "asc" } }
          }
        }
      },
      staff: true
    }
  });

  if (!entry) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("Waitlist entry not found.")}`);
  }

  const staffId = input.staffId || entry.staffId || undefined;
  if (staffId && !entry.service.staffAssignments.some((assignment) => assignment.staffId === staffId)) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("Choose a staff member assigned to that service.")}`);
  }

  // Atomically claim the entry before creating the booking so two concurrent
  // promotions (or a retry after a crash mid-create) can't both create a booking
  // from one entry. Only the request that flips WAITING -> PROMOTED proceeds.
  const claim = await prisma.bookingWaitlistEntry.updateMany({
    where: { id: entry.id, status: BookingWaitlistStatus.WAITING },
    data: { status: BookingWaitlistStatus.PROMOTED }
  });
  if (claim.count !== 1) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("That waitlist entry was already handled.")}`);
  }

  let booking;
  try {
    booking = await nativeSchedulingAdapter.createBooking({
      serviceId: entry.serviceId,
      staffId,
      startsAt,
      customerName: entry.customerName,
      customerEmail: entry.customerEmail,
      customerPhone: entry.customerPhone || undefined,
      notes: entry.notes || undefined,
      intakeResponse: entry.intakeResponse || undefined,
      policyAccepted: entry.policyAccepted,
      status: BookingStatus.CONFIRMED
    });
  } catch (error) {
    // Booking creation failed (e.g. slot just taken) — release the claim so the
    // entry can be promoted again to a different time.
    await prisma.bookingWaitlistEntry.update({
      where: { id: entry.id },
      data: { status: BookingWaitlistStatus.WAITING }
    });
    redirect(
      `/admin/modules/appointments?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to promote waitlist entry.")}`
    );
  }

  await prisma.bookingWaitlistEntry.update({
    where: { id: entry.id },
    data: { promotedBookingId: booking.id }
  });

  await emitModuleEvent("booking.created", {
    actorEmail: user.email,
    metadata: {
      serviceId: booking.serviceId,
      staffId: booking.staffId,
      startsAt: booking.startsAt.toISOString(),
      source: "waitlist",
      waitlistEntryId: entry.id
    },
    relatedId: booking.id,
    relatedType: "booking"
  });
  await emitModuleEvent("booking.waitlist.promoted", {
    actorEmail: user.email,
    metadata: {
      bookingId: booking.id,
      serviceId: entry.serviceId,
      serviceName: entry.service.name,
      staffId: booking.staffId,
      startsAt: booking.startsAt.toISOString()
    },
    relatedId: entry.id,
    relatedType: "booking_waitlist_entry"
  });

  refreshAppointments();
  redirect("/admin/modules/appointments?saved=waitlist-promoted");
}

export async function updateWaitlistEntryStatusAction(formData: FormData) {
  const user = await requireAdmin("appointments:manage");
  const input = await parseForm(bookingWaitlistStatusFormSchema, formData);
  const settings = await getSiteSettings();
  const entry = await prisma.bookingWaitlistEntry.findFirst({
    where: await getAccessibleBookingWaitlistWhere(user, settings.siteId, {
      id: input.id,
      status: BookingWaitlistStatus.WAITING
    }),
    include: { service: true }
  });

  if (!entry) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("Waitlist entry not found.")}`);
  }

  if (input.status !== BookingWaitlistStatus.DECLINED && input.status !== BookingWaitlistStatus.CANCELED) {
    redirect(`/admin/modules/appointments?error=${encodeURIComponent("Choose a valid waitlist status.")}`);
  }

  await prisma.bookingWaitlistEntry.update({
    where: { id: entry.id },
    data: { status: input.status }
  });

  if (input.status === BookingWaitlistStatus.DECLINED) {
    await emitModuleEvent("booking.waitlist.declined", {
      actorEmail: user.email,
      metadata: {
        serviceId: entry.serviceId,
        serviceName: entry.service.name,
        startsAt: entry.startsAt.toISOString()
      },
      relatedId: entry.id,
      relatedType: "booking_waitlist_entry"
    });
  }

  refreshAppointments();
  redirect("/admin/modules/appointments?saved=waitlist");
}
