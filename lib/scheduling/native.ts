import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";
import { queueBookingCreatedEmails } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId, getSiteSettings } from "@/lib/site";
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

function resourceRuleCoversSlot(
  rules: Array<{ endMinutes: number; resourceId: string | null; startMinutes: number }>,
  resourceId: string,
  startMinutes: number,
  durationMinutes: number
) {
  const endMinutes = startMinutes + durationMinutes;
  return rules.some((rule) => rule.resourceId === resourceId && rule.startMinutes <= startMinutes && endMinutes <= rule.endMinutes);
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

export const nativeSchedulingAdapter: SchedulingAdapter = {
  async listActiveServices() {
    const siteId = await getCurrentSiteId();
    return prisma.service.findMany({
      where: { siteId, isActive: true },
      include: {
        resourceAssignments: {
          where: { resource: { isActive: true } },
          include: { resource: true },
          orderBy: { resource: { name: "asc" } }
        },
        staffAssignments: {
          where: { staff: { isActive: true } },
          include: { staff: true },
          orderBy: { staff: { name: "asc" } }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  },

  async getAvailableSlots(
    serviceId: string,
    date: Date,
    options?: { resourceId?: string; staffId?: string; excludeBookingId?: string }
  ): Promise<Slot[]> {
    const diagnostics = await nativeSchedulingAdapter.getSlotDiagnostics(serviceId, date, options);
    if (!diagnostics) return [];

    return diagnostics.slots
      .filter((slot) => slot.available)
      .map(({ startsAt, endsAt, label, resourceIds, resourceNames, staffId, staffName }) => ({
        startsAt,
        endsAt,
        label,
        resourceIds,
        resourceNames,
        staffId,
        staffName
      }));
  },

  async getSlotDiagnostics(
    serviceId: string,
    date: Date,
    options?: { resourceId?: string; staffId?: string; excludeBookingId?: string }
  ) {
    const settings = await getSiteSettings();
    const service = await prisma.service.findFirst({
      where: { id: serviceId, siteId: settings.siteId },
      include: {
        resourceAssignments: {
          where: { resource: { isActive: true } },
          include: { resource: true },
          orderBy: { resource: { name: "asc" } }
        },
        staffAssignments: {
          where: { staff: { isActive: true } },
          include: { staff: true },
          orderBy: { staff: { name: "asc" } }
        }
      }
    });

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
    const assignedStaff = service.staffAssignments.map((assignment) => assignment.staff);
    const assignedResources = service.resourceAssignments.map((assignment) => assignment.resource);
    const selectedStaff = options?.staffId ? assignedStaff.find((staff) => staff.id === options.staffId) : null;
    const selectedResource = options?.resourceId ? assignedResources.find((resource) => resource.id === options.resourceId) : null;
    if (options?.staffId && !selectedStaff) {
      messages.push("That staff member is not assigned to this service.");
    }
    if (options?.resourceId && !selectedResource) {
      messages.push("That resource is not required by this service.");
    }
    const slotStaff = selectedStaff ? [selectedStaff] : assignedStaff;
    const staffIds = slotStaff.map((staff) => staff.id);
    const requiredResources = selectedResource ? [selectedResource] : assignedResources;
    const resourceIds = requiredResources.map((resource) => resource.id);
    const rules = await prisma.availabilityRule.findMany({
      where: {
        siteId: service.siteId,
        weekday,
        OR: [
          { staffId: null, resourceId: null },
          ...(staffIds.length ? [{ staffId: { in: staffIds } }] : []),
          ...(resourceIds.length ? [{ resourceId: { in: resourceIds } }] : [])
        ]
      },
      orderBy: [{ staffId: "asc" }, { resourceId: "asc" }, { startMinutes: "asc" }]
    });
    const staffWithoutRules = slotStaff.filter((staff) => staff.id && !rules.some((rule) => rule.staffId === staff.id));
    if (staffWithoutRules.length) {
      messages.push(
        `${staffWithoutRules.map((staff) => staff.name).join(", ")} ${staffWithoutRules.length === 1 ? "has" : "have"} no staff availability rules.`
      );
    }
    const resourcesWithoutRules = requiredResources.filter((resource) => !rules.some((rule) => rule.resourceId === resource.id));
    if (resourcesWithoutRules.length) {
      messages.push(
        `${resourcesWithoutRules.map((resource) => resource.name).join(", ")} ${
          resourcesWithoutRules.length === 1 ? "has" : "have"
        } no resource availability rules.`
      );
    }
    if (!rules.length) {
      messages.push("No weekly availability rule matches this date.");
    }

    if (
      !service.isActive ||
      service.durationMinutes < 1 ||
      slotInterval < 1 ||
      !rules.length ||
      resourcesWithoutRules.length ||
      (options?.staffId && !selectedStaff) ||
      (options?.resourceId && !selectedResource)
    ) {
      return {
        serviceId: service.id,
        serviceName: service.name,
        resourceIds,
        resourceNames: requiredResources.map((resource) => resource.name),
        staffId: selectedStaff?.id,
        staffName: selectedStaff?.name,
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
        include: {
          resources: { select: { resourceId: true } },
          service: {
            select: {
              name: true,
              resourceAssignments: { select: { resourceId: true } }
            }
          }
        }
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

    const slotOwners = slotStaff.length ? slotStaff : [{ id: "", name: "" }];

    for (const owner of slotOwners) {
      const ownerRules = owner.id
        ? rules.filter((rule) => rule.staffId === owner.id)
        : requiredResources[0]
          ? rules.filter((rule) => rule.resourceId === requiredResources[0].id)
          : rules.filter((rule) => !rule.staffId && !rule.resourceId);
      const rulesForOwner = ownerRules;

      for (const rule of rulesForOwner) {
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

        for (const resource of requiredResources) {
          if (!resourceRuleCoversSlot(rules, resource.id, minutes, service.durationMinutes)) {
            reasons.push({
              code: "blockout_conflict",
              message: `${resource.name} is not available for this full time window.`
            });
          }
        }

        for (const booking of bookings) {
          const bookingBlocksOwner = owner.id ? !booking.staffId || booking.staffId === owner.id : !resourceIds.length;
          const bookingResourceIds = new Set([
            ...booking.resources.map((assignment) => assignment.resourceId),
            ...booking.service.resourceAssignments.map((assignment) => assignment.resourceId)
          ]);
          const bookingBlocksResource = resourceIds.length ? resourceIds.some((resourceId) => bookingResourceIds.has(resourceId)) : false;
          const bookingBlocksSlot = bookingBlocksOwner || bookingBlocksResource;
          if (bookingBlocksSlot && overlaps(bufferedStart, bufferedEnd, booking.startsAt, booking.endsAt)) {
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
          const blockAppliesToSlot = !block.resourceId || resourceIds.includes(block.resourceId);
          if (blockAppliesToSlot && overlaps(bufferedStart, bufferedEnd, block.startsAt, block.endsAt)) {
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
          label: owner.id ? `${makeSlotLabel(startsAt, settings.timezone)} with ${owner.name}` : makeSlotLabel(startsAt, settings.timezone),
          resourceIds,
          resourceNames: requiredResources.map((resource) => resource.name),
          staffId: owner.id || undefined,
          staffName: owner.name || undefined,
          available: reasons.length === 0,
          reasons
        });
        }
      }
    }

    const availableCount = slots.filter((slot) => slot.available).length;
    if (!availableCount && slots.length) {
      messages.push("Availability rules generated slots, but every slot is blocked by booking rules or conflicts.");
    }

    return {
      serviceId: service.id,
      serviceName: service.name,
      resourceIds,
      resourceNames: requiredResources.map((resource) => resource.name),
      staffId: selectedStaff?.id,
      staffName: selectedStaff?.name,
      timezone: settings.timezone,
      ruleCount: rules.length,
      slotCount: slots.length,
      availableCount,
      messages,
      slots
    };
  },

  async createBooking(input: BookingRequest) {
    const siteId = await getCurrentSiteId();
    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, siteId },
      include: {
        resourceAssignments: {
          where: { resource: { isActive: true } },
          include: { resource: true }
        },
        staffAssignments: {
          where: { staff: { isActive: true } },
          include: { staff: true }
        }
      }
    });
    if (!service || !service.isActive) {
      throw new Error("That service is not available.");
    }
    const assignedStaff = service.staffAssignments.map((assignment) => assignment.staff);
    const assignedResources = service.resourceAssignments.map((assignment) => assignment.resource);
    const selectedStaff = input.staffId ? assignedStaff.find((staff) => staff.id === input.staffId) : null;
    const requiredResourceIds = assignedResources.map((resource) => resource.id);
    const requestedResourceIds = [...new Set(input.resourceIds || [])].filter(Boolean);

    if (assignedStaff.length && !selectedStaff) {
      throw new Error("Choose an available staff member for this service.");
    }
    if (requiredResourceIds.length && requestedResourceIds.length && !sameIds(requiredResourceIds, requestedResourceIds)) {
      throw new Error("Choose an available resource-backed slot for this service.");
    }
    if (requestedResourceIds.some((resourceId) => !requiredResourceIds.includes(resourceId))) {
      throw new Error("Choose an available resource-backed slot for this service.");
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

    const offeredSlots = await nativeSchedulingAdapter.getAvailableSlots(input.serviceId, input.startsAt, {
      staffId: selectedStaff?.id
    });
    const matchingSlot = offeredSlots.find(
      (slot) =>
        slot.startsAt.getTime() === input.startsAt.getTime() &&
        (slot.staffId || "") === (selectedStaff?.id || "") &&
        sameIds(slot.resourceIds, requiredResourceIds)
    );
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
          const conflictScopes: Prisma.BookingWhereInput[] = [];
          if (selectedStaff) {
            conflictScopes.push({ OR: [{ staffId: null }, { staffId: selectedStaff.id }] });
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
                siteId: service.siteId,
                status: { not: BookingStatus.CANCELED },
                ...(conflictScopes.length ? { OR: conflictScopes } : {}),
                startsAt: { lt: bufferedEnd },
                endsAt: { gt: bufferedStart }
              }
            }),
            tx.blockedTime.findFirst({
              where: {
                siteId: service.siteId,
                OR: requiredResourceIds.length ? [{ resourceId: null }, { resourceId: { in: requiredResourceIds } }] : [{ resourceId: null }],
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
              staffId: selectedStaff?.id,
              startsAt: input.startsAt,
              endsAt,
              customerName: input.customerName,
              customerEmail: input.customerEmail.toLowerCase(),
              customerPhone: input.customerPhone,
              notes: input.notes,
              intakeResponse: input.intakeResponse,
              policyAccepted: Boolean(input.policyAccepted),
              resources: requiredResourceIds.length
                ? {
                    create: requiredResourceIds.map((resourceId) => ({
                      siteId: service.siteId,
                      resourceId
                    }))
                  }
                : undefined
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
