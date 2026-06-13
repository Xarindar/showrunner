"use server";

import { BookingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { bookingDetailFormSchema, bookingRescheduleFormSchema, bookingStatusFormSchema, parseForm } from "@/lib/admin-validation";
import { rescheduleBookingWithAvailability } from "@/lib/bookings/reschedule";
import { updateBookingStatus } from "@/lib/bookings/status";
import { emitModuleEvent } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
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
