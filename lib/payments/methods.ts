import "server-only";

import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { publicAppBaseUrl } from "@/lib/env";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { prisma } from "@/lib/prisma";

export const stripePaymentMethodOptions = [
  {
    defaultEnabled: true,
    key: "CARD",
    label: "Card",
    stripePaymentMethod: "card",
    type: "card"
  },
  {
    defaultEnabled: true,
    key: "APPLE_PAY",
    label: "Apple Pay",
    stripePaymentMethod: "card",
    type: "wallet"
  },
  {
    defaultEnabled: true,
    key: "GOOGLE_PAY",
    label: "Google Pay",
    stripePaymentMethod: "card",
    type: "wallet"
  },
  {
    defaultEnabled: true,
    key: "CASH_APP_PAY",
    label: "Cash App Pay",
    stripePaymentMethod: "cashapp",
    type: "wallet"
  },
  {
    defaultEnabled: false,
    key: "KLARNA",
    label: "Klarna",
    stripePaymentMethod: "klarna",
    type: "bnpl"
  },
  {
    defaultEnabled: true,
    key: "AFFIRM",
    label: "Affirm",
    stripePaymentMethod: "affirm",
    type: "bnpl"
  }
] as const;

export type StripePaymentMethodKey = (typeof stripePaymentMethodOptions)[number]["key"];
export type StripeCheckoutPaymentMethodType = "affirm" | "card" | "cashapp" | "klarna";

const stripePaymentMethodKeys = new Set(stripePaymentMethodOptions.map((option) => option.key));
export const defaultStripePaymentMethodKeys = stripePaymentMethodOptions
  .filter((option) => option.defaultEnabled)
  .map((option) => option.key);

type ApplePayDomainStatus = {
  checkedAt?: string;
  domain?: string;
  error?: string;
  status?: "error" | "skipped" | "verified";
};

type StripePaymentMethodsMetadata = {
  applePayDomain?: ApplePayDomainStatus;
  enabled?: string[];
  updatedAt?: string;
};

type PaymentCredentialMetadata = Prisma.JsonObject & {
  paymentMethods?: StripePaymentMethodsMetadata;
};

function requireStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required to verify Stripe payment methods.");
  return secretKey;
}

function getStripe() {
  return new Stripe(requireStripeSecretKey());
}

function appHostname() {
  try {
    const hostname = new URL(publicAppBaseUrl()).hostname.trim().toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" ? "" : hostname;
  } catch {
    return "";
  }
}

function metadataObject(value: Prisma.JsonValue): PaymentCredentialMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Prisma.JsonObject) } : {};
}

function paymentMethodsMetadata(value: Prisma.JsonValue): StripePaymentMethodsMetadata {
  const metadata = metadataObject(value).paymentMethods;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
}

export function normalizeStripePaymentMethodKeys(values: Iterable<string>) {
  const normalized = Array.from(new Set(Array.from(values).map((value) => value.trim().toUpperCase()))).filter((value) =>
    stripePaymentMethodKeys.has(value as StripePaymentMethodKey)
  ) as StripePaymentMethodKey[];

  return stripePaymentMethodOptions
    .filter((option) => normalized.includes(option.key))
    .map((option) => option.key);
}

function stripeSupportedWallets(enabledKeys: StripePaymentMethodKey[]) {
  return enabledKeys.filter((key) => key === "APPLE_PAY" || key === "GOOGLE_PAY" || key === "CASH_APP_PAY");
}

export async function getStripePaymentMethodSettings(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.STRIPE);
  const connected = credential?.status === PaymentGatewayConnectionStatus.CONNECTED && Boolean(credential.externalAccountId);
  const paymentMethods = credential ? paymentMethodsMetadata(credential.metadata) : {};
  const savedEnabled = Array.isArray(paymentMethods.enabled) ? normalizeStripePaymentMethodKeys(paymentMethods.enabled.map(String)) : [];
  const enabledKeys = savedEnabled.length ? savedEnabled : defaultStripePaymentMethodKeys;

  return {
    applePayDomain: paymentMethods.applePayDomain || {},
    connected,
    credential,
    enabledKeys,
    options: stripePaymentMethodOptions
  };
}

async function saveApplePayDomainStatus(input: {
  credentialId: string;
  metadata: PaymentCredentialMetadata;
  status: ApplePayDomainStatus;
}) {
  const nextPaymentMethods = {
    ...paymentMethodsMetadata(input.metadata),
    applePayDomain: input.status
  };

  return prisma.paymentGatewayCredential.update({
    where: { id: input.credentialId },
    data: {
      metadata: {
        ...input.metadata,
        paymentMethods: nextPaymentMethods
      }
    }
  });
}

export async function verifyStripeApplePayDomain(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.STRIPE);
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED || !credential.externalAccountId) {
    throw new Error("Connect Stripe before enabling Apple Pay.");
  }

  const metadata = metadataObject(credential.metadata);
  const domain = appHostname();
  const checkedAt = new Date().toISOString();
  if (!domain) {
    await saveApplePayDomainStatus({
      credentialId: credential.id,
      metadata,
      status: {
        checkedAt,
        status: "skipped"
      }
    });
    return;
  }

  try {
    await getStripe().applePayDomains.create({ domain_name: domain }, { stripeAccount: credential.externalAccountId });
    await saveApplePayDomainStatus({
      credentialId: credential.id,
      metadata,
      status: {
        checkedAt,
        domain,
        status: "verified"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple Pay domain verification failed.";
    await saveApplePayDomainStatus({
      credentialId: credential.id,
      metadata,
      status: {
        checkedAt,
        domain,
        error: message.slice(0, 500),
        status: "error"
      }
    });
  }
}

export async function updateStripePaymentMethodSettings(input: {
  enabledKeys: string[];
  siteId: string;
}) {
  const enabledKeys = normalizeStripePaymentMethodKeys(input.enabledKeys);
  if (!enabledKeys.length) throw new Error("Keep at least one Stripe checkout method enabled.");

  const credential = await getConnectedGatewayCredential(input.siteId, PaymentProvider.STRIPE);
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED || !credential.externalAccountId) {
    throw new Error("Connect Stripe before changing checkout methods.");
  }

  const metadata = metadataObject(credential.metadata);
  const nextPaymentMethods = {
    ...paymentMethodsMetadata(credential.metadata),
    enabled: enabledKeys,
    updatedAt: new Date().toISOString()
  };

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      metadata: {
        ...metadata,
        paymentMethods: nextPaymentMethods
      },
      supportedWallets: stripeSupportedWallets(enabledKeys)
    }
  });

  if (enabledKeys.includes("APPLE_PAY")) {
    await verifyStripeApplePayDomain(input.siteId);
  }
}

export async function resolveStripeCheckoutPaymentMethods(siteId: string) {
  const settings = await getStripePaymentMethodSettings(siteId);
  if (!settings.connected) {
    return {
      cardWallets: defaultStripePaymentMethodKeys.filter((key) => key === "APPLE_PAY" || key === "GOOGLE_PAY"),
      enabledKeys: defaultStripePaymentMethodKeys,
      paymentMethodTypes: undefined
    };
  }

  const paymentMethodTypes: StripeCheckoutPaymentMethodType[] = [];
  const hasCardBackedMethod = settings.enabledKeys.some((key) => key === "CARD" || key === "APPLE_PAY" || key === "GOOGLE_PAY");
  if (hasCardBackedMethod) paymentMethodTypes.push("card");
  if (settings.enabledKeys.includes("CASH_APP_PAY")) paymentMethodTypes.push("cashapp");
  if (settings.enabledKeys.includes("KLARNA")) paymentMethodTypes.push("klarna");
  if (settings.enabledKeys.includes("AFFIRM")) paymentMethodTypes.push("affirm");

  return {
    cardWallets: settings.enabledKeys.filter((key) => key === "APPLE_PAY" || key === "GOOGLE_PAY"),
    enabledKeys: settings.enabledKeys,
    paymentMethodTypes: paymentMethodTypes.length ? paymentMethodTypes : (["card"] satisfies StripeCheckoutPaymentMethodType[])
  };
}
