import "server-only";

import { BookingStatus } from "@prisma/client";
import { queueBookingCreatedEmails, queueBookingStatusEmail, queueFormSubmittedEmail, queueOrderReceiptEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

type CommunicationsEventEnvelope = {
  metadata?: unknown;
  relatedId?: string;
  siteId?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function queueBookingCreated(envelope: CommunicationsEventEnvelope) {
  if (!envelope.relatedId) return;
  const siteId = envelope.siteId || (await getCurrentSiteId());

  const booking = await prisma.booking.findFirst({
    where: { id: envelope.relatedId, siteId },
    include: { service: true }
  });

  if (!booking) return;
  await queueBookingCreatedEmails(booking);
}

async function queueBookingCanceled(envelope: CommunicationsEventEnvelope) {
  if (!envelope.relatedId) return;
  const siteId = envelope.siteId || (await getCurrentSiteId());

  const booking = await prisma.booking.findFirst({
    where: { id: envelope.relatedId, siteId, status: BookingStatus.CANCELED },
    include: { service: true }
  });

  if (!booking) return;
  await queueBookingStatusEmail(booking);
}

async function queueFormSubmitted(envelope: CommunicationsEventEnvelope) {
  if (!envelope.relatedId) return;
  const siteId = envelope.siteId || (await getCurrentSiteId());

  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: envelope.relatedId,
      form: { siteId }
    },
    include: { form: true }
  });

  if (!submission) return;
  await queueFormSubmittedEmail(
    {
      id: submission.form.id,
      siteId: submission.form.siteId,
      name: submission.form.name,
      notificationEmail: submission.form.notificationEmail
    },
    {
      id: submission.id,
      submitterName: submission.submitterName,
      submitterEmail: submission.submitterEmail,
      data: asRecord(submission.data)
    }
  );
}

async function queueOrderPaid(envelope: CommunicationsEventEnvelope) {
  if (!envelope.relatedId) return;
  const siteId = envelope.siteId || (await getCurrentSiteId());

  const order = await prisma.order.findFirst({
    where: { id: envelope.relatedId, siteId }
  });

  if (!order) return;
  await queueOrderReceiptEmail(order);
}

export async function queueCommunicationsEventEmails(eventName: string, envelope: CommunicationsEventEnvelope) {
  try {
    if (eventName === "booking.created") {
      await queueBookingCreated(envelope);
      return;
    }

    if (eventName === "booking.canceled") {
      await queueBookingCanceled(envelope);
      return;
    }

    if (eventName === "form.submitted") {
      await queueFormSubmitted(envelope);
      return;
    }

    if (eventName === "order.paid") {
      await queueOrderPaid(envelope);
    }
  } catch (error) {
    console.error("[communications:auto-send]", eventName, error);
  }
}
