import { EmailProviderEventType, EmailSubscriberStatus, EmailSuppressionScope, Prisma } from "@prisma/client";
import { recordFromUnknown } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import type { ProviderEventInput } from "./types";

function eventTimestamp() {
  return new Date();
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
  const now = eventTimestamp();

  try {
    await prisma.emailProviderEvent.create({
      data: {
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
      data: { deliveredAt: now }
    });
    return;
  }

  if (input.eventType === EmailProviderEventType.BOUNCED || input.eventType === EmailProviderEventType.COMPLAINED) {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: input.eventType === EmailProviderEventType.BOUNCED ? { bouncedAt: now } : { complainedAt: now }
    });

    if (outbox.subscriberId) {
      await prisma.emailSubscriber.update({
        where: { id: outbox.subscriberId },
        data: {
          status: input.eventType === EmailProviderEventType.BOUNCED ? EmailSubscriberStatus.BOUNCED : EmailSubscriberStatus.UNSUBSCRIBED,
          unsubscribedAt: input.eventType === EmailProviderEventType.COMPLAINED ? now : undefined
        }
      });
    }

    const suppressionScope =
      input.eventType === EmailProviderEventType.BOUNCED ? EmailSuppressionScope.ALL : EmailSuppressionScope.MARKETING;

    await prisma.suppressionListEntry.upsert({
      where: { email: outbox.recipientEmail },
      update: {
        scope: suppressionScope,
        reason: input.eventType === EmailProviderEventType.BOUNCED ? "Provider bounce." : "Provider complaint.",
        source: "provider"
      },
      create: {
        email: outbox.recipientEmail,
        scope: suppressionScope,
        reason: input.eventType === EmailProviderEventType.BOUNCED ? "Provider bounce." : "Provider complaint.",
        source: "provider"
      }
    });
  }
}
