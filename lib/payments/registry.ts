import { PaymentProvider } from "@prisma/client";
import { stripePaymentGateway } from "@/lib/commerce/stripe";
import type { PaymentGateway } from "./types";

export function getPaymentGateway(provider: PaymentProvider = PaymentProvider.STRIPE): PaymentGateway {
  if (provider === PaymentProvider.STRIPE) return stripePaymentGateway;

  throw new Error(`${provider} payment gateway is not implemented yet.`);
}
