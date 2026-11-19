import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { paypalPaymentGateway } from "@/lib/commerce/paypal";
import { stripePaymentGateway } from "@/lib/commerce/stripe";
import { squarePaymentGateway } from "@/lib/commerce/square";
import { isSquareCredentialUsable } from "@/lib/payments/connect/square-refresh";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import type { PaymentGateway } from "./types";

export function getPaymentGateway(provider: PaymentProvider = PaymentProvider.STRIPE): PaymentGateway {
  if (provider === PaymentProvider.STRIPE) return stripePaymentGateway;
  if (provider === PaymentProvider.SQUARE) return squarePaymentGateway;
  if (provider === PaymentProvider.PAYPAL) return paypalPaymentGateway;

  throw new Error(`${provider} payment gateway is not implemented yet.`);
}

export class PaymentProviderUnavailable extends Error {}

function canSettleOnlineBooking(siteId: string, provider: PaymentProvider, metadata: unknown, encryptedWebhookSecret: string) {
  const config = metadata as { environment?: string; webhookId?: string; keyMode?: string } | null;
  if (provider === PaymentProvider.PAYPAL) return config?.environment === "live" && Boolean(config.webhookId);
  if (provider === PaymentProvider.SQUARE) return config?.environment === "production";
  return provider === PaymentProvider.STRIPE && config?.keyMode === "live" &&
    Boolean(encryptedWebhookSecret || (siteId === DEFAULT_SITE_ID && process.env.STRIPE_WEBHOOK_SECRET));
}

export async function resolvePaymentProviderForSite(siteId: string, provider?: PaymentProvider, onlineBooking = false) {
  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { checkoutProvider: true }
  });
  const preferredProvider = provider || settings?.checkoutProvider || PaymentProvider.STRIPE;
  const supported = preferredProvider === PaymentProvider.STRIPE || preferredProvider === PaymentProvider.SQUARE || preferredProvider === PaymentProvider.PAYPAL;
  if (!supported && !onlineBooking) return preferredProvider;
  if (!supported && provider) throw new PaymentProviderUnavailable("Connect a payment provider before creating hosted checkout.");
  const selectedProvider = supported ? preferredProvider : PaymentProvider.STRIPE;

  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: selectedProvider,
        siteId
      }
    },
    select: {
      encryptedAccessToken: true,
      externalAccountId: true,
      expiresAt: true,
      merchantId: true,
      encryptedWebhookSecret: true,
      metadata: true,
      status: true
    }
  });
  const connected =
    (selectedProvider === PaymentProvider.SQUARE
      ? isSquareCredentialUsable(credential)
      : credential?.status === PaymentGatewayConnectionStatus.CONNECTED) &&
    (selectedProvider === PaymentProvider.STRIPE
      ? Boolean(credential?.externalAccountId.trim())
      : Boolean(credential?.merchantId.trim()));

  if (connected && credential && (!onlineBooking || canSettleOnlineBooking(siteId, selectedProvider, credential.metadata, credential.encryptedWebhookSecret))) return selectedProvider;
  if (provider) throw new PaymentProviderUnavailable(`${selectedProvider} checkout is not connected for this site.`);

  const fallbackCredentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      siteId,
      status: { in: [PaymentGatewayConnectionStatus.CONNECTED, PaymentGatewayConnectionStatus.ERROR] },
      OR: [
        { provider: PaymentProvider.STRIPE, externalAccountId: { not: "" } },
        { provider: { in: [PaymentProvider.SQUARE, PaymentProvider.PAYPAL] }, merchantId: { not: "" } }
      ]
    },
    orderBy: { connectedAt: "desc" },
    select: {
      encryptedAccessToken: true,
      expiresAt: true,
      metadata: true,
      provider: true,
      encryptedWebhookSecret: true,
      status: true
    }
  });
  const connectedFallback = fallbackCredentials.find((candidate) =>
    (!onlineBooking || canSettleOnlineBooking(siteId, candidate.provider, candidate.metadata, candidate.encryptedWebhookSecret)) &&
    (candidate.provider === PaymentProvider.SQUARE
      ? isSquareCredentialUsable(candidate)
      : candidate.status === PaymentGatewayConnectionStatus.CONNECTED)
  );

  if (connectedFallback) return connectedFallback.provider;
  throw new PaymentProviderUnavailable("Connect a payment provider before creating hosted checkout.");
}
