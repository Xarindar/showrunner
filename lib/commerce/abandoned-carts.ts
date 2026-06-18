import { CartStatus, EmailCategory, EmailSubscriberStatus } from "@prisma/client";
import { publicAppBaseUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite } from "@/lib/site";
import { queueEmail } from "@/lib/email/queue";
import { createCartRecoveryToken } from "./cart-recovery-token";

const DEFAULT_IDLE_MINUTES = 24 * 60;
const MAX_CARTS_PER_SITE = 100;
const MAX_RECOVERY_ATTEMPTS = 3;

type AbandonedCart = {
  id: string;
  siteId: string;
  status: CartStatus;
  abandonedAt: Date | null;
  recoveryAttemptCount: number;
  customerEmail: string | null;
  currency: string;
  totalCents: number;
  expiresAt: Date | null;
  client: { email: string; name: string } | null;
  items: {
    quantity: number;
    product: { name: string };
    variant: { isDefault: boolean; name: string } | null;
  }[];
};

export type AbandonedCartSweepResult = {
  sitesChecked: number;
  cartsChecked: number;
  queued: number;
  skipped: number;
  failed: number;
};

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
}

function itemLabel(item: AbandonedCart["items"][number]) {
  const variant = item.variant && !item.variant.isDefault ? ` - ${item.variant.name}` : "";
  return `${item.quantity} x ${item.product.name}${variant}`;
}

function itemSummary(cart: AbandonedCart) {
  return cart.items.map(itemLabel).join("\n").slice(0, 2000);
}

async function activeMarketingSubscriber(input: { email: string; siteId: string }) {
  return prisma.emailSubscriber.findFirst({
    where: {
      siteId: input.siteId,
      email: input.email,
      status: EmailSubscriberStatus.ACTIVE,
      consentedAt: { not: null }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function markRecoverySkipped(cartId: string, reason: string) {
  await prisma.cart.update({
    where: { id: cartId },
    data: {
      recoveryLastError: reason.slice(0, 1000)
    }
  });
}

async function claimCartForRecovery(cart: AbandonedCart, now: Date) {
  const claimed = await prisma.cart.updateMany({
    where: {
      id: cart.id,
      siteId: cart.siteId,
      status: CartStatus.OPEN,
      recoveryEmailQueuedAt: null,
      recoveryAttemptCount: cart.recoveryAttemptCount
    },
    data: {
      abandonedAt: cart.abandonedAt ?? now,
      recoveryAttemptCount: { increment: 1 },
      recoveryLastError: ""
    }
  });

  return claimed.count === 1;
}

async function queueRecoveryEmail(cart: AbandonedCart) {
  const email = (cart.customerEmail || cart.client?.email || "").trim().toLowerCase();
  if (!email) {
    await markRecoverySkipped(cart.id, "no_cart_email");
    return "skipped";
  }

  const subscriber = await activeMarketingSubscriber({ siteId: cart.siteId, email });
  if (!subscriber) {
    await markRecoverySkipped(cart.id, "marketing_consent_required");
    return "skipped";
  }

  const settings = await getSiteSettingsForSite(cart.siteId);
  const token = createCartRecoveryToken({ cartId: cart.id, siteId: cart.siteId, expiresAt: cart.expiresAt });
  const cartUrl = `${publicAppBaseUrl()}/cart/recover?token=${encodeURIComponent(token)}`;
  const unsubscribeUrl = `${publicAppBaseUrl()}/unsubscribe/${encodeURIComponent(subscriber.unsubscribeToken)}`;

  await queueEmail({
    siteId: cart.siteId,
    templateKey: "cart.recovery.customer",
    recipientEmail: subscriber.email,
    recipientName: subscriber.name || cart.client?.name || "",
    category: EmailCategory.MARKETING,
    relatedType: "cart",
    relatedId: cart.id,
    tokens: {
      businessName: settings.businessName,
      customerEmail: subscriber.email,
      customerName: subscriber.name || cart.client?.name || "there",
      cartTotal: formatMoney(cart.totalCents, cart.currency),
      cartUrl,
      itemSummary: itemSummary(cart),
      unsubscribeUrl
    },
    subscriberId: subscriber.id,
    unsubscribeUrl,
    idempotencyKey: `cart:${cart.id}:recovery:customer`
  });

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      recoveryEmailQueuedAt: new Date(),
      recoveryLastError: ""
    }
  });

  return "queued";
}

export async function sweepAbandonedCarts(now = new Date()): Promise<AbandonedCartSweepResult> {
  const result: AbandonedCartSweepResult = {
    sitesChecked: 0,
    cartsChecked: 0,
    queued: 0,
    skipped: 0,
    failed: 0
  };
  const idleMinutes = positiveIntegerEnv("ABANDONED_CART_IDLE_MINUTES", DEFAULT_IDLE_MINUTES);
  const idleBefore = new Date(now.getTime() - idleMinutes * 60 * 1000);
  const sites = await prisma.site.findMany({ select: { id: true } });

  for (const site of sites) {
    result.sitesChecked += 1;
    const settings = await getSiteSettingsForSite(site.id);
    if (!settings.enabledModuleIds.includes("products")) continue;

    const carts = await prisma.cart.findMany({
      where: {
        siteId: site.id,
        recoveryEmailQueuedAt: null,
        recoveryAttemptCount: { lt: MAX_RECOVERY_ATTEMPTS },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              {
                status: CartStatus.OPEN,
                updatedAt: { lte: idleBefore }
              },
              {
                status: CartStatus.OPEN,
                abandonedAt: { not: null }
              }
            ]
          }
        ],
        items: { some: {} }
      },
      include: {
        client: { select: { email: true, name: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { isDefault: true, name: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { updatedAt: "asc" },
      take: MAX_CARTS_PER_SITE
    });

    result.cartsChecked += carts.length;

    for (const cart of carts) {
      try {
        const claimed = await claimCartForRecovery(cart, now);
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        const status = await queueRecoveryEmail(cart);
        if (status === "queued") {
          result.queued += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        result.failed += 1;
        await prisma.cart.update({
          where: { id: cart.id },
          data: { recoveryLastError: cleanError(error) }
        });
      }
    }
  }

  return result;
}
