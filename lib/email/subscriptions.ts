import crypto from "node:crypto";
import { EmailListMembershipStatus, EmailSubscriberStatus, EmailSuppressionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "./shared";

type SubscribeInput = {
  email: string;
  name?: string;
  listId?: string;
  clientId?: string;
  consentSource: string;
};

function unsubscribeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function getDefaultListId() {
  const list = await prisma.emailSubscriptionList.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: "asc" }
  });
  return list?.id;
}

export async function subscribeToList(input: SubscribeInput) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Email is required.");

  const listId = input.listId || (await getDefaultListId());
  const now = new Date();
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { email },
    update: {
      name: input.name?.trim() || undefined,
      clientId: input.clientId || undefined,
      status: EmailSubscriberStatus.ACTIVE,
      consentSource: input.consentSource,
      consentedAt: now,
      unsubscribedAt: null
    },
    create: {
      email,
      name: input.name?.trim() || "",
      clientId: input.clientId,
      status: EmailSubscriberStatus.ACTIVE,
      consentSource: input.consentSource,
      consentedAt: now,
      unsubscribeToken: unsubscribeToken()
    }
  });

  if (listId) {
    await prisma.emailListMembership.upsert({
      where: {
        subscriberId_listId: {
          subscriberId: subscriber.id,
          listId
        }
      },
      update: {
        status: EmailListMembershipStatus.ACTIVE,
        leftAt: null
      },
      create: {
        subscriberId: subscriber.id,
        listId,
        status: EmailListMembershipStatus.ACTIVE
      }
    });
  }

  await prisma.suppressionListEntry.deleteMany({
    where: {
      email,
      scope: EmailSuppressionScope.MARKETING
    }
  });

  return subscriber;
}

export async function unsubscribeByToken(token: string) {
  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { unsubscribeToken: token },
    include: { memberships: true }
  });

  if (!subscriber) return null;

  const now = new Date();
  await prisma.$transaction([
    prisma.emailSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: EmailSubscriberStatus.UNSUBSCRIBED,
        unsubscribedAt: now
      }
    }),
    prisma.emailListMembership.updateMany({
      where: { subscriberId: subscriber.id },
      data: {
        status: EmailListMembershipStatus.UNSUBSCRIBED,
        leftAt: now
      }
    }),
    prisma.suppressionListEntry.upsert({
      where: { email: subscriber.email },
      update: {
        scope: EmailSuppressionScope.MARKETING,
        reason: "Unsubscribed.",
        source: "unsubscribe"
      },
      create: {
        email: subscriber.email,
        scope: EmailSuppressionScope.MARKETING,
        reason: "Unsubscribed.",
        source: "unsubscribe"
      }
    })
  ]);

  return subscriber;
}
