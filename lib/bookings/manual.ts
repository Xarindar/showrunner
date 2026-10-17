import "server-only";
import { randomUUID } from "node:crypto";
import { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertPublicClient } from "@/lib/clients/public-client";
import { blockoutConflictWhere, getBufferedWindow } from "@/lib/bookings/conflicts";
import { listGoogleBusyWindows } from "@/lib/scheduling/google-calendar";
import { selectSessionPackage } from "@/lib/scheduling/session-offering";

// Manual sessions use an agreed time, independent of public booking hours.
// They still reserve staff/resources and respect calendar conflicts and buffers.
export async function checkManualSessionTime(tx: Prisma.TransactionClient, input: {
  siteId: string; startsAt: Date; endsAt: Date; staffId?: string | null;
  resourceIds: string[]; bufferBeforeMinutes: number; bufferAfterMinutes: number;
  excludeBookingId?: string;
}) {
  const window = getBufferedWindow(input.startsAt, input.endsAt, input.bufferBeforeMinutes, input.bufferAfterMinutes);
  const [bookings, block] = await Promise.all([
    // Scheduling validation caps each buffer at one day; include that margin
    // before comparing both bookings' exact buffered windows.
    tx.booking.findMany({ where: { siteId: input.siteId, status: { not: BookingStatus.CANCELED },
      startsAt: { lt: new Date(window.bufferedEnd.getTime() + 86400000) },
      endsAt: { gt: new Date(window.bufferedStart.getTime() - 86400000) },
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}) },
      include: { service: { include: { resourceAssignments: true } }, resources: true } }),
    tx.blockedTime.findFirst({ where: blockoutConflictWhere(input) })
  ]);
  const conflict = bookings.some(booking => {
    const sharesStaff = !input.staffId || !booking.staffId || input.staffId === booking.staffId;
    const sharesResource = [...booking.resources, ...booking.service.resourceAssignments].some(resource => input.resourceIds.includes(resource.resourceId));
    if (!sharesStaff && !sharesResource) return false;
    const other = getBufferedWindow(booking.startsAt, booking.endsAt, booking.service.bufferBeforeMinutes, booking.service.bufferAfterMinutes);
    return window.bufferedStart < other.bufferedEnd && window.bufferedEnd > other.bufferedStart;
  });
  if (block || conflict) throw new Error("That time overlaps another session or blocked time. Choose another time.");
}

export async function createManualSession(input: {
  siteId: string; timezone: string; serviceId?: string; name: string; startsAt: Date;
  durationMinutes: number; priceCents: number; location: string; staffId?: string;
  customerName: string; customerEmail: string; customerPhone?: string; notes: string;
  status: "PENDING" | "CONFIRMED";
  tierId?: string; addOnIds?: string[];
}) {
  if (!Number.isFinite(input.startsAt.getTime()) || input.startsAt <= new Date()) throw new Error("Choose a future date and time.");
  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60000);
  const selectedService = input.serviceId ? await prisma.service.findFirst({ where: { id: input.serviceId, siteId: input.siteId, isActive: true, isOneOff: false } }) : null;
  if (input.serviceId && !selectedService) throw new Error("Choose an available session type.");
  const buffered = getBufferedWindow(input.startsAt, endsAt, selectedService?.bufferBeforeMinutes || 0, selectedService?.bufferAfterMinutes || 0);
  const busy = await listGoogleBusyWindows({ siteId: input.siteId, timeZone: input.timezone,
    staffIds: input.staffId ? [input.staffId] : [], start: buffered.bufferedStart, end: buffered.bufferedEnd });
  if (busy.busy.some(window => window.start < buffered.bufferedEnd && window.end > buffered.bufferedStart)) throw new Error("That time is busy on your connected calendar.");
  return prisma.$transaction(async tx => {
    let service = input.serviceId ? await tx.service.findFirst({ where: { id: input.serviceId, siteId: input.siteId, isActive: true, isOneOff: false }, include: { staffAssignments: true, resourceAssignments: true } }) : null;
    if (input.serviceId && !service) throw new Error("Choose an available session type.");
    const packageSnapshot = selectSessionPackage(service?.sessionOffering, input.tierId, input.addOnIds);
    if (input.staffId && !await tx.staffMember.findFirst({ where: { id: input.staffId, siteId: input.siteId, isActive: true } })) throw new Error("Choose an available team member.");
    if (service?.staffAssignments.length && !service.staffAssignments.some(assignment => assignment.staffId === input.staffId)) throw new Error("Choose a team member assigned to this session type.");
    const resourceIds = service?.resourceAssignments.map(assignment => assignment.resourceId) || [];
    await checkManualSessionTime(tx, { siteId: input.siteId, startsAt: input.startsAt, endsAt, staffId: input.staffId, resourceIds,
      bufferBeforeMinutes: service?.bufferBeforeMinutes || 0, bufferAfterMinutes: service?.bufferAfterMinutes || 0 });
    if (!service) service = await tx.service.create({ data: { siteId: input.siteId, slug: `private-${randomUUID()}`, name: input.name,
      durationMinutes: input.durationMinutes, priceCents: input.priceCents, location: input.location, isActive: false, isOneOff: true }, include: { staffAssignments: true, resourceAssignments: true } });
    const clientId = await upsertPublicClient(tx, { siteId: input.siteId, name: input.customerName, email: input.customerEmail, phone: input.customerPhone });
    return tx.booking.create({ data: { siteId: input.siteId, serviceId: service.id, clientId, isManual: true,
      sessionName: input.name, sessionLocation: input.location, priceCents: input.priceCents,
      ...(packageSnapshot ? { packageSnapshot: { ...packageSnapshot, priceCents: input.priceCents, durationMinutes: input.durationMinutes } } : {}),
      customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone,
      staffId: input.staffId || null, startsAt: input.startsAt, endsAt, notes: input.notes, status: input.status,
      resources: { create: resourceIds.map(resourceId => ({ resourceId, siteId: input.siteId })) } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
