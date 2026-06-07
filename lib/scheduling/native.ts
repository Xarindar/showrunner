import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";
import { queueBookingCreatedEmails } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { addMinutesToZonedDay, getZonedDayBounds, getZonedWeekday } from "@/lib/timezone";
import type { BookingRequest, SchedulingAdapter, Slot } from "@/lib/scheduling/types";

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function makeSlotLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(date);
}

function getBufferedWindow(startsAt: Date, endsAt: Date, beforeMinutes: number, afterMinutes: number) {
  const bufferedStart = new Date(startsAt);
  bufferedStart.setMinutes(bufferedStart.getMinutes() - beforeMinutes);

  const bufferedEnd = new Date(endsAt);
  bufferedEnd.setMinutes(bufferedEnd.getMinutes() + afterMinutes);

  return { bufferedStart, bufferedEnd };
}

export const nativeSchedulingAdapter: SchedulingAdapter = {
  async listActiveServices() {
    return prisma.service.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    });
  },

  async getAvailableSlots(serviceId: string, date: Date): Promise<Slot[]> {
    const [service, settings] = await Promise.all([
      prisma.service.findUnique({ where: { id: serviceId } }),
      getSiteSettings()
    ]);
    if (!service || !service.isActive) return [];
    if (service.durationMinutes < 1) return [];

    const slotInterval = service.slotIntervalMinutes || service.durationMinutes;
    if (slotInterval < 1) return [];

    const weekday = getZonedWeekday(date, settings.timezone);
    const rules = await prisma.availabilityRule.findMany({
      where: { weekday },
      orderBy: { startMinutes: "asc" }
    });
    if (!rules.length) return [];

    const { start, end } = getZonedDayBounds(date, settings.timezone);
    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          status: { not: BookingStatus.CANCELED },
          startsAt: { lt: end },
          endsAt: { gt: start }
        }
      }),
      prisma.blockedTime.findMany({
        where: {
          startsAt: { lt: end },
          endsAt: { gt: start }
        }
      })
    ]);

    const now = new Date();
    const minimumStart = new Date(now);
    minimumStart.setHours(minimumStart.getHours() + service.minimumNoticeHours);

    const latestStart = new Date(now);
    latestStart.setDate(latestStart.getDate() + service.maxAdvanceDays);

    const slots: Slot[] = [];

    for (const rule of rules) {
      for (
        let minutes = rule.startMinutes;
        minutes + service.durationMinutes <= rule.endMinutes;
        minutes += slotInterval
      ) {
        const startsAt = addMinutesToZonedDay(start, minutes, settings.timezone);
        const endsAt = new Date(startsAt);
        endsAt.setMinutes(endsAt.getMinutes() + service.durationMinutes);
        const { bufferedStart, bufferedEnd } = getBufferedWindow(
          startsAt,
          endsAt,
          service.bufferBeforeMinutes,
          service.bufferAfterMinutes
        );

        const unavailable =
          startsAt < minimumStart ||
          startsAt > latestStart ||
          bookings.some((booking) => overlaps(bufferedStart, bufferedEnd, booking.startsAt, booking.endsAt)) ||
          blocks.some((block) => overlaps(bufferedStart, bufferedEnd, block.startsAt, block.endsAt));

        if (!unavailable) {
          slots.push({ startsAt, endsAt, label: makeSlotLabel(startsAt, settings.timezone) });
        }
      }
    }

    return slots;
  },

  async createBooking(input: BookingRequest) {
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service || !service.isActive) {
      throw new Error("That service is not available.");
    }

    if (Number.isNaN(input.startsAt.getTime())) {
      throw new Error("Choose a valid appointment time.");
    }

    if (service.durationMinutes < 1 || (service.slotIntervalMinutes || service.durationMinutes) < 1) {
      throw new Error("That service is not configured for online booking.");
    }

    if (service.requirePolicy && service.policyText?.trim() && !input.policyAccepted) {
      throw new Error("Please accept the appointment policy before booking.");
    }

    const offeredSlots = await nativeSchedulingAdapter.getAvailableSlots(input.serviceId, input.startsAt);
    const matchingSlot = offeredSlots.find((slot) => slot.startsAt.getTime() === input.startsAt.getTime());
    if (!matchingSlot) {
      throw new Error("That time is no longer available. Please choose another time.");
    }

    const endsAt = new Date(input.startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + service.durationMinutes);
    const { bufferedStart, bufferedEnd } = getBufferedWindow(
      input.startsAt,
      endsAt,
      service.bufferBeforeMinutes,
      service.bufferAfterMinutes
    );

    let booking;
    try {
      booking = await prisma.$transaction(
        async (tx) => {
          const [conflictingBooking, conflictingBlock] = await Promise.all([
            tx.booking.findFirst({
              where: {
                status: { not: BookingStatus.CANCELED },
                startsAt: { lt: bufferedEnd },
                endsAt: { gt: bufferedStart }
              }
            }),
            tx.blockedTime.findFirst({
              where: {
                startsAt: { lt: bufferedEnd },
                endsAt: { gt: bufferedStart }
              }
            })
          ]);

          if (conflictingBooking || conflictingBlock) {
            throw new Error("That time was just booked or blocked. Please choose another time.");
          }

          const client = await tx.client.upsert({
            where: { email: input.customerEmail.toLowerCase() },
            update: {
              name: input.customerName,
              phone: input.customerPhone || undefined
            },
            create: {
              name: input.customerName,
              email: input.customerEmail.toLowerCase(),
              phone: input.customerPhone
            }
          });

          return tx.booking.create({
            data: {
              clientId: client.id,
              serviceId: input.serviceId,
              startsAt: input.startsAt,
              endsAt,
              customerName: input.customerName,
              customerEmail: input.customerEmail.toLowerCase(),
              customerPhone: input.customerPhone,
              notes: input.notes,
              intakeResponse: input.intakeResponse,
              policyAccepted: Boolean(input.policyAccepted)
            }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        throw new Error("That time was just booked or blocked. Please choose another time.");
      }
      if (error instanceof Error) throw error;
      throw new Error("That time was just booked or blocked. Please choose another time.");
    }

    try {
      await queueBookingCreatedEmails({
        ...booking,
        service: { name: service.name }
      });
    } catch (error) {
      console.error("[email:booking-failed]", error);
    }

    return booking;
  }
};
