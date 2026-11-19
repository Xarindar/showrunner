import "server-only";
import { BookingStatus, type Prisma } from "@prisma/client";
import { publicBillingUrl } from "@/lib/billing/documents";
import { queueBillingDocumentEmail, queueBookingCreatedEmails, queueBookingStatusEmail } from "@/lib/email";
import { publicAppBaseUrl } from "@/lib/env";
import { emitModuleEvent } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";

type NotificationKind = "approval" | "confirmation";

export async function enqueueBookingPaymentNotification(tx: Prisma.TransactionClient, billingDocumentId: string, kind: NotificationKind) {
  const id = `${billingDocumentId}:${kind}`;
  await tx.bookingPaymentNotification.createMany({ data: { id, billingDocumentId, kind }, skipDuplicates: true });
}

export async function processBookingPaymentNotifications() {
  for (let index = 0; index < 20; index++) {
    let claimedId: string | undefined;
    try {
      const processed = await prisma.$transaction(async (tx) => {
        const [job] = await tx.$queryRaw<Array<{ id: string; kind: NotificationKind; billingDocumentId: string }>>`
          SELECT id, kind, "billingDocumentId" FROM "BookingPaymentNotification"
          WHERE "completedAt" IS NULL AND "nextAttemptAt" <= CURRENT_TIMESTAMP
          ORDER BY "nextAttemptAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
        `;
        if (!job) return false;
        claimedId = job.id;
        const document = await tx.billingDocument.findUniqueOrThrow({
          where: { id: job.billingDocumentId },
          include: { booking: { include: { service: true } } }
        });
        const booking = document.booking;
        if (job.kind === "approval" && booking?.status === BookingStatus.PENDING && document.status === "SENT" && document.publicAccessToken) {
          const paymentUrl = publicBillingUrl(publicAppBaseUrl(), document.publicAccessToken);
          await queueBillingDocumentEmail({
            document: { ...document, checkoutUrl: paymentUrl }, siteId: document.siteId, publicUrl: paymentUrl,
            idempotencyKey: `booking-payment:${document.id}:approved`, retryOnError: true
          });
        }
        if (job.kind === "confirmation" && booking) {
          if (booking.status === BookingStatus.CONFIRMED) {
            if (document.bookingApprovalRequired) await queueBookingStatusEmail(booking, BookingStatus.PENDING, { retryOnError: true });
            else await queueBookingCreatedEmails(booking, true);
          }
          const event = document.bookingApprovalRequired ? "booking.request.approved" : "booking.created";
          await emitModuleEvent(event, {
            idempotencyKey: `${event}:${booking.id}`, actorEmail: booking.customerEmail,
            metadata: { serviceId: booking.serviceId, startsAt: booking.startsAt.toISOString(), status: BookingStatus.CONFIRMED },
            relatedId: booking.id, relatedType: "booking", siteId: document.siteId
          }, tx);
        }
        await tx.bookingPaymentNotification.update({ where: { id: job.id }, data: { completedAt: new Date() } });
        return true;
      }, { timeout: 15_000 });
      if (!processed) return;
    } catch (error) {
      if (!claimedId) throw error;
      await prisma.bookingPaymentNotification.updateMany({
        where: { id: claimedId, completedAt: null },
        data: { nextAttemptAt: new Date(Date.now() + 60_000) }
      });
      console.error("[booking-payment:notification] retry scheduled");
    }
  }
}
