"use server";

import { BookingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rescheduleBookingWithAvailability } from "@/lib/bookings/reschedule";
import { verifyBookingSelfServiceToken } from "@/lib/bookings/self-service";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export type SelfServiceActionState = {
  error?: string;
};

const baseSchema = z.object({
  bookingId: z.string().trim().min(1),
  token: z.string().trim().min(1)
});

const rescheduleSchema = baseSchema.extend({
  startsAt: z.string().trim().min(1)
});

const cancelSchema = baseSchema.extend({
  cancellationReason: z.string().trim().max(500).optional()
});

function selfServicePath(bookingId: string, token: string, params?: Record<string, string>) {
  const searchParams = new URLSearchParams({ token, ...(params || {}) });
  return `/bookings/${encodeURIComponent(bookingId)}?${searchParams.toString()}`;
}

async function findVerifiedSelfServiceBooking(bookingId: string, token: string) {
  const settings = await getSiteSettings();
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, siteId: settings.siteId },
    include: { service: true, staff: true }
  });

  if (
    !booking ||
    !verifyBookingSelfServiceToken({
      bookingId: booking.id,
      customerEmail: booking.customerEmail,
      siteId: booking.siteId,
      token
    })
  ) {
    throw new Error("Appointment link is invalid or expired.");
  }

  return { booking, settings };
}

function assertUpcomingManageable(booking: { startsAt: Date; status: BookingStatus }) {
  if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) {
    throw new Error("This appointment can no longer be changed online.");
  }
  if (booking.startsAt <= new Date()) {
    throw new Error("Past appointments cannot be changed online.");
  }
}

function refreshSelfServicePaths(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/admin/modules/scheduling");
}

export async function rescheduleSelfServiceBookingAction(
  _state: SelfServiceActionState,
  formData: FormData
): Promise<SelfServiceActionState> {
  const parsed = rescheduleSchema.safeParse({
    bookingId: formData.get("bookingId"),
    startsAt: formData.get("startsAt"),
    token: formData.get("token")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Choose a valid appointment time." };
  }

  const { bookingId, startsAt, token } = parsed.data;
  const nextStartsAt = new Date(startsAt);
  if (Number.isNaN(nextStartsAt.getTime())) {
    return { error: "Choose a valid appointment time." };
  }

  let updated;
  let previousStartsAt: Date;
  let previousEndsAt: Date;
  try {
    const { booking, settings } = await findVerifiedSelfServiceBooking(bookingId, token);
    assertUpcomingManageable(booking);
    previousStartsAt = booking.startsAt;
    previousEndsAt = booking.endsAt;
    updated = await rescheduleBookingWithAvailability({
      bookingId: booking.id,
      siteId: settings.siteId,
      startsAt: nextStartsAt
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reschedule this appointment." };
  }

  await emitModuleEvent("booking.rescheduled", {
    ...(await requestAttribution(undefined, `/bookings/${bookingId}`)),
    actorEmail: updated.customerEmail,
    metadata: {
      previousEndsAt: previousEndsAt.toISOString(),
      previousStartsAt: previousStartsAt.toISOString(),
      serviceId: updated.serviceId,
      serviceName: updated.service.name,
      staffId: updated.staffId,
      startsAt: updated.startsAt.toISOString()
    },
    relatedId: updated.id,
    relatedType: "booking"
  });

  refreshSelfServicePaths(bookingId);
  redirect(selfServicePath(bookingId, token, { saved: "reschedule" }));
}

export async function cancelSelfServiceBookingAction(
  _state: SelfServiceActionState,
  formData: FormData
): Promise<SelfServiceActionState> {
  const parsed = cancelSchema.safeParse({
    bookingId: formData.get("bookingId"),
    cancellationReason: formData.get("cancellationReason") || undefined,
    token: formData.get("token")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the cancellation form." };
  }

  const { bookingId, cancellationReason, token } = parsed.data;
  let updated;
  try {
    const { booking } = await findVerifiedSelfServiceBooking(bookingId, token);
    assertUpcomingManageable(booking);
    updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        cancellationReason: cancellationReason || booking.cancellationReason || "Canceled by client",
        status: BookingStatus.CANCELED
      },
      include: { service: true }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to cancel this appointment." };
  }

  await emitModuleEvent("booking.canceled", {
    ...(await requestAttribution(undefined, `/bookings/${bookingId}`)),
    actorEmail: updated.customerEmail,
    metadata: {
      cancellationReason: updated.cancellationReason,
      serviceId: updated.serviceId,
      serviceName: updated.service.name
    },
    relatedId: updated.id,
    relatedType: "booking"
  });

  refreshSelfServicePaths(bookingId);
  redirect(selfServicePath(bookingId, token, { saved: "cancel" }));
}
