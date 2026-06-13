import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";

function getBufferedWindow(startsAt: Date, endsAt: Date, beforeMinutes: number, afterMinutes: number) {
  const bufferedStart = new Date(startsAt);
  bufferedStart.setMinutes(bufferedStart.getMinutes() - beforeMinutes);

  const bufferedEnd = new Date(endsAt);
  bufferedEnd.setMinutes(bufferedEnd.getMinutes() + afterMinutes);

  return { bufferedStart, bufferedEnd };
}

export async function rescheduleBookingWithAvailability(input: { bookingId: string; siteId: string; startsAt: Date }) {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, siteId: input.siteId },
    include: {
      service: true,
      staff: true
    }
  });

  if (!booking) throw new Error("Appointment not found.");
  if (booking.status === BookingStatus.CANCELED || booking.status === BookingStatus.COMPLETED) {
    throw new Error("Only pending or confirmed appointments can be rescheduled.");
  }
  if (booking.startsAt <= new Date()) {
    throw new Error("Past appointments cannot be rescheduled.");
  }
  if (Number.isNaN(input.startsAt.getTime())) {
    throw new Error("Choose a valid new appointment time.");
  }

  const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(booking.serviceId, input.startsAt, {
    excludeBookingId: booking.id,
    staffId: booking.staffId || undefined
  });
  const matchingSlot = diagnostics?.slots.find(
    (slot) => slot.startsAt.getTime() === input.startsAt.getTime() && (slot.staffId || "") === (booking.staffId || "")
  );

  if (!matchingSlot) {
    throw new Error("The new time must match a configured availability slot.");
  }
  if (!matchingSlot.available) {
    throw new Error(matchingSlot.reasons.map((item) => item.message).join(" ") || "That time is not available.");
  }

  const requiredResourceIds = matchingSlot.resourceIds;
  const { bufferedStart, bufferedEnd } = getBufferedWindow(
    matchingSlot.startsAt,
    matchingSlot.endsAt,
    booking.service.bufferBeforeMinutes,
    booking.service.bufferAfterMinutes
  );

  return prisma.$transaction(
    async (tx) => {
      const conflictScopes: Prisma.BookingWhereInput[] = [];
      if (booking.staffId) {
        conflictScopes.push({ OR: [{ staffId: null }, { staffId: booking.staffId }] });
      }
      if (requiredResourceIds.length) {
        conflictScopes.push({
          OR: [
            { resources: { some: { resourceId: { in: requiredResourceIds } } } },
            { service: { resourceAssignments: { some: { resourceId: { in: requiredResourceIds } } } } }
          ]
        });
      }

      const [conflictingBooking, conflictingBlock] = await Promise.all([
        tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            siteId: booking.siteId,
            status: { not: BookingStatus.CANCELED },
            ...(conflictScopes.length ? { OR: conflictScopes } : {}),
            startsAt: { lt: bufferedEnd },
            endsAt: { gt: bufferedStart }
          }
        }),
        tx.blockedTime.findFirst({
          where: {
            siteId: booking.siteId,
            OR: requiredResourceIds.length ? [{ resourceId: null }, { resourceId: { in: requiredResourceIds } }] : [{ resourceId: null }],
            startsAt: { lt: bufferedEnd },
            endsAt: { gt: bufferedStart }
          }
        })
      ]);

      if (conflictingBooking || conflictingBlock) {
        throw new Error("That time was just booked or blocked. Please choose another time.");
      }

      await tx.bookingResource.deleteMany({ where: { bookingId: booking.id } });

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          endsAt: matchingSlot.endsAt,
          resources: requiredResourceIds.length
            ? {
                create: requiredResourceIds.map((resourceId) => ({
                  resourceId,
                  siteId: booking.siteId
                }))
              }
            : undefined,
          startsAt: matchingSlot.startsAt
        },
        include: {
          resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
          service: true,
          staff: true
        }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
