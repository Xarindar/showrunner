import { EmailOutboxStatus, EmailProviderEventType, EmailSubscriberStatus, EmailSuppressionScope, Prisma } from "@prisma/client";
import { recordFromUnknown } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import type { ProviderEventInput } from "./types";

function eventTimestamp() {
  return new Date();
}

function providerFailureReason(eventType: EmailProviderEventType) {
  if (eventType === EmailProviderEventType.BOUNCED) return "Provider bounce.";
  if (eventType === EmailProviderEventType.COMPLAINED) return "Provider complaint.";
  if (eventType === EmailProviderEventType.UNSUBSCRIBED) return "Provider unsubscribe.";
  if (eventType === EmailProviderEventType.DELIVERY_DELAYED) return "Provider delivery delayed.";
  return "";
}

async function suppressRecipient(input: {
  email: string;
  eventType: EmailProviderEventType;
  now: Date;
  siteId: string;
  subscriberId: string | null;
}) {
  const complaint = input.eventType === EmailProviderEventType.COMPLAINED;
  const bounced = input.eventType === EmailProviderEventType.BOUNCED;
  const reason = providerFailureReason(input.eventType);
  const scope = bounced ? EmailSuppressionScope.ALL : EmailSuppressionScope.MARKETING;

  if (input.subscriberId) {
    await prisma.emailSubscriber.update({
      where: { id: input.subscriberId },
      data: {
        status: bounced ? EmailSubscriberStatus.BOUNCED : EmailSubscriberStatus.UNSUBSCRIBED,
        unsubscribedAt: complaint || input.eventType === EmailProviderEventType.UNSUBSCRIBED ? input.now : undefined
      }
    });
  }

  await prisma.suppressionListEntry.upsert({
    where: { siteId_email: { siteId: input.siteId, email: input.email } },
    update: {
      scope,
      reason,
      source: "provider"
    },
    create: {
      siteId: input.siteId,
      email: input.email,
      scope,
      reason,
      source: "provider"
    }
  });
}

export async function recordProviderEvent(input: ProviderEventInput) {
  if (!input.providerMessageId.trim()) {
    throw new Error("Provider message id is required.");
  }

  const eventKey = input.eventKey || `${input.providerMessageId}:${input.eventType}`;
  const outbox = await prisma.emailOutbox.findFirst({
    where: { providerMessageId: input.providerMessageId },
    orderBy: { createdAt: "desc" }
  });
  const siteId = outbox?.siteId || (await getCurrentSiteId());
  const now = eventTimestamp();

  try {
    await prisma.emailProviderEvent.create({
      data: {
        siteId,
        eventKey,
        outboxId: outbox?.id,
        providerMessageId: input.providerMessageId,
        eventType: input.eventType,
        providerPayload: recordFromUnknown(input.payload) as Prisma.InputJsonObject
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }

  if (!outbox) return;

  if (input.eventType === EmailProviderEventType.DELIVERED) {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: { deliveredAt: now, lastError: "", status: EmailOutboxStatus.SENT }
    });
    return;
  }

  if (input.eventType === EmailProviderEventType.DELIVERY_DELAYED) {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: { lastError: providerFailureReason(input.eventType) }
    });
    return;
  }

  if (input.eventType === EmailProviderEventType.BOUNCED || input.eventType === EmailProviderEventType.COMPLAINED) {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data:
        input.eventType === EmailProviderEventType.BOUNCED
          ? { bouncedAt: now, lastError: providerFailureReason(input.eventType), status: EmailOutboxStatus.FAILED }
          : { complainedAt: now, lastError: providerFailureReason(input.eventType), status: EmailOutboxStatus.FAILED }
    });

    await suppressRecipient({
      email: outbox.recipientEmail,
      eventType: input.eventType,
      now,
      siteId: outbox.siteId,
      subscriberId: outbox.subscriberId
    });
    return;
  }

  if (input.eventType === EmailProviderEventType.UNSUBSCRIBED) {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: { lastError: providerFailureReason(input.eventType) }
    });

    await suppressRecipient({
      email: outbox.recipientEmail,
      eventType: input.eventType,
      now,
      siteId: outbox.siteId,
      subscriberId: outbox.subscriberId
    });
  }
}
