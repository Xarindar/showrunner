import { PaymentGatewayConnectionStatus, type PaymentGatewayCredential, PaymentProvider, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { getStripePaymentMethodSettings } from "@/lib/payments/methods";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { PaymentsWorkspace, type ProviderCard } from "./components/payments-workspace";

export const dynamic = "force-dynamic";

type Credential = PaymentGatewayCredential | null;

function metadataString(credential: Credential, key: string) {
  const metadata = credential?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === "string" ? value : "";
}

function lastChecked(credential: Credential) {
  return credential?.lastVerifiedAt ? ` Last checked ${credential.lastVerifiedAt.toISOString().slice(0, 10)}.` : "";
}

export default async function PaymentsPage() {
  await requireAdmin("settings:update");
  const settings = await getSiteSettings();

  const [stripeMethods, squareCredential, paypalCredential, coupons] = await Promise.all([
    getStripePaymentMethodSettings(settings.siteId),
    getConnectedGatewayCredential(settings.siteId, PaymentProvider.SQUARE),
    getConnectedGatewayCredential(settings.siteId, PaymentProvider.PAYPAL),
    prisma.coupon.findMany({
      where: { siteId: settings.siteId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  const stripeCredential = stripeMethods.credential;
  const stripeConnected = stripeMethods.connected;
  const squareConnected =
    squareCredential?.status === PaymentGatewayConnectionStatus.CONNECTED &&
    Boolean(squareCredential.merchantId || squareCredential.encryptedAccessToken);
  const paypalConnected =
    paypalCredential?.status === PaymentGatewayConnectionStatus.CONNECTED && Boolean(paypalCredential.externalAccountId);

  const needsAttention = (credential: Credential) => credential?.status === PaymentGatewayConnectionStatus.ERROR;

  const stripeMode = metadataString(stripeCredential, "keyMode") === "live" ? "Live keys" : "Test keys";
  const squareEnv = metadataString(squareCredential, "environment") || "production";
  const paypalEnv = metadataString(paypalCredential, "environment") === "live" ? "Live" : "Sandbox";

  const providers: ProviderCard[] = [
    {
      provider: "STRIPE",
      name: "Stripe",
      recommended: true,
      connected: stripeConnected,
      needsAttention: needsAttention(stripeCredential),
      headline: stripeConnected
        ? `${stripeCredential?.displayName || "Stripe account"} · ${stripeMode}.${lastChecked(stripeCredential)}`
        : "Cards, Apple Pay, Google Pay, Cash App Pay, and Affirm — all from one connection.",
      manageDetail: stripeConnected
        ? `${stripeCredential?.displayName || "Stripe account"} · ${stripeMode}.${lastChecked(stripeCredential)}`
        : "Stripe is not connected yet."
    },
    {
      provider: "SQUARE",
      name: "Square",
      connected: squareConnected,
      needsAttention: needsAttention(squareCredential),
      headline: squareConnected
        ? `${squareCredential?.displayName || "Square"} · ${squareEnv}.${lastChecked(squareCredential)}`
        : "Optional. Square-hosted checkout with cards, wallets, and Cash App Pay.",
      manageDetail: squareConnected
        ? `${squareCredential?.displayName || "Square"} · ${squareEnv}.${lastChecked(squareCredential)}`
        : "Square is not connected yet."
    },
    {
      provider: "PAYPAL",
      name: "PayPal",
      connected: paypalConnected,
      needsAttention: needsAttention(paypalCredential),
      headline: paypalConnected
        ? `${paypalEnv} app connected.${lastChecked(paypalCredential)}`
        : "Optional. PayPal checkout settled to your own PayPal business account.",
      manageDetail: paypalConnected ? `${paypalEnv} app connected.${lastChecked(paypalCredential)}` : "PayPal is not connected yet."
    }
  ];

  const checkoutProviders = [
    { value: PaymentProvider.STRIPE, label: "Stripe", connected: stripeConnected },
    { value: PaymentProvider.SQUARE, label: "Square", connected: squareConnected },
    { value: PaymentProvider.PAYPAL, label: "PayPal", connected: paypalConnected }
  ];
  const anyConnected = stripeConnected || squareConnected || paypalConnected;
  const selectedDisconnected =
    (settings.checkoutProvider === PaymentProvider.STRIPE && !stripeConnected) ||
    (settings.checkoutProvider === PaymentProvider.SQUARE && !squareConnected) ||
    (settings.checkoutProvider === PaymentProvider.PAYPAL && !paypalConnected);
  const activeCheckoutProvider = selectedDisconnected
    ? stripeConnected
      ? PaymentProvider.STRIPE
      : squareConnected
        ? PaymentProvider.SQUARE
        : paypalConnected
          ? PaymentProvider.PAYPAL
          : undefined
    : settings.checkoutProvider || undefined;

  const baseUrl = publicAppBaseUrl().replace(/\/$/, "");

  return (
    <PaymentsWorkspace
      checkout={{
        active: activeCheckoutProvider,
        anyConnected,
        disconnected: selectedDisconnected,
        providers: checkoutProviders
      }}
      checkoutTotals={{
        freeShippingThresholdCents: settings.commerceFreeShippingThresholdCents,
        shippingEnabled: settings.commerceShippingEnabled,
        shippingFlatCents: settings.commerceShippingFlatCents,
        shippingLabel: settings.commerceShippingLabel,
        taxAppliesToShipping: settings.commerceTaxAppliesToShipping,
        taxEnabled: settings.commerceTaxEnabled,
        taxLabel: settings.commerceTaxLabel,
        taxRateBps: settings.commerceTaxRateBps
      }}
      coupons={coupons.map((coupon) => ({
        amountCents: coupon.amountCents,
        code: coupon.code,
        createdAt: coupon.createdAt.toISOString(),
        endsAt: coupon.endsAt?.toISOString() ?? null,
        id: coupon.id,
        maxRedemptions: coupon.maxRedemptions,
        percentOff: coupon.percentOff,
        redemptionCount: coupon.redemptionCount,
        startsAt: coupon.startsAt?.toISOString() ?? null,
        type: coupon.type
      }))}
      featuredConnected={stripeConnected}
      methods={{
        applePayStatus: stripeMethods.applePayDomain.status,
        connected: stripeConnected,
        enabledKeys: [...stripeMethods.enabledKeys],
        options: stripeMethods.options.map((option) => ({
          key: option.key,
          label: option.label,
          stripePaymentMethod: option.stripePaymentMethod,
          type: option.type
        }))
      }}
      providers={providers}
      webhooks={{
        paypal: `${baseUrl}/api/webhooks/paypal`,
        square: `${baseUrl}/api/webhooks/square`,
        stripe: `${baseUrl}/api/webhooks/stripe`
      }} />
  );
}
