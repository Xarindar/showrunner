import "server-only";

import crypto from "node:crypto";
import { PaymentProvider, Prisma } from "@prisma/client";
import { publicAppBaseUrl } from "@/lib/env";
import { upsertConnectedGatewayCredential } from "@/lib/payments/credentials";

const stateTtlSeconds = 10 * 60;

type PayPalTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type PayPalLink = {
  href?: string;
  rel?: string;
};

type PayPalPartnerReferralResponse = {
  links?: PayPalLink[];
};

type PayPalMerchantIntegration = {
  merchant_id?: string;
  payments_receivable?: boolean;
  primary_email_confirmed?: boolean;
  products?: {
    name?: string;
    status?: string;
  }[];
  tracking_id?: string;
};

type PayPalMerchantIntegrationsResponse = {
  merchant_integrations?: PayPalMerchantIntegration[];
  partner_merchant_id?: string;
};

function paypalEnvironment() {
  return (process.env.PAYPAL_ENVIRONMENT || "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalApiBaseUrl() {
  return paypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function requirePayPalClientId() {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  if (!clientId) throw new Error("PAYPAL_CLIENT_ID is required before PayPal onboarding can start.");
  return clientId;
}

function requirePayPalClientSecret() {
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  if (!clientSecret) throw new Error("PAYPAL_CLIENT_SECRET is required before PayPal onboarding can start.");
  return clientSecret;
}

export function paypalPartnerAttributionId() {
  return process.env.PAYPAL_PARTNER_ATTRIBUTION_ID || "";
}

function requirePayPalPartnerMerchantId() {
  const partnerMerchantId = process.env.PAYPAL_PARTNER_MERCHANT_ID || "";
  if (!partnerMerchantId) throw new Error("PAYPAL_PARTNER_MERCHANT_ID is required before PayPal onboarding can complete.");
  return partnerMerchantId;
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function connectStateSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before PayPal onboarding can start.");
  }

  return secret || "local-dev-paypal-connect-state-secret";
}

function redirectUri() {
  return process.env.PAYPAL_CONNECT_REDIRECT_URI || `${publicAppBaseUrl()}/api/payments/paypal/connect/callback`;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", connectStateSecret()).update(payload).digest("base64url");
}

export function createPayPalConnectState(siteId: string) {
  const trackingId = crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + stateTtlSeconds,
      siteId,
      trackingId
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function verifyPayPalConnectState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("PayPal Connect state is invalid.");

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("PayPal Connect state signature is invalid.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    exp?: number;
    siteId?: string;
    trackingId?: string;
  };
  if (!decoded.siteId || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000) || !decoded.trackingId) {
    throw new Error("PayPal Connect state has expired.");
  }

  return {
    siteId: decoded.siteId,
    trackingId: decoded.trackingId
  };
}

export async function getPayPalAccessToken() {
  const credentials = Buffer.from(`${requirePayPalClientId()}:${requirePayPalClientSecret()}`).toString("base64");
  const response = await fetch(`${paypalApiBaseUrl()}/v1/oauth2/token`, {
    body: "grant_type=client_credentials",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || !body.access_token) {
    throw new Error("PayPal access token request failed.");
  }

  return body as PayPalTokenResponse & { access_token: string };
}

export function paypalAuthAssertion(merchantId: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: requirePayPalClientId(),
      payer_id: merchantId
    })
  ).toString("base64url");

  return `${header}.${payload}.`;
}

export async function paypalFetch<T>(path: string, init: RequestInit & { merchantId?: string; requestId?: string } = {}) {
  const token = await getPayPalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token.access_token}`);
  headers.set("Content-Type", "application/json");
  if (init.requestId) headers.set("PayPal-Request-Id", init.requestId);
  if (init.merchantId) headers.set("PayPal-Auth-Assertion", paypalAuthAssertion(init.merchantId));
  if (paypalPartnerAttributionId()) headers.set("PayPal-Partner-Attribution-Id", paypalPartnerAttributionId());

  const response = await fetch(`${paypalApiBaseUrl()}${path}`, {
    ...init,
    headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = Array.isArray(body.details) ? body.details.map((item: { description?: string; issue?: string }) => item.description || item.issue).filter(Boolean).join("; ") : "";
    throw new Error(detail || body.message || `PayPal request failed with status ${response.status}.`);
  }

  return body as T;
}

export async function createPayPalPartnerReferralUrl(siteId: string) {
  const state = createPayPalConnectState(siteId);
  const { trackingId } = verifyPayPalConnectState(state);
  const response = await paypalFetch<PayPalPartnerReferralResponse>("/v2/customer/partner-referrals", {
    body: JSON.stringify({
      operations: [
        {
          api_integration_preference: {
            first_party_details: {
              features: ["PAYMENT", "REFUND"],
              seller_nonce: trackingId
            },
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: {
                features: ["PAYMENT", "REFUND"]
              }
            }
          },
          operation: "API_INTEGRATION"
        }
      ],
      partner_config_override: {
        return_url: `${redirectUri()}?state=${encodeURIComponent(state)}`,
        return_url_description: "Return to Showrunner"
      },
      products: ["EXPRESS_CHECKOUT"],
      tracking_id: trackingId
    }),
    method: "POST",
    requestId: `paypal_referral_${trackingId}`
  });
  const actionUrl = response.links?.find((link) => link.rel === "action_url")?.href || response.links?.find((link) => link.href)?.href || "";
  if (!actionUrl) throw new Error("PayPal Partner Referrals did not return an onboarding URL.");

  return actionUrl;
}

function queryValue(params: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value.trim();
  }

  return "";
}

async function getMerchantIntegrationByTrackingId(trackingId: string) {
  const partnerMerchantId = requirePayPalPartnerMerchantId();
  const response = await paypalFetch<PayPalMerchantIntegrationsResponse>(
    `/v1/customer/partners/${encodeURIComponent(partnerMerchantId)}/merchant-integrations?tracking_id=${encodeURIComponent(trackingId)}`,
    {
      merchantId: partnerMerchantId,
      method: "GET",
      requestId: `paypal_merchant_status_${trackingId}`
    }
  );
  const integration = response.merchant_integrations?.find((item) => item.tracking_id === trackingId) || response.merchant_integrations?.[0];
  if (!integration?.merchant_id) throw new Error("PayPal merchant integration status was not found for this onboarding attempt.");
  if (integration.tracking_id && integration.tracking_id !== trackingId) {
    throw new Error("PayPal merchant integration status does not match this onboarding attempt.");
  }
  if (integration.payments_receivable !== true) {
    throw new Error("PayPal merchant cannot receive payments yet.");
  }
  if (integration.primary_email_confirmed !== true) {
    throw new Error("PayPal merchant must confirm their primary email before checkout can be enabled.");
  }

  return integration;
}

export async function completePayPalConnectOnboarding(input: {
  expectedSiteId?: string;
  searchParams: URLSearchParams;
  state: string;
}) {
  const { siteId, trackingId } = verifyPayPalConnectState(input.state);
  if (input.expectedSiteId && input.expectedSiteId !== siteId) {
    throw new Error("PayPal Connect state does not match the current site.");
  }

  const permissionsGranted = queryValue(input.searchParams, ["permissionsGranted", "permissions_granted"]);
  const consentStatus = queryValue(input.searchParams, ["consentStatus", "consent_status"]);
  if (permissionsGranted.toLowerCase() === "false" || consentStatus.toLowerCase() === "false") {
    throw new Error("PayPal permissions were not granted.");
  }

  const returnedMerchantId = queryValue(input.searchParams, ["merchantIdInPayPal", "merchant_id"]);
  const integration = await getMerchantIntegrationByTrackingId(trackingId);
  if (returnedMerchantId && returnedMerchantId !== integration.merchant_id) {
    throw new Error("PayPal Connect merchant does not match the verified merchant integration.");
  }

  await upsertConnectedGatewayCredential({
    displayName: integration.merchant_id,
    encryptedMetadata: {
      consentStatus,
      environment: paypalEnvironment(),
      paymentsReceivable: integration.payments_receivable,
      permissionsGranted,
      primaryEmailConfirmed: integration.primary_email_confirmed,
      products: integration.products || [],
      trackingId
    } satisfies Prisma.InputJsonObject,
    externalAccountId: integration.merchant_id,
    merchantId: integration.merchant_id,
    provider: PaymentProvider.PAYPAL,
    siteId,
    supportedWallets: []
  });

  return siteId;
}
