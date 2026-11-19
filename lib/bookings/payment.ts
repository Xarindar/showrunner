import "server-only";

import type { PaymentProvider } from "@prisma/client";

import { publicBillingUrl } from "@/lib/billing/documents";
import { publicAppBaseUrl } from "@/lib/env";
import { createPaymentCheckoutSessionForBillingDocument } from "@/lib/payments/checkout";
import { PaymentProviderUnavailable, resolvePaymentProviderForSite } from "@/lib/payments/registry";
import { prisma } from "@/lib/prisma";

export const onlineBookingUnavailable = "Online booking is unavailable. Contact us to schedule.";

export async function bookingPaymentProvider(siteId: string, provider?: PaymentProvider) {
  try {
    return await resolvePaymentProviderForSite(siteId, provider, true);
  } catch (error) {
    if (error instanceof PaymentProviderUnavailable) return null;
    throw error;
  }
}

export function bookingPaymentUrl(token: string) {
  return publicBillingUrl(publicAppBaseUrl(), token);
}

export async function startBookingCheckout(token: string) {
  const returnUrl = bookingPaymentUrl(token);
  try {
    const document = await findBookingPayment(token);
    if (!document?.booking || document.status !== "SENT" || document.booking.status !== "PENDING" || document.booking.startsAt <= new Date()) {
      return returnUrl;
    }
    const attempt = document.payments[0];
    const provider = await bookingPaymentProvider(document.siteId, attempt?.externalCheckoutSession ? attempt.provider : undefined);
    if (!provider) return `${returnUrl}?checkout=unavailable`;

    let checkoutUrl;
    if (attempt?.externalCheckoutSession) {
      const reference = attempt.provider === "SQUARE" ? attempt.externalPaymentId || attempt.externalCheckoutSession : attempt.externalCheckoutSession;
      if (reference !== document.paymentExternalReference) throw new Error("Checkout link is not ready.");
      checkoutUrl = document.checkoutUrl;
    } else {
      ({ checkoutUrl } = await createPaymentCheckoutSessionForBillingDocument({
        amountCents: document.totalCents,
        billingDocumentId: document.id,
        siteId: document.siteId,
        provider
      }));
    }

    const url = new URL(checkoutUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Checkout link is unavailable.");
    return checkoutUrl;
  } catch (error) {
    console.error("[booking:checkout]", error instanceof Error ? error.name : "unknown");
    return `${returnUrl}?checkout=error`;
  }
}

export async function releaseUnpaidBookingHolds(siteId: string, now = new Date()) {
  await prisma.booking.updateMany({
    where: {
      siteId,
      status: "PENDING",
      billingDocument: {
        status: "SENT",
        dueAt: { lte: now },
        // shortcut: keep active hosted checkouts reserved until the provider reports a terminal state or staff cancels.
        payments: {
          none: {
            status: "PENDING",
            OR: [
              { externalCheckoutSession: { not: null } },
              { createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) } }
            ]
          }
        }
      }
    },
    data: { status: "CANCELED", cancellationReason: "The checkout hold expired." }
  });
}

export async function findBookingPayment(token: string) {
  if (!/^bdoc_[A-Za-z0-9_-]{32}$/.test(token)) return null;
  return prisma.billingDocument.findFirst({
    where: { publicAccessToken: token, bookingId: { not: null }, status: { not: "DRAFT" } },
    include: {
      site: { select: { name: true, settings: { select: { timezone: true } } } },
      booking: { select: { id: true, customerEmail: true, status: true, startsAt: true, sessionName: true } },
      payments: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}
