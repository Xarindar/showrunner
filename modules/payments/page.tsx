import { PaymentGatewayConnectionStatus, type PaymentGatewayCredential, PaymentProvider, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { isConnectBrokerConfigured } from "@/lib/payments/connect/config";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { getStripePaymentMethodSettings } from "@/lib/payments/methods";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { PaymentsWorkspace, type ConnectNotice, type ProviderCard } from "./components/payments-workspace";
import { selectSquareOAuthLocationAction } from "./actions";

export const dynamic = "force-dynamic";

type Credential = PaymentGatewayCredential | null;

type PaymentsPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

// Banner state for the OAuth connect round-trip: the callback route redirects back
// here with ?connected={provider} or ?connectError={message}.
function connectNotice(params: Record<string, string | undefined>): ConnectNotice | null {
  const connected = (params.connected || "").trim().toLowerCase();
  if (connected === "stripe" || connected === "square") {
    const label = connected === "stripe" ? "Stripe" : "Square";
    return { kind: "success", message: `${label} is connected. Charges settle directly to your own ${label} account.` };
  }
  const error = (params.connectError || "").trim();
  if (error) return { kind: "error", message: error.slice(0, 500) };
  return null;
}

function metadataString(credential: Credential, key: string) {
  const metadata = credential?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === "string" ? value : "";
}

function lastChecked(credential: Credential) {
  return credential?.lastVerifiedAt ? ` Last checked ${credential.lastVerifiedAt.toISOString().slice(0, 10)}.` : "";
}

function pendingSquareLocations(credential: Credential) {
  if (credential?.status !== PaymentGatewayConnectionStatus.PENDING) return [];
  const metadata = credential.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const locations = (metadata as Prisma.JsonObject).pendingLocations;
  if (!Array.isArray(locations)) return [];
  return locations.flatMap((location) => {
    if (!location || typeof location !== "object" || Array.isArray(location)) return [];
    const id = (location as Prisma.JsonObject).id;
    const name = (location as Prisma.JsonObject).name;
    return typeof id === "string" && typeof name === "string" ? [{ id, name }] : [];
  });
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const notice = connectNotice(searchParams ? await searchParams : {});
  const oauthEnabled = isConnectBrokerConfigured();

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

  const squareOAuth = metadataString(squareCredential, "onboarding") === "oauth";
  const squareLocations = pendingSquareLocations(squareCredential);
  const squareWebhookMissing = squareConnected && !squareCredential?.webhookSecretHint;
  // Paste-flow Stripe always has a webhook secret; this only trips when one-click connect
  // could not create the webhook endpoint automatically (the admin retries via Reconnect).
  const stripeWebhookMissing = stripeConnected && !stripeCredential?.webhookSecretHint;

  const providers: ProviderCard[] = [
    {
      provider: "STRIPE",
      name: "Stripe",
      recommended: true,
      connected: stripeConnected,
      needsAttention: needsAttention(stripeCredential),
      oauthConnect: oauthEnabled,
      webhookMissing: stripeWebhookMissing,
      headline: stripeConnected
        ? `${stripeCredential?.displayName || "Stripe account"} · ${stripeMode}.${lastChecked(stripeCredential)}`
        : oauthEnabled
          ? "One click: sign in to Stripe and you're set — cards, Apple Pay, Google Pay, Cash App Pay, and Affirm. No keys to copy."
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
      oauthConnect: oauthEnabled,
      webhookMissing: squareWebhookMissing,
      headline: squareConnected
        ? `${squareCredential?.displayName || "Square"} · ${squareEnv}.${lastChecked(squareCredential)}`
        : oauthEnabled
          ? "Optional. One click: sign in to Square for hosted checkout with cards, wallets, and Cash App Pay."
          : "Optional. Square-hosted checkout with cards, wallets, and Cash App Pay.",
      manageDetail: squareConnected
        ? `${squareCredential?.displayName || "Square"} · ${squareEnv}${squareOAuth ? " · connected with one-click" : ""}.${lastChecked(squareCredential)}`
        : "Square is not connected yet."
    },
    {
      provider: "PAYPAL",
      name: "PayPal",
      connected: paypalConnected,
      needsAttention: needsAttention(paypalCredential),
      advanced: oauthEnabled,
      headline: paypalConnected
        ? `${paypalEnv} app connected.${lastChecked(paypalCredential)}`
        : oauthEnabled
          ? "Advanced — paste your own PayPal REST app keys. Settles to your PayPal business account."
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
    <>
      {squareLocations.length ? (
        <section className="module-panel form-grid" aria-labelledby="square-location-heading">
          <div>
            <h2 id="square-location-heading">Choose the Square location for this site</h2>
            <p>Square authorized the merchant account. Confirm which active location should own this site&apos;s orders, payments, and refunds.</p>
          </div>
          <form action={selectSquareOAuthLocationAction} className="form-grid">
            <label>
              <span>Square location</span>
              <select name="locationId" required defaultValue="">
                <option disabled value="">Select a location</option>
                {squareLocations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <button className="ui-button" type="submit">Confirm Square location</button>
          </form>
        </section>
      ) : null}
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
      notice={notice}
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
    </>
  );
}
