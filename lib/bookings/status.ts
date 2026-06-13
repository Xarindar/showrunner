import "server-only";

import { BookingStatus } from "@prisma/client";
import { queueBookingStatusEmail } from "@/lib/email";
import { emitModuleEvent } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

export async function updateBookingStatus(input: { bookingId: string; status: BookingStatus; siteId?: string }) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const current = await prisma.booking.findFirst({
    where: { id: input.bookingId, siteId },
    include: { service: true }
  });

  if (!current) throw new Error("Booking target not found.");

  const updated = await prisma.booking.update({
    where: { id: current.id },
    data: { status: input.status },
    include: { service: true }
  });

  await queueBookingStatusEmail(updated, current.status);

  if (current.status === BookingStatus.PENDING && updated.status === BookingStatus.CONFIRMED) {
    await emitModuleEvent("booking.request.approved", {
      actorEmail: updated.customerEmail,
      metadata: {
        serviceId: updated.serviceId,
        serviceName: updated.service.name
      },
      relatedId: updated.id,
      relatedType: "booking"
    });
  }

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

  return updated;
}
