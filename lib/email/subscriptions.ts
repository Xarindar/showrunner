import crypto from "node:crypto";
import { EmailListMembershipStatus, EmailSubscriberStatus, EmailSuppressionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { normalizeEmail } from "./shared";

type SubscribeInput = {
  email: string;
  name?: string;
  listId?: string;
  clientId?: string;
  consentSource: string;
  siteId?: string;
  skipDefaultList?: boolean;
};

function unsubscribeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function getDefaultListId(siteId: string) {
  const list = await prisma.emailSubscriptionList.findFirst({
    where: { siteId, isDefault: true },
    orderBy: { createdAt: "asc" }
  });
  return list?.id;
}

export async function subscribeToList(input: SubscribeInput) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Email is required.");

  const siteId = input.siteId || (await getCurrentSiteId());
  const listId = input.skipDefaultList ? undefined : input.listId || (await getDefaultListId(siteId));
  const now = new Date();
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { siteId_email: { siteId, email } },
    update: {
      name: input.name?.trim() || undefined,
      clientId: input.clientId || undefined,
      status: EmailSubscriberStatus.ACTIVE,
      consentSource: input.consentSource,
      consentedAt: now,
      unsubscribedAt: null
    },
    create: {
      siteId,
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
      siteId,
      email,
      scope: EmailSuppressionScope.MARKETING
    }
  });

  return subscriber;
}

export async function unsubscribeByToken(token: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { siteId_unsubscribeToken: { siteId: currentSiteId, unsubscribeToken: token } },
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
      where: { siteId_email: { siteId: subscriber.siteId, email: subscriber.email } },
      update: {
        scope: EmailSuppressionScope.MARKETING,
        reason: "Unsubscribed.",
        source: "unsubscribe"
      },
      create: {
        siteId: subscriber.siteId,
        email: subscriber.email,
        scope: EmailSuppressionScope.MARKETING,
        reason: "Unsubscribed.",
        source: "unsubscribe"
      }
    })
  ]);

  return subscriber;
}
