import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { paypalPaymentGateway } from "@/lib/commerce/paypal";
import { stripePaymentGateway } from "@/lib/commerce/stripe";
import { squarePaymentGateway } from "@/lib/commerce/square";
import { isSquareCredentialUsable } from "@/lib/payments/connect/square-refresh";
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
      encryptedAccessToken: true,
      externalAccountId: true,
      expiresAt: true,
      merchantId: true,
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

  if (connected) return selectedProvider;
  if (provider) throw new Error(`${selectedProvider} checkout is not connected for this site.`);

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
      status: true
    }
  });
  const connectedFallback = fallbackCredentials.find((candidate) =>
    candidate.provider === PaymentProvider.SQUARE
      ? isSquareCredentialUsable(candidate)
      : candidate.status === PaymentGatewayConnectionStatus.CONNECTED
  );

  if (connectedFallback) return connectedFallback.provider;
  throw new Error("Connect a payment provider before creating hosted checkout.");
}
