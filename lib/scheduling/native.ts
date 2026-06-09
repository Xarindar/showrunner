import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";
import { queueBookingCreatedEmails } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { addMinutesToZonedDay, getZonedDayBounds, getZonedWeekday } from "@/lib/timezone";
import type { BookingRequest, SchedulingAdapter, Slot, SlotDiagnostic, SlotDiagnosticReason } from "@/lib/scheduling/types";

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

function makeTimeRangeLabel(startsAt: Date, endsAt: Date, timeZone: string) {
  return `${makeSlotLabel(startsAt, timeZone)}-${makeSlotLabel(endsAt, timeZone)}`;
}

export const nativeSchedulingAdapter: SchedulingAdapter = {
  async listActiveServices() {
    return prisma.service.findMany({
      where: { siteId: DEFAULT_SITE_ID, isActive: true },
      orderBy: { createdAt: "asc" }
    });
  },

  async getAvailableSlots(serviceId: string, date: Date): Promise<Slot[]> {
    const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(serviceId, date);
    if (!diagnostics) return [];

    return diagnostics.slots
      .filter((slot) => slot.available)
      .map(({ startsAt, endsAt, label }) => ({ startsAt, endsAt, label }));
  },

  async getSlotDiagnostics(serviceId: string, date: Date, options?: { excludeBookingId?: string }) {
    const [service, settings] = await Promise.all([
      prisma.service.findFirst({ where: { id: serviceId, siteId: DEFAULT_SITE_ID } }),
      getSiteSettings()
    ]);

    if (!service) return null;

    const messages: string[] = [];
    if (!service.isActive) {
      messages.push("This service is inactive, so public booking will not offer any slots.");
    }
    if (service.durationMinutes < 1) {
      messages.push("This service needs a positive duration before slots can be generated.");
    }

    const slotInterval = service.slotIntervalMinutes || service.durationMinutes;
    if (slotInterval < 1) {
      messages.push("This service needs a positive slot interval before slots can be generated.");
    }

    const weekday = getZonedWeekday(date, settings.timezone);
    const rules = await prisma.availabilityRule.findMany({
      where: { siteId: service.siteId, weekday },
      orderBy: { startMinutes: "asc" }
    });
    if (!rules.length) {
      messages.push("No weekly availability rule matches this date.");
    }

    if (!service.isActive || service.durationMinutes < 1 || slotInterval < 1 || !rules.length) {
      return {
        serviceId: service.id,
        serviceName: service.name,
        timezone: settings.timezone,
        ruleCount: rules.length,
        slotCount: 0,
        availableCount: 0,
        messages,
        slots: []
      };
    }

    const { start, end } = getZonedDayBounds(date, settings.timezone);
    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          siteId: service.siteId,
          ...(options?.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}),
          status: { not: BookingStatus.CANCELED },
          startsAt: { lt: end },
          endsAt: { gt: start }
        },
        include: { service: { select: { name: true } } }
      }),
      prisma.blockedTime.findMany({
        where: {
          siteId: service.siteId,
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

    const slots: SlotDiagnostic[] = [];

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

        const reasons: SlotDiagnosticReason[] = [];

        if (startsAt < minimumStart) {
          reasons.push({
            code: "minimum_notice",
            message: `Before the ${service.minimumNoticeHours}h minimum notice window.`
          });
        }

        if (startsAt > latestStart) {
          reasons.push({
            code: "max_advance",
            message: `Beyond the ${service.maxAdvanceDays}d advance booking window.`
          });
        }

        for (const booking of bookings) {
          if (overlaps(bufferedStart, bufferedEnd, booking.startsAt, booking.endsAt)) {
            reasons.push({
              code: "booking_conflict",
              message: `Conflicts with ${booking.service.name} for ${booking.customerName} (${makeTimeRangeLabel(
                booking.startsAt,
                booking.endsAt,
                settings.timezone
              )}).`
            });
          }
        }

        for (const block of blocks) {
          if (overlaps(bufferedStart, bufferedEnd, block.startsAt, block.endsAt)) {
            reasons.push({
              code: "blockout_conflict",
              message: `Blocked by ${block.reason || "manual blockout"} (${makeTimeRangeLabel(
                block.startsAt,
                block.endsAt,
                settings.timezone
              )}).`
            });
          }
        }

        slots.push({
          startsAt,
          endsAt,
          label: makeSlotLabel(startsAt, settings.timezone),
          available: reasons.length === 0,
          reasons
        });
      }
    }

    const availableCount = slots.filter((slot) => slot.available).length;
    if (!availableCount && slots.length) {
      messages.push("Availability rules generated slots, but every slot is blocked by booking rules or conflicts.");
    }

    return {
      serviceId: service.id,
      serviceName: service.name,
      timezone: settings.timezone,
      ruleCount: rules.length,
      slotCount: slots.length,
      availableCount,
      messages,
      slots
    };
  },

  async createBooking(input: BookingRequest) {
    const service = await prisma.service.findFirst({ where: { id: input.serviceId, siteId: DEFAULT_SITE_ID } });
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
                siteId: service.siteId,
                status: { not: BookingStatus.CANCELED },
                startsAt: { lt: bufferedEnd },
                endsAt: { gt: bufferedStart }
              }
            }),
            tx.blockedTime.findFirst({
              where: {
                siteId: service.siteId,
                startsAt: { lt: bufferedEnd },
                endsAt: { gt: bufferedStart }
              }
            })
          ]);

          if (conflictingBooking || conflictingBlock) {
            throw new Error("That time was just booked or blocked. Please choose another time.");
          }

          const client = await tx.client.upsert({
            where: { siteId_email: { siteId: service.siteId, email: input.customerEmail.toLowerCase() } },
            update: {
              name: input.customerName,
              phone: input.customerPhone || undefined
            },
            create: {
              siteId: service.siteId,
              name: input.customerName,
              email: input.customerEmail.toLowerCase(),
              phone: input.customerPhone
            }
          });

          return tx.booking.create({
            data: {
              siteId: service.siteId,
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
