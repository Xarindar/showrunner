import { PaymentProvider } from "@prisma/client";
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
  if (provider) return provider;

  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { checkoutProvider: true }
  });

  return settings?.checkoutProvider || PaymentProvider.STRIPE;
}
