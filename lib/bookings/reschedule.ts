import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";
import { blockoutConflictWhere, bookingConflictWhere, getBufferedWindow } from "@/lib/bookings/conflicts";
import { prisma } from "@/lib/prisma";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { checkManualSessionTime } from "@/lib/bookings/manual";
import { listGoogleBusyWindows } from "@/lib/scheduling/google-calendar";
import { getSiteSettingsForSite } from "@/lib/site";

export async function rescheduleBookingWithAvailability(input: { bookingId: string; siteId: string; startsAt: Date }) {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, siteId: input.siteId },
    include: {
      service: true,
      staff: true,
      resources: true
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

  if (booking.isManual) {
    if (input.startsAt <= new Date()) throw new Error("Choose a future date and time.");
    const endsAt = new Date(input.startsAt.getTime() + booking.endsAt.getTime() - booking.startsAt.getTime());
    const settings = await getSiteSettingsForSite(booking.siteId);
    const buffered = getBufferedWindow(input.startsAt, endsAt, booking.service.bufferBeforeMinutes, booking.service.bufferAfterMinutes);
    const busy = await listGoogleBusyWindows({ siteId: booking.siteId, timeZone: settings.timezone, staffIds: booking.staffId ? [booking.staffId] : [], start: buffered.bufferedStart, end: buffered.bufferedEnd });
    if (busy.busy.some(window => window.start < buffered.bufferedEnd && window.end > buffered.bufferedStart)) throw new Error("That time is busy on your connected calendar.");
    return prisma.$transaction(async tx => {
      await checkManualSessionTime(tx, { siteId: booking.siteId, startsAt: input.startsAt, endsAt, staffId: booking.staffId,
        resourceIds: booking.resources.map(resource => resource.resourceId), bufferBeforeMinutes: booking.service.bufferBeforeMinutes,
        bufferAfterMinutes: booking.service.bufferAfterMinutes, excludeBookingId: booking.id });
      return tx.booking.update({ where: { id: booking.id }, data: { startsAt: input.startsAt, endsAt },
        include: { resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } }, service: true, staff: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

  return prisma.$transaction(
    async (tx) => {
      const [conflictingBooking, conflictingBlock] = await Promise.all([
        tx.booking.findFirst({
          where: bookingConflictWhere({
            bufferAfterMinutes: booking.service.bufferAfterMinutes,
            bufferBeforeMinutes: booking.service.bufferBeforeMinutes,
            endsAt: matchingSlot.endsAt,
            excludeBookingId: booking.id,
            resourceIds: requiredResourceIds,
            siteId: booking.siteId,
            staffId: booking.staffId,
            startsAt: matchingSlot.startsAt
          })
        }),
        tx.blockedTime.findFirst({
          where: blockoutConflictWhere({
            bufferAfterMinutes: booking.service.bufferAfterMinutes,
            bufferBeforeMinutes: booking.service.bufferBeforeMinutes,
            endsAt: matchingSlot.endsAt,
            resourceIds: requiredResourceIds,
            siteId: booking.siteId,
            startsAt: matchingSlot.startsAt
          })
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
