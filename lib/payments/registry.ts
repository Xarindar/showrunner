import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { stripePaymentGateway } from "@/lib/commerce/stripe";
import { squarePaymentGateway } from "@/lib/commerce/square";
import { prisma } from "@/lib/prisma";
import type { PaymentGateway } from "./types";

export function getPaymentGateway(provider: PaymentProvider = PaymentProvider.STRIPE): PaymentGateway {
  if (provider === PaymentProvider.STRIPE) return stripePaymentGateway;
  if (provider === PaymentProvider.SQUARE) return squarePaymentGateway;

  throw new Error(`${provider} payment gateway is not implemented yet.`);
}

export async function resolvePaymentProviderForSite(siteId: string, provider?: PaymentProvider) {
  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { checkoutProvider: true }
  });
  const selectedProvider = provider || settings?.checkoutProvider || PaymentProvider.STRIPE;

  if (selectedProvider !== PaymentProvider.SQUARE) return selectedProvider;

  const squareCredential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: PaymentProvider.SQUARE,
        siteId
      }
    },
    select: {
      merchantId: true,
      status: true
    }
  });
  const squareConnected =
    squareCredential?.status === PaymentGatewayConnectionStatus.CONNECTED && Boolean(squareCredential.merchantId.trim());

  if (squareConnected) return PaymentProvider.SQUARE;
  if (provider) throw new Error("Square checkout is not connected for this site.");

  return PaymentProvider.STRIPE;
}
