import { formatTime } from "@/lib/format";
import { BookingRuleAnswerError, validateBookingRuleAnswers } from "@/lib/scheduling/booking-rules";
import "server-only";
import { listBookingDocuments } from "./booking-document-store";
import { resolveBookingRequirements, validateBookingRequirementsRevision } from "./booking-documents";
import { servicePriceCents, publicBookingDuration } from "@/lib/scheduling/pricing";
import { readSessionOffering, selectSessionPackage, priceSessionOffering } from "./session-offering";
import { bookingTermsValues, renderBookingTerms } from "@/clients/booking/scripts/booking-terms.js";
import { timeFrameMinutes, timeFrameDays, timeFrameCovered } from "./service-time-frame";

import { BookingStatus, Prisma, SchedulingCalendarOwnerType } from "@prisma/client";
import { upsertPublicClient } from "@/lib/clients/public-client";
import { queueBookingCreatedEmails } from "@/lib/email";
import { generateBillingPublicToken } from "@/lib/billing/documents";
import { prisma } from "@/lib/prisma";
import { listGoogleBusyWindows } from "@/lib/scheduling/google-calendar";
import { getCurrentSiteId, getSiteSettings, getSiteSettingsForSite } from "@/lib/site";
import { addMinutesToZonedDay, getZonedDayBounds, getZonedWeekday } from "@/lib/timezone";
import type { BookingRequest, SchedulingAdapter, Slot, SlotDiagnostic, SlotDiagnosticReason } from "@/lib/scheduling/types";

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function makeSlotLabel(date: Date, timeZone: string) {
  return formatTime(date, timeZone);
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
  async listActiveServices(options?: { siteId?: string }) {
    const siteId = options?.siteId || (await getCurrentSiteId());
    return prisma.service.findMany({
      where: { siteId, isActive: true, isOneOff: false },
      include: {
        mediaAsset: true,
        rectangularMediaAsset: true,
        hourlyRate: true,
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
    options?: { requireDuration?: boolean; durationMinutes?: number; tierId?: string; resourceId?: string; siteId?: string; staffId?: string; excludeBookingId?: string }
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
    options?: { requireDuration?: boolean; durationMinutes?: number; tierId?: string; resourceId?: string; siteId?: string; staffId?: string; excludeBookingId?: string }
  ) {
    const settings = options?.siteId ? await getSiteSettingsForSite(options.siteId) : await getSiteSettings();
    const service = await prisma.service.findFirst({
      where: { id: serviceId, siteId: settings.siteId },
      include: {
        mediaAsset: true,
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

    const offering = readSessionOffering(service.sessionOffering);
    const tier = options?.tierId ? offering?.tiers.find(tier => tier.id === options.tierId) : offering?.tiers[0];
    if (options?.tierId && !tier) throw new BookingRuleAnswerError("Choose a package from this session type.");
    const selectedPackage = tier ?? service;
    const requestedDuration = options?.durationMinutes ?? (options?.requireDuration ? undefined : selectedPackage.durationMinutes);
    try { service.durationMinutes = publicBookingDuration(selectedPackage, requestedDuration); }
    catch (error) { throw new BookingRuleAnswerError(error instanceof Error ? error.message : "Choose a valid booking length."); }
    const timeFrame = tier?.timeFrame;
    const fixedWindow = timeFrame ? timeFrameMinutes(timeFrame) : null;

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
    const frameDays = timeFrame?.endsNextDay ? timeFrameDays(timeFrame, weekday) : [];
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
        weekday: frameDays.length ? { in: [...new Set(frameDays.map(day => day.weekday))] } : weekday,
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

    const { start, end: dayEnd } = getZonedDayBounds(date, settings.timezone);
    const frameEnd = timeFrame?.endsNextDay && fixedWindow ? addMinutesToZonedDay(start, fixedWindow.end, settings.timezone) : null;
    const allowClosingOverflow = !timeFrame && !tier?.unlimitedDuration && Boolean(await prisma.siteDomain.findFirst({
      where: { siteId: service.siteId, hostname: "admin.jazzrphotography.com" }, select: { id: true }
    }));
    const lastRuleEnd = allowClosingOverflow ? Math.max(...rules.map(rule => rule.endMinutes)) : 0;
    const latestSessionEnd = allowClosingOverflow ? addMinutesToZonedDay(start, lastRuleEnd, settings.timezone).getTime() + service.durationMinutes * 60000 : 0;
    const end = frameEnd ?? new Date(Math.max(dayEnd.getTime(), latestSessionEnd));
    const queryStart = new Date(start.getTime() - service.bufferBeforeMinutes * 60000);
    const queryEnd = new Date(end.getTime() + service.bufferAfterMinutes * 60000);
    const slotOwners = slotStaff.length ? slotStaff : [{ id: "", name: "" }];
    const [bookings, blocks, googleCalendarBusy] = await Promise.all([
      prisma.booking.findMany({
        where: {
          siteId: service.siteId,
          ...(options?.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}),
          status: { not: BookingStatus.CANCELED },
          startsAt: { lt: queryEnd },
          endsAt: { gt: queryStart }
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
          startsAt: { lt: queryEnd },
          endsAt: { gt: queryStart }
        }
      }),
      listGoogleBusyWindows({
        end: queryEnd,
        siteId: service.siteId,
        staffIds: slotOwners.map((owner) => owner.id).filter(Boolean),
        start: queryStart,
        timeZone: settings.timezone
      })
    ]);

    const now = new Date();
    const minimumStart = new Date(now);
    minimumStart.setHours(minimumStart.getHours() + service.minimumNoticeHours);

    const latestStart = new Date(now);
    latestStart.setDate(latestStart.getDate() + service.maxAdvanceDays);

    const slots: SlotDiagnostic[] = [];

    for (const owner of slotOwners) {
      const seenStarts = new Set<number>();
      const ownerRules = owner.id
        ? rules.filter((rule) => rule.staffId === owner.id)
        : requiredResources[0]
          ? rules.filter((rule) => rule.resourceId === requiredResources[0].id)
          : rules.filter((rule) => !rule.staffId && !rule.resourceId);
      const rulesForOwner = frameDays.length && fixedWindow
        ? timeFrameCovered(frameDays, ownerRules) ? [{ startMinutes: fixedWindow.start, endMinutes: fixedWindow.end }] : []
        : ownerRules;
      const closing = Math.max(...ownerRules.map(rule => rule.endMinutes));

      for (const rule of rulesForOwner) {
        for (
          let minutes = fixedWindow?.start ?? rule.startMinutes;
          minutes >= rule.startMinutes && (tier?.unlimitedDuration || allowClosingOverflow ? minutes < rule.endMinutes : minutes + service.durationMinutes <= rule.endMinutes) && (!fixedWindow || minutes === fixedWindow.start);
          minutes += slotInterval
        ) {
        const startsAt = addMinutesToZonedDay(start, minutes, settings.timezone);
        if (seenStarts.has(startsAt.getTime())) continue;
        seenStarts.add(startsAt.getTime());
        const sessionEnd = new Date(startsAt.getTime() + service.durationMinutes * 60000);
        const runsPastClosing = allowClosingOverflow && sessionEnd > addMinutesToZonedDay(start, closing, settings.timezone);
        if (allowClosingOverflow && !runsPastClosing && !ownerRules.some(window =>
          minutes >= window.startMinutes && minutes < window.endMinutes && sessionEnd <= addMinutesToZonedDay(start, window.endMinutes, settings.timezone)
        )) continue;
        const endsAt = tier?.unlimitedDuration ? dayEnd : frameEnd ?? (fixedWindow ? addMinutesToZonedDay(start, fixedWindow.end, settings.timezone) : runsPastClosing && sessionEnd < dayEnd ? dayEnd : sessionEnd);
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
          if (!(frameDays.length ? timeFrameCovered(frameDays, rules.filter(rule => rule.resourceId === resource.id)) : resourceRuleCoversSlot(rules, resource.id, minutes, tier?.unlimitedDuration || runsPastClosing ? 1 : service.durationMinutes))) {
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

        for (const busy of googleCalendarBusy.busy) {
          const appliesToSlot =
            busy.ownerType === SchedulingCalendarOwnerType.SITE ||
            (owner.id && busy.ownerType === SchedulingCalendarOwnerType.STAFF && busy.ownerId === owner.id);
          if (appliesToSlot && overlaps(startsAt, endsAt, busy.start, busy.end)) {
            reasons.push({
              code: "google_calendar_conflict",
              message: `${
                busy.ownerType === SchedulingCalendarOwnerType.STAFF ? owner.name : "The business"
              } is busy on Google Calendar (${makeTimeRangeLabel(busy.start, busy.end, settings.timezone)}).`
            });
          }
        }

        slots.push({
          startsAt,
          endsAt,
          ...(runsPastClosing && endsAt > sessionEnd ? { sessionEndsAt: sessionEnd } : {}),
          label: `${timeFrame ? makeTimeRangeLabel(startsAt, endsAt, settings.timezone) : makeSlotLabel(startsAt, settings.timezone)}${timeFrame?.endsNextDay ? " (next day)" : ""}${owner.id ? ` with ${owner.name}` : ""}`,
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

    slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
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
    const siteId = input.siteId || (await getCurrentSiteId());
    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, siteId },
      include: {
        hourlyRate: true,
        mediaAsset: true,
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
    let offering = readSessionOffering(service.sessionOffering);
    if (offering && (offering.tiers.some(tier => tier.pricingType === "HOURLY") || offering.addOns.some(extra => extra.pricingType === "HOURLY"))) {
      offering = priceSessionOffering(offering, await prisma.hourlyRate.findMany({ where: { siteId } }), { pricingType: service.pricingType === "HOURLY" ? "HOURLY" : "FLAT_RATE", hourlyRateId: service.hourlyRateId ?? "" });
    }
    const tierId = input.tierId || (offering?.tiers.length === 1 ? offering.tiers[0].id : undefined);
    let packageSnapshot;
    try {
      const tier = offering?.tiers.find(tier => tier.id === tierId);
      service.durationMinutes = publicBookingDuration(tier ?? service, input.durationMinutes);
      packageSnapshot = selectSessionPackage(offering, tierId, input.addOnIds, service.durationMinutes, input.addOnQuantities);
    }
    catch (error) { throw new BookingRuleAnswerError(error instanceof Error ? error.message : "Choose a valid package."); }
    if (input.serviceRevision && input.serviceRevision !== service.updatedAt.toISOString()) throw new BookingRuleAnswerError("The session packages changed. Reload and review the current price before booking.");
    const priceCents = packageSnapshot ? packageSnapshot.priceCents : servicePriceCents(service);
    if (input.onlinePayment && (priceCents == null || priceCents < 0)) {
      throw new BookingRuleAnswerError("This service does not have a bookable price. Contact us to schedule.");
    }
    const needsPayment = Boolean(input.onlinePayment && priceCents && priceCents > 0);
    if (needsPayment && !input.onlinePayment?.checkoutSupported) {
      throw new BookingRuleAnswerError("Reload the booking page to use the current checkout.");
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

    const requirements=resolveBookingRequirements(service,await listBookingDocuments(siteId));
    validateBookingRequirementsRevision(requirements,input.bookingRequirementsRevision);
    if (requirements.requirePolicy && !input.policyAccepted) throw new Error("Please agree to the Booking Terms & Conditions before booking.");
    const intakeResponse = requirements.bookingRules == null ? input.intakeResponse : validateBookingRuleAnswers(requirements.rules,input.intakeAnswers,input);

    const offeredSlots = await nativeSchedulingAdapter.getAvailableSlots(input.serviceId, input.startsAt, {
      siteId,
      tierId,
      durationMinutes: input.durationMinutes,
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

    const endsAt = matchingSlot.endsAt;
    if (packageSnapshot?.unlimitedDuration) packageSnapshot.durationMinutes = (endsAt.getTime() - input.startsAt.getTime()) / 60000;
    const hasRichTerms = requirements.rules.some(rule => rule.richText);
    const renderedTerms = renderBookingTerms(requirements.rules, bookingTermsValues({
      serviceName: service.name, package: packageSnapshot, priceCents: servicePriceCents(service), durationMinutes: service.durationMinutes,
      startsAt: input.startsAt, timezone: (await getSiteSettingsForSite(siteId)).timezone,
      customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone
    }));
    if (hasRichTerms && input.acceptedTerms !== renderedTerms.text) throw new BookingRuleAnswerError("The booking details changed. Review and accept the updated terms before booking.");
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

          const currentService=await tx.service.findFirst({where:{id:service.id,siteId}});
          if (!currentService || !currentService.isActive) throw new Error("That service is not available.");
          if (JSON.stringify(currentService.sessionOffering) !== JSON.stringify(service.sessionOffering)) throw new BookingRuleAnswerError("The session packages changed. Reload and review the current price before booking.");
          const currentRequirements=resolveBookingRequirements(currentService,await listBookingDocuments(siteId,tx));
          if (currentRequirements.revision !== requirements.revision) throw new BookingRuleAnswerError("The booking form or terms changed. Reload and review them before booking.");
          const clientId = await upsertPublicClient(tx, {
            siteId: service.siteId,
            email: input.customerEmail,
            name: input.customerName,
            phone: input.customerPhone,
            companyName: input.customerCompany,
            serviceId: service.id
          });

          const booking = await tx.booking.create({
            data: {
              siteId: service.siteId,
              clientId,
              serviceId: input.serviceId,
              priceCents,
              ...(packageSnapshot ? { packageSnapshot: packageSnapshot as Prisma.InputJsonValue } : service.pricingType === "HOURLY" && service.hourlyRate ? { packageSnapshot: { tierId: "hourly", name: service.name, durationMinutes: service.durationMinutes, priceCents: servicePriceCents(service), coverage: [], extras: [], pricingType: "HOURLY", hourlyRate: { id: service.hourlyRate.id, name: service.hourlyRate.name, amountCents: service.hourlyRate.amountCents } } } : {}),
              sessionName: service.name,
              sessionLocation: input.sessionLocation ?? "",
              staffId: selectedStaff?.id,
              startsAt: input.startsAt,
              endsAt,
              customerName: input.customerName,
              customerEmail: input.customerEmail.toLowerCase(),
              customerPhone: input.customerPhone,
              notes: input.notes,
              intakeResponse,
              bookingRequirementsSnapshot: {
                documents: requirements.documents,
                rules: requirements.rules,
                renderedTerms,
                answers: requirements.bookingRules ? input.intakeAnswers ?? {} : {},
                policyAccepted: Boolean(input.policyAccepted),
                acceptedAt: input.policyAccepted && requirements.policyText ? new Date().toISOString() : null,
                ...(input.photoMarketingConsent === undefined ? {} : { photoMarketingConsent: input.photoMarketingConsent })
              },
              policyAccepted: Boolean(input.policyAccepted),
              status: input.status || (service.requestOnly || needsPayment ? BookingStatus.PENDING : BookingStatus.CONFIRMED),
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
          const paymentToken = needsPayment ? generateBillingPublicToken() : undefined;
          if (paymentToken && priceCents != null) {
            await tx.billingDocument.create({
              data: {
                siteId,
                clientId,
                bookingId: booking.id,
                bookingApprovalRequired: service.requestOnly,
                publicMemo: service.requestOnly ? "Your request was approved. Complete payment to confirm your booking." : undefined,
                documentNumber: `BK-${booking.id}`,
                publicAccessToken: paymentToken,
                status: service.requestOnly ? "DRAFT" : "SENT",
                dueAt: service.requestOnly ? undefined : new Date(Date.now() + 15 * 60 * 1000),
                customerName: booking.customerName,
                customerEmail: booking.customerEmail,
                subtotalCents: priceCents,
                totalCents: priceCents,
                lineItems: { create: { description: packageSnapshot?.name || service.name, unitPriceCents: priceCents, lineTotalCents: priceCents } }
              }
            });
          }
          return { ...booking, paymentToken: service.requestOnly ? undefined : paymentToken, paymentAfterApproval: service.requestOnly && needsPayment };
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

    if (booking.paymentToken) return booking;

    try {
      await queueBookingCreatedEmails({
        ...booking,
        service
      });
    } catch (error) {
      console.error("[email:booking-failed]", error);
    }

    return booking;
  }
};
