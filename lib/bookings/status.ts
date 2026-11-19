import "server-only";

import { BillingDocumentStatus, BookingStatus, Prisma } from "@prisma/client";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { bookingPaymentProvider } from "./payment";
import { enqueueBookingPaymentNotification } from "./payment-notifications";
import { queueBookingStatusEmail } from "@/lib/email";
import { emitModuleEvent } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

export async function updateBookingStatus(input: { bookingId: string; status: BookingStatus; siteId?: string; cancellationReason?: string }) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const current = await prisma.booking.findFirst({
    where: { id: input.bookingId, siteId },
    include: { service: true, billingDocument: true }
  });

  if (!current) throw new Error("Booking target not found.");

  const document = current.billingDocument;
  if (document && document.status !== BillingDocumentStatus.PAID && input.status === BookingStatus.CONFIRMED) {
    if (current.status !== BookingStatus.PENDING || document.status === BillingDocumentStatus.VOID || current.startsAt <= new Date()) {
      throw new Error("This booking can no longer be approved for payment.");
    }
    if (document.bookingApprovalRequired) {
      if (!await bookingPaymentProvider(siteId)) throw new Error("Connect a payment processor before approving this request.");
      await prisma.$transaction(async (tx) => {
        const changed = await tx.billingDocument.updateMany({
          where: { id: document.id, status: BillingDocumentStatus.DRAFT, booking: { status: BookingStatus.PENDING } },
          data: { status: BillingDocumentStatus.SENT }
        });
        if (changed.count) await snapshotBillingDocument(tx, document.id);
        const approved = await tx.billingDocument.findUniqueOrThrow({ where: { id: document.id } });
        if (approved.status === BillingDocumentStatus.SENT && approved.publicAccessToken) {
          await enqueueBookingPaymentNotification(tx, approved.id, "approval");
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return current;
    }
    throw new Error("The booking will be confirmed after the customer pays.");
  }
  if (document && document.status !== BillingDocumentStatus.PAID && input.status === BookingStatus.COMPLETED) {
    throw new Error("Only paid bookings can be completed.");
  }

  const update = (tx: Prisma.TransactionClient) => tx.booking.update({
    where: { id: current.id },
    data: { status: input.status, ...(input.status === BookingStatus.CANCELED && input.cancellationReason !== undefined ? { cancellationReason: input.cancellationReason } : {}) },
    include: { service: true }
  });
  const updated = document && input.status === BookingStatus.CANCELED ? await prisma.$transaction(async (tx) => {
    await tx.billingDocument.updateMany({
      where: { id: document.id, status: { not: BillingDocumentStatus.PAID } },
      data: { status: BillingDocumentStatus.VOID }
    });
    return update(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) : await update(prisma);

  await queueBookingStatusEmail(updated, current.status);

  if (current.status === BookingStatus.PENDING && updated.status === BookingStatus.CONFIRMED) {
    await emitModuleEvent("booking.request.approved", {
      siteId: updated.siteId,
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
      siteId: updated.siteId,
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
