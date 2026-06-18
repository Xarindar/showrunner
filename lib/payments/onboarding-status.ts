import "server-only";

import { PaymentProvider } from "@prisma/client";

export const connectablePaymentProviders = [PaymentProvider.STRIPE, PaymentProvider.SQUARE, PaymentProvider.PAYPAL] as const;
export type ConnectablePaymentProvider = (typeof connectablePaymentProviders)[number];

type ProviderRequirement = {
  completionEnv: string[];
  startEnv: string[];
};

export type PaymentOnboardingStatus = {
  description: string;
  label: string;
  provider: ConnectablePaymentProvider;
  ready: boolean;
  statusLabel: string;
};

const providerLabels: Record<ConnectablePaymentProvider, string> = {
  [PaymentProvider.STRIPE]: "Stripe",
  [PaymentProvider.SQUARE]: "Square",
  [PaymentProvider.PAYPAL]: "PayPal"
};

const providerRequirements: Record<ConnectablePaymentProvider, ProviderRequirement> = {
  [PaymentProvider.STRIPE]: {
    completionEnv: ["STRIPE_SECRET_KEY"],
    startEnv: ["STRIPE_CONNECT_CLIENT_ID"]
  },
  [PaymentProvider.SQUARE]: {
    completionEnv: ["SQUARE_APPLICATION_SECRET"],
    startEnv: ["SQUARE_APPLICATION_ID"]
  },
  [PaymentProvider.PAYPAL]: {
    completionEnv: ["PAYPAL_PARTNER_MERCHANT_ID"],
    startEnv: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]
  }
};

const platformConfigurationTokens = [
  "STRIPE_CONNECT_CLIENT_ID",
  "STRIPE_SECRET_KEY",
  "SQUARE_APPLICATION_ID",
  "SQUARE_APPLICATION_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_PARTNER_MERCHANT_ID",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY",
  "AUTH_SECRET"
];

function hasEnv(name: string) {
  return Boolean((process.env[name] || "").trim());
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function credentialStorageReady() {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  return Boolean(secret && !isWeakProductionSecret(secret));
}

export function paymentProviderLabel(provider: ConnectablePaymentProvider) {
  return providerLabels[provider];
}

export function getPaymentOnboardingStatus(provider: ConnectablePaymentProvider): PaymentOnboardingStatus {
  const requirements = providerRequirements[provider];
  const missing = [...requirements.startEnv, ...requirements.completionEnv].filter((name) => !hasEnv(name));
  const ready = missing.length === 0 && credentialStorageReady();
  const label = paymentProviderLabel(provider);

  return {
    description: ready
      ? `${label} opens a provider-hosted connection flow. Account owners sign in with the provider and grant access; no keys are entered here.`
      : `${label} onboarding is not available on this deployment yet. The platform connector needs one-time setup before account owners can connect.`,
    label,
    provider,
    ready,
    statusLabel: ready ? "OAuth ready" : "Setup pending"
  };
}

export function getPaymentOnboardingStatuses() {
  return connectablePaymentProviders.map((provider) => getPaymentOnboardingStatus(provider));
}

function providerFromMessage(message: string) {
  const normalized = message.toUpperCase();
  for (const provider of connectablePaymentProviders) {
    const requirements = providerRequirements[provider];
    if ([...requirements.startEnv, ...requirements.completionEnv].some((name) => normalized.includes(name))) {
      return provider;
    }
  }

  return undefined;
}

function isPlatformConfigurationError(message: string) {
  const normalized = message.toUpperCase();
  return platformConfigurationTokens.some((token) => normalized.includes(token));
}

export function paymentOnboardingUnavailableMessage(provider?: ConnectablePaymentProvider) {
  const label = provider ? paymentProviderLabel(provider) : "Payment provider";
  return `${label} onboarding is not available yet. The Showrunner platform connector needs one-time setup before account owners can connect through the provider-hosted flow. No client keys are required.`;
}

export function sanitizePaymentOnboardingError(
  error: unknown,
  provider?: ConnectablePaymentProvider,
  fallback = "Payment onboarding could not be completed."
) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (isPlatformConfigurationError(message)) {
    return paymentOnboardingUnavailableMessage(provider || providerFromMessage(message));
  }

  return message;
}
