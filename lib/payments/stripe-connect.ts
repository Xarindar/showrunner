import "server-only";

import crypto from "node:crypto";
import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { publicAppBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const stateTtlSeconds = 10 * 60;

function requireStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required before Stripe onboarding can start.");
  return secretKey;
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function connectStateSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before Stripe Connect onboarding can start.");
  }

  return secret || "local-dev-stripe-connect-state-secret";
}

function redirectUri() {
  return process.env.STRIPE_CONNECT_REDIRECT_URI || `${publicAppBaseUrl()}/api/payments/stripe/connect/callback`;
}

function refreshUri() {
  return `${publicAppBaseUrl()}/api/payments/stripe/connect/start`;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", connectStateSecret()).update(payload).digest("base64url");
}

export function createStripeConnectState(siteId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + stateTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
      siteId
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function verifyStripeConnectState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Stripe Connect state is invalid.");

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Stripe Connect state signature is invalid.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    exp?: number;
    siteId?: string;
  };
  if (!decoded.siteId || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Stripe Connect state has expired.");
  }

  return decoded.siteId;
}

function getStripe() {
  return new Stripe(requireStripeSecretKey());
}

function stripeReturnUri(state: string) {
  const url = new URL(redirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

function stripeDisplayName(account: Stripe.Account) {
  return account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || account.id;
}

async function getOrCreateStripeAccount(stripe: Stripe, siteId: string) {
  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: PaymentProvider.STRIPE,
        siteId
      }
    }
  });

  if (credential?.externalAccountId) return credential.externalAccountId;

  const account = await stripe.accounts.create({
    metadata: {
      siteId,
      source: "showrunner_payment_settings"
    },
    type: "standard"
  });

  await prisma.paymentGatewayCredential.upsert({
    where: {
      siteId_provider: {
        provider: PaymentProvider.STRIPE,
        siteId
      }
    },
    update: {
      displayName: account.id,
      externalAccountId: account.id,
      lastVerifiedAt: new Date(),
      metadata: {
        accountType: account.type || "standard",
        onboarding: "stripe_account_link"
      } satisfies Prisma.InputJsonObject,
      status: PaymentGatewayConnectionStatus.PENDING,
      supportedWallets: ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"]
    },
    create: {
      displayName: account.id,
      externalAccountId: account.id,
      lastVerifiedAt: new Date(),
      metadata: {
        accountType: account.type || "standard",
        onboarding: "stripe_account_link"
      } satisfies Prisma.InputJsonObject,
      provider: PaymentProvider.STRIPE,
      siteId,
      status: PaymentGatewayConnectionStatus.PENDING,
      supportedWallets: ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"]
    }
  });

  return account.id;
}

export async function createStripeConnectAuthorizeUrl(siteId: string) {
  const stripe = getStripe();
  const state = createStripeConnectState(siteId);
  const accountId = await getOrCreateStripeAccount(stripe, siteId);
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUri(),
    return_url: stripeReturnUri(state),
    type: "account_onboarding"
  });

  if (!accountLink.url) throw new Error("Stripe did not return an onboarding URL.");
  return accountLink.url;
}

export async function completeStripeConnectOnboarding(input: { expectedSiteId?: string; state: string }) {
  const siteId = verifyStripeConnectState(input.state);
  if (input.expectedSiteId && input.expectedSiteId !== siteId) {
    throw new Error("Stripe Connect state does not match the current site.");
  }

  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        provider: PaymentProvider.STRIPE,
        siteId
      }
    }
  });
  if (!credential?.externalAccountId) throw new Error("Stripe onboarding could not find a connected account.");

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(credential.externalAccountId);
  if ("deleted" in account && account.deleted) {
    throw new Error("Stripe account was removed. Start Stripe connection again.");
  }

  const metadata = {
    accountType: account.type || "standard",
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    onboarding: "stripe_account_link",
    payoutsEnabled: account.payouts_enabled,
    requirementsCurrentlyDue: account.requirements?.currently_due || [],
    requirementsDisabledReason: account.requirements?.disabled_reason || "",
    requirementsPastDue: account.requirements?.past_due || ""
  } satisfies Prisma.InputJsonObject;

  if (!account.details_submitted || !account.charges_enabled) {
    await prisma.paymentGatewayCredential.update({
      where: { id: credential.id },
      data: {
        displayName: stripeDisplayName(account),
        lastVerifiedAt: new Date(),
        metadata,
        status: PaymentGatewayConnectionStatus.PENDING
      }
    });
    throw new Error("Stripe still needs a little more information. Select Connect Stripe again to continue onboarding.");
  }

  await prisma.paymentGatewayCredential.update({
    where: { id: credential.id },
    data: {
      connectedAt: new Date(),
      displayName: stripeDisplayName(account),
      lastVerifiedAt: new Date(),
      metadata,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      supportedWallets: ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"]
    },
  });

  return siteId;
}
