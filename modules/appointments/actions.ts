"use server";

import { BookingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { bookingDetailFormSchema, bookingRescheduleFormSchema, bookingStatusFormSchema, parseForm } from "@/lib/admin-validation";
import { queueBookingStatusEmail } from "@/lib/email";
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
  await requireAdmin();
  const input = await parseForm(bookingStatusFormSchema, formData);
  const settings = await getSiteSettings();

  const current = await prisma.booking.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    include: { service: true }
  });

  if (!current) return;

  const updated = await prisma.booking.update({
    where: { id: current.id },
    data: { status: input.status as BookingStatus },
    include: { service: true }
  });

  if (current) {
    await queueBookingStatusEmail(updated, current.status);
    if (current.status !== BookingStatus.CANCELED && updated.status === BookingStatus.CANCELED) {
      await emitModuleEvent("booking.canceled", {
        actorEmail: updated.customerEmail,
        metadata: {
          serviceId: updated.serviceId,
          serviceName: updated.service.name
        },
        relatedId: updated.id,
        relatedType: "booking"
      });
    }
  }

  refreshAppointments();
}

export async function updateBookingDetailAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(bookingDetailFormSchema, formData);
  const settings = await getSiteSettings();

  await prisma.booking.updateMany({
    where: { id: input.id, siteId: settings.siteId },
    data: {
      adminNotes: input.adminNotes,
      cancellationReason: input.cancellationReason
    }
  });

  refreshAppointments();
  revalidatePath(`/admin/appointments/${input.id}`);
}

export async function rescheduleBookingAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(bookingRescheduleFormSchema, formData);
  const detailPath = `/admin/appointments/${input.id}`;
  const settings = await getSiteSettings();

  const booking = await prisma.booking.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    include: { service: true }
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

  const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(booking.serviceId, startsAt, {
    excludeBookingId: booking.id
  });
  const matchingSlot = diagnostics?.slots.find((slot) => slot.startsAt.getTime() === startsAt.getTime());

  if (!matchingSlot) {
    redirect(`${detailPath}?error=${encodeURIComponent("The new time must match a configured availability slot.")}`);
  }

  if (!matchingSlot.available) {
    const reason = matchingSlot.reasons.map((item) => item.message).join(" ");
    redirect(`${detailPath}?error=${encodeURIComponent(reason || "That time is not available.")}`);
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      startsAt: matchingSlot.startsAt,
      endsAt: matchingSlot.endsAt
    }
  });

  refreshAppointments();
  revalidatePath(detailPath);
  redirect(`${detailPath}?saved=reschedule`);
}
