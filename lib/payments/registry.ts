import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { paypalPaymentGateway } from "@/lib/commerce/paypal";
import { stripePaymentGateway } from "@/lib/commerce/stripe";
import { squarePaymentGateway } from "@/lib/commerce/square";
import { prisma } from "@/lib/prisma";
import type { PaymentGateway } from "./types";

export function getPaymentGateway(provider: PaymentProvider = PaymentProvider.STRIPE): PaymentGateway {
  if (provider === PaymentProvider.STRIPE) return stripePaymentGateway;
  if (provider === PaymentProvider.SQUARE) return squarePaymentGateway;
  if (provider === PaymentProvider.PAYPAL) return paypalPaymentGateway;

  throw new Error(`${provider} payment gateway is not implemented yet.`);
}

export async function resolvePaymentProviderForSite(siteId: string, provider?: PaymentProvider) {
  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { checkoutProvider: true }
  });
  const selectedProvider = provider || settings?.checkoutProvider || PaymentProvider.STRIPE;

  if (selectedProvider !== PaymentProvider.STRIPE && selectedProvider !== PaymentProvider.SQUARE && selectedProvider !== PaymentProvider.PAYPAL) {
    return selectedProvider;
  }

  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: selectedProvider,
        siteId
      }
    },
    select: {
      externalAccountId: true,
      merchantId: true,
      status: true
    }
  });
  const connected =
    credential?.status === PaymentGatewayConnectionStatus.CONNECTED &&
    (selectedProvider === PaymentProvider.STRIPE ? Boolean(credential.externalAccountId.trim()) : Boolean(credential.merchantId.trim()));

  if (connected) return selectedProvider;
  if (provider) throw new Error(`${selectedProvider} checkout is not connected for this site.`);

  const connectedFallback = await prisma.paymentGatewayCredential.findFirst({
    where: {
      siteId,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      OR: [
        { provider: PaymentProvider.STRIPE, externalAccountId: { not: "" } },
        { provider: { in: [PaymentProvider.SQUARE, PaymentProvider.PAYPAL] }, merchantId: { not: "" } }
      ]
    },
    orderBy: { connectedAt: "desc" },
    select: { provider: true }
  });

  if (connectedFallback) return connectedFallback.provider;
  throw new Error("Connect a payment provider before creating hosted checkout.");
}
