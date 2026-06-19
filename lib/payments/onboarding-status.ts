import "server-only";

import { PaymentProvider } from "@prisma/client";

// In the bring-your-own-credentials model every provider is always available to configure — the
// merchant just pastes their own keys. There is no platform-env gate, so this module only owns
// provider labels and surfacing the merchant's own verification errors.

export const connectablePaymentProviders = [PaymentProvider.STRIPE, PaymentProvider.SQUARE, PaymentProvider.PAYPAL] as const;
export type ConnectablePaymentProvider = (typeof connectablePaymentProviders)[number];

const providerLabels: Record<ConnectablePaymentProvider, string> = {
  [PaymentProvider.STRIPE]: "Stripe",
  [PaymentProvider.SQUARE]: "Square",
  [PaymentProvider.PAYPAL]: "PayPal"
};

export function paymentProviderLabel(provider: ConnectablePaymentProvider) {
  return providerLabels[provider];
}

export function sanitizePaymentOnboardingError(error: unknown, fallback = "Payment setup could not be completed.") {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return message || fallback;
}
