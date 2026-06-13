import "server-only";

import { BookingStatus, Prisma } from "@prisma/client";

type ConflictResource = {
  resourceId: string;
};

type ConflictService = {
  bufferAfterMinutes: number;
  bufferBeforeMinutes: number;
  name?: string;
  resourceAssignments?: ConflictResource[];
};

export type ConflictBooking = {
  customerName: string;
  endsAt: Date;
  id: string;
  service: ConflictService;
  staffId: string | null;
  startsAt: Date;
  resources: ConflictResource[];
};

export type BookingConflictWarning = {
  bookingId: string;
  conflictsWithBookingId: string;
  message: string;
};

export function getBufferedWindow(startsAt: Date, endsAt: Date, beforeMinutes: number, afterMinutes: number) {
  const bufferedStart = new Date(startsAt);
  bufferedStart.setMinutes(bufferedStart.getMinutes() - beforeMinutes);

  const bufferedEnd = new Date(endsAt);
  bufferedEnd.setMinutes(bufferedEnd.getMinutes() + afterMinutes);

  return { bufferedStart, bufferedEnd };
}

export function bookingConflictScopes(input: { resourceIds: string[]; staffId?: string | null }): Prisma.BookingWhereInput[] {
  const scopes: Prisma.BookingWhereInput[] = [];

  if (input.staffId) {
    scopes.push({ OR: [{ staffId: null }, { staffId: input.staffId }] });
  }
  if (input.resourceIds.length) {
    scopes.push({
      OR: [
        { resources: { some: { resourceId: { in: input.resourceIds } } } },
        { service: { resourceAssignments: { some: { resourceId: { in: input.resourceIds } } } } }
      ]
    });
  }

  return scopes;
}

export function bookingConflictWhere(input: {
  endsAt: Date;
  resourceIds: string[];
  siteId: string;
  staffId?: string | null;
  startsAt: Date;
  bufferAfterMinutes: number;
  bufferBeforeMinutes: number;
  excludeBookingId?: string;
}): Prisma.BookingWhereInput {
  const { bufferedStart, bufferedEnd } = getBufferedWindow(
    input.startsAt,
    input.endsAt,
    input.bufferBeforeMinutes,
    input.bufferAfterMinutes
  );
  const conflictScopes = bookingConflictScopes({ resourceIds: input.resourceIds, staffId: input.staffId });

  return {
    ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
    siteId: input.siteId,
    status: { not: BookingStatus.CANCELED },
    ...(conflictScopes.length ? { OR: conflictScopes } : {}),
    startsAt: { lt: bufferedEnd },
    endsAt: { gt: bufferedStart }
  };
}

export function blockoutConflictWhere(input: {
  endsAt: Date;
  resourceIds: string[];
  siteId: string;
  startsAt: Date;
  bufferAfterMinutes: number;
  bufferBeforeMinutes: number;
}): Prisma.BlockedTimeWhereInput {
  const { bufferedStart, bufferedEnd } = getBufferedWindow(
    input.startsAt,
    input.endsAt,
    input.bufferBeforeMinutes,
    input.bufferAfterMinutes
  );

  return {
    siteId: input.siteId,
    OR: input.resourceIds.length ? [{ resourceId: null }, { resourceId: { in: input.resourceIds } }] : [{ resourceId: null }],
    startsAt: { lt: bufferedEnd },
    endsAt: { gt: bufferedStart }
  };
}

function conflictsByStaff(left: ConflictBooking, right: ConflictBooking) {
  return Boolean(left.staffId && right.staffId && left.staffId === right.staffId);
}

function bookingResourceIds(booking: ConflictBooking) {
  return new Set([
    ...booking.resources.map((assignment) => assignment.resourceId),
    ...(booking.service.resourceAssignments || []).map((assignment) => assignment.resourceId)
  ]);
}

function sharedResourceIds(left: ConflictBooking, right: ConflictBooking) {
  const leftIds = bookingResourceIds(left);
  const rightIds = bookingResourceIds(right);
  return [...leftIds].filter((resourceId) => rightIds.has(resourceId));
}

function bufferedWindowsOverlap(left: ConflictBooking, right: ConflictBooking) {
  const leftWindow = getBufferedWindow(
    left.startsAt,
    left.endsAt,
    left.service.bufferBeforeMinutes,
    left.service.bufferAfterMinutes
  );
  const rightWindow = getBufferedWindow(
    right.startsAt,
    right.endsAt,
    right.service.bufferBeforeMinutes,
    right.service.bufferAfterMinutes
  );

  return leftWindow.bufferedStart < rightWindow.bufferedEnd && leftWindow.bufferedEnd > rightWindow.bufferedStart;
}

export function bookingConflictReasons(left: ConflictBooking, right: ConflictBooking) {
  if (!bufferedWindowsOverlap(left, right)) return [];

  const reasons: string[] = [];
  if (conflictsByStaff(left, right)) reasons.push("same staff");
  if (sharedResourceIds(left, right).length) reasons.push("shared resource");

  return reasons;
}

export function bookingConflictWarnings(bookings: ConflictBooking[]): BookingConflictWarning[] {
  const warnings: BookingConflictWarning[] = [];

  for (let leftIndex = 0; leftIndex < bookings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bookings.length; rightIndex += 1) {
      const left = bookings[leftIndex];
      const right = bookings[rightIndex];
      const reasons = bookingConflictReasons(left, right);
      if (!reasons.length) continue;

      warnings.push({
        bookingId: left.id,
        conflictsWithBookingId: right.id,
        message: `Conflicts with ${right.customerName} (${reasons.join(", ")}).`
      });
      warnings.push({
        bookingId: right.id,
        conflictsWithBookingId: left.id,
        message: `Conflicts with ${left.customerName} (${reasons.join(", ")}).`
      });
    }
  }

  return warnings;
}
