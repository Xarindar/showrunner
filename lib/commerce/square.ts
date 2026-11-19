import "server-only";
import { persistGalleryHostedCheckout } from "@/lib/portfolio/checkout-persistence";
import { assertGalleryCheckoutCreation, requireCheckoutIdentity, safeHostedCheckoutUrl, type GalleryCheckoutIdentity, type GalleryCheckoutInspection } from "@/lib/portfolio/checkout-recovery-policy";
import { revokeGalleryPurchaseForRefund } from "@/lib/portfolio/refunds";

import crypto from "node:crypto";
import {
  BillingDocumentStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SquareWebhookEventStatus
} from "@prisma/client";
import { recordBillingRefund, type BillingRefundObservation } from "@/lib/billing/refund-ledger";
import type { GatewayBillingRefundInput } from "@/lib/payments/types";
import { ensureBillingPublicToken } from "@/lib/billing/documents";
import { reserveBillingCheckout, persistBillingCheckout, settleBillingPayment } from "@/lib/billing/payments";
import { publicAppBaseUrl } from "@/lib/env";
import { isSquareCredentialUsable } from "@/lib/payments/connect/square-refresh";
import { getConnectedGatewayCredential, getWebhookSigningCredentials, getSquareAccessToken } from "@/lib/payments/credentials";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { squareApiBaseUrl } from "@/lib/payments/provider-onboarding";
import type { PaymentGateway, PaymentGatewayCheckoutInput, PaymentWallet } from "@/lib/payments/types";
import { PaymentWebhookRejected } from "@/lib/payments/webhook-auth";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { updateOrderStatus } from "./orders";

type SquareMoney = {
  amount?: number;
  currency?: string;
};

type SquarePayment = {
  amount_money?: SquareMoney;
  created_at?: string;
  id?: string;
  order_id?: string;
  receipt_url?: string;
  status?: string;
  total_money?: SquareMoney;
};

type SquareRefund = {
  created_at?: string;
  amount_money?: SquareMoney;
  id?: string;
  payment_id?: string;
  status?: string;
};

type SquareWebhookEvent = {
  created_at?: string;
  data?: {
    id?: string;
    object?: {
      payment?: SquarePayment;
      refund?: SquareRefund;
    };
    type?: string;
  };
  event_id?: string;
  merchant_id?: string;
  type?: string;
};

type SquarePaymentLinkResponse = {
  payment_link?: {
    id?: string;
    order_id?: string;
    url?: string;
  };
};

const squareEventStaleProcessingMs = 5 * 60 * 1000;

function publicOrderUrl(orderNumber: string, status: "success" | "cancel", galleryPurchase = false) {
  if (galleryPurchase) return `${publicAppBaseUrl()}/proofs/payment-return?checkout=${status}`;
  const params = new URLSearchParams({
    checkout: status,
    order: orderNumber
  });

  return `${publicAppBaseUrl()}/cart?${params.toString()}`;
}

function publicBillingUrl(token: string, status: "success" | "cancel") {
  const params = new URLSearchParams({
    checkout: status
  });

  return `${publicAppBaseUrl()}/billing/${encodeURIComponent(token)}?${params.toString()}`;
}

function squareWebhookNotificationUrl() {
  return process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || `${publicAppBaseUrl()}/api/webhooks/square`;
}

function assertSquareCurrency(currency: string) {
  const safeCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(safeCurrency)) throw new Error("Currency is not supported by Square.");
  return safeCurrency;
}

function metadataObject(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

function squareLocationId(credential: { metadata: Prisma.JsonValue }) {
  const metadata = metadataObject(credential.metadata);
  const locationId = typeof metadata.locationId === "string" ? metadata.locationId.trim() : "";
  if (!locationId) throw new Error("Square location is missing for this connected account.");
  return locationId;
}

async function squareFetch<T>(siteId: string, path: string, init: RequestInit = {}) {
  const { accessToken, environment } = await getSquareAccessToken(siteId);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Square-Version", process.env.SQUARE_API_VERSION || "2026-05-20");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${squareApiBaseUrl(environment)}${path}`, {
    ...init,
    headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = Array.isArray(body.errors) ? body.errors.map((error: { detail?: string }) => error.detail).filter(Boolean).join("; ") : "";
    throw new Error(detail || `Square request failed with status ${response.status}.`);
  }

  return body as T;
}

function squareQuickPay(input: {
  amountCents: number;
  currency: string;
  locationId: string;
  name: string;
}) {
  if (input.amountCents <= 0) throw new Error("Square checkout requires a positive amount.");
  return {
    location_id: input.locationId,
    name: input.name.slice(0, 255),
    price_money: {
      amount: input.amountCents,
      currency: assertSquareCurrency(input.currency)
    }
  };
}

function squareAcceptedPaymentMethods() {
  return {
    apple_pay: true,
    cash_app_pay: true,
    google_pay: true
  };
}

function squareOrderMetadata(order: {
  id: string;
  orderNumber: string;
  payments: { id: string }[];
  siteId: string;
}) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentId: order.payments[0]?.id || "",
    siteId: order.siteId
  };
}

function squareBillingMetadata(input: {
  billingDocumentId: string;
  billingPaymentId: string;
  documentNumber: string;
  siteId: string;
}) {
  return {
    billingDocumentId: input.billingDocumentId,
    billingPaymentId: input.billingPaymentId,
    documentNumber: input.documentNumber,
    siteId: input.siteId,
    targetType: "billing_document"
  };
}

function squarePaymentNote(metadata: Record<string, string>) {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}:${value}`)
    .join(" ")
    .slice(0, 500);
}

export async function createSquareCheckoutSessionForOrder(orderId: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  const credential = await getConnectedGatewayCredential(currentSiteId, PaymentProvider.SQUARE);
  if (!isSquareCredentialUsable(credential)) throw new Error("Connect Square before creating Square checkout.");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      siteId: currentSiteId
    },
    include: {
      gallerySelectionPurchase: { select: { id: true } },
      payments: {
        where: { provider: PaymentProvider.SQUARE },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  if (!order) throw new Error("Order not found.");
  if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.DRAFT) {
    throw new Error("Square checkout sessions can only be created before payment.");
  }
  if (order.totalCents <= 0) throw new Error("Square checkout requires a positive order total.");

  // Ordinary commerce retains its original payment choice; a gallery renewal
  // has a new immutable payment attempt and must never reuse an older key.
  const payment =
    (order.gallerySelectionPurchase
      ? await prisma.payment.findFirst({ where: { orderId: order.id, provider: PaymentProvider.SQUARE }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
      : order.payments[0]) ||
    (await prisma.payment.create({
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        orderId: order.id,
        provider: PaymentProvider.SQUARE,
        status: PaymentStatus.PENDING
      }
    }));
  if (order.gallerySelectionPurchase) assertGalleryCheckoutCreation(payment);
  const metadata = squareOrderMetadata({
    ...order,
    payments: [payment]
  });
  const response = await squareFetch<SquarePaymentLinkResponse>(order.siteId, "/v2/online-checkout/payment-links", {
    body: JSON.stringify({
      checkout_options: {
        accepted_payment_methods: squareAcceptedPaymentMethods(),
        redirect_url: publicOrderUrl(order.orderNumber, "success", Boolean(order.gallerySelectionPurchase))
      },
      description: `Order ${order.orderNumber}`,
      idempotency_key: `order_${order.id}_${payment.id}`,
      payment_note: squarePaymentNote(metadata),
      pre_populated_data: {
        buyer_email: order.customerEmail
      },
      quick_pay: squareQuickPay({
        amountCents: order.totalCents,
        currency: order.currency,
        locationId: squareLocationId(credential),
        name: `Order ${order.orderNumber}`
      })
    }),
    method: "POST"
  });
  const paymentLink = response.payment_link;
  if (!paymentLink?.url || !paymentLink.id) throw new Error("Square did not return a hosted checkout URL.");

  const rawSummary = {
    acceptedPaymentMethods: squareAcceptedPaymentMethods(),
    checkoutSession: {
      id: paymentLink.id,
      merchantId: credential.merchantId,
      orderId: paymentLink.order_id || "",
      url: paymentLink.url
    },
    pciScope: "Hosted/tokenized collection only. No raw card data is stored.",
    strategy: "square_payment_link"
  } satisfies Prisma.InputJsonObject;

  const orderCheckoutData = {
    checkoutUrl: paymentLink.url,
    notes: order.notes.includes("Square checkout")
      ? order.notes
      : `${order.notes ? `${order.notes}\n` : ""}Square checkout link created.`
  } satisfies Prisma.OrderUpdateManyMutationInput;
  const paymentCheckoutData = {
    amountCents: order.totalCents,
    currency: order.currency,
    externalCheckoutSession: paymentLink.id,
    externalPaymentId: paymentLink.order_id || payment.externalPaymentId,
    rawSummary,
    status: PaymentStatus.PENDING
  } satisfies Prisma.PaymentUpdateManyMutationInput;
  if (order.gallerySelectionPurchase) {
    await persistGalleryHostedCheckout({ purchaseId: order.gallerySelectionPurchase.id, orderId: order.id, paymentId: payment.id,
      siteId: order.siteId, orderData: orderCheckoutData, paymentData: paymentCheckoutData });
  } else {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: orderCheckoutData }),
      prisma.payment.update({ where: { id: payment.id }, data: paymentCheckoutData })
    ]);
  }

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { payments: true }
  });
}

export async function createSquareCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  siteId?: string;
  recoveryOnly?: boolean;
}) {
  const currentSiteId = input.siteId || (await getCurrentSiteId());
  const credential = await getConnectedGatewayCredential(currentSiteId, PaymentProvider.SQUARE);
  if (!credential || !isSquareCredentialUsable(credential)) throw new Error("Connect Square before creating Square checkout.");

  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.billingDocument.findFirst({
      where: {
        id: input.billingDocumentId,
        siteId: currentSiteId
      },
      include: {
        payments: true
      }
    });

    if (!document) throw new Error("Billing document not found.");
    if (document.status === BillingDocumentStatus.DRAFT) throw new Error("Send the billing document before payment.");
    if (document.status === BillingDocumentStatus.PAID || document.status === BillingDocumentStatus.VOID) {
      throw new Error("Finalized billing documents cannot receive another payment.");
    }

    const payment = await reserveBillingCheckout(tx, document, input.amountCents, PaymentProvider.SQUARE,
      `${metadataObject(credential.metadata).environment || "production"}:${credential.merchantId}:${squareLocationId(credential)}`, input.recoveryOnly);
    const publicAccessToken = await ensureBillingPublicToken(tx, document.id);

    return {
      document: {
        bookingId: document.bookingId,
        status: document.status,
        totalCents: document.totalCents,
        currency: document.currency,
        customerEmail: document.customerEmail,
        documentNumber: document.documentNumber,
        id: document.id,
        publicAccessToken,
        siteId: document.siteId
      },
      payment
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const metadata = squareBillingMetadata({
    billingDocumentId: result.document.id,
    billingPaymentId: result.payment.id,
    documentNumber: result.document.documentNumber,
    siteId: result.document.siteId
  });
  const response = await squareFetch<SquarePaymentLinkResponse>(result.document.siteId, "/v2/online-checkout/payment-links", {
    body: JSON.stringify({
      checkout_options: {
        accepted_payment_methods: squareAcceptedPaymentMethods(),
        redirect_url: publicBillingUrl(result.document.publicAccessToken, "success")
      },
      description: `Payment for ${result.document.documentNumber}`,
      idempotency_key: `billing_${result.document.id}_${result.payment.id}`,
      payment_note: squarePaymentNote(metadata),
      pre_populated_data: {
        buyer_email: result.document.customerEmail
      },
      quick_pay: squareQuickPay({
        amountCents: result.payment.amountCents,
        currency: result.payment.currency,
        locationId: squareLocationId(credential),
        name: `Payment for ${result.document.documentNumber}`
      })
    }),
    method: "POST"
  });
  const paymentLink = response.payment_link;
  if (!paymentLink?.url || !paymentLink.id) throw new Error("Square did not return a hosted checkout URL.");

  const rawSummary = {
    acceptedPaymentMethods: squareAcceptedPaymentMethods(),
    checkoutSession: {
      id: paymentLink.id,
      merchantId: credential.merchantId,
      orderId: paymentLink.order_id || "",
      url: paymentLink.url
    },
    pciScope: "Hosted/tokenized collection only. No raw card data is stored.",
    strategy: "square_payment_link_billing_document"
  } satisfies Prisma.InputJsonObject;

  await persistBillingCheckout(result.document, result.payment.id, {
    checkoutProvider: PaymentProvider.SQUARE,
    checkoutUrl: paymentLink.url,
    paymentExternalReference: paymentLink.order_id || paymentLink.id
  }, {
    externalCheckoutSession: paymentLink.id,
    externalOrderId: paymentLink.order_id || null,
    rawSummary
  }, input.recoveryOnly);

  return {
    checkoutUrl: paymentLink.url,
    paymentId: result.payment.id
  };
}

function signatureMatches(signatureKey: string, rawBody: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", signatureKey)
    .update(`${squareWebhookNotificationUrl()}${rawBody}`)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function constructSquareWebhookEvent(rawBody: string, signature: string | null) {
  if (!signature) throw new PaymentWebhookRejected("Missing x-square-hmacsha256-signature header.");

  const credentials = await getWebhookSigningCredentials("SQUARE");
  const fallback = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (fallback && !credentials.some(({ siteId, secret }) => siteId === DEFAULT_SITE_ID && secret === fallback)) {
    const credential = await getConnectedGatewayCredential(DEFAULT_SITE_ID, PaymentProvider.SQUARE);
    const metadata = metadataObject(credential?.metadata ?? null);
    credentials.push({ siteId: DEFAULT_SITE_ID, secret: fallback, merchantId: credential?.merchantId || "", environment: metadata.environment === "sandbox" ? "sandbox" : "production" });
  }
  const verified = credentials.filter(({ secret }) => signatureMatches(secret, rawBody, signature));
  const match = verified[0];
  const event = JSON.parse(rawBody) as SquareWebhookEvent;
  if (verified.length !== 1 || !match || !event?.event_id || !event.merchant_id || event.merchant_id !== match.merchantId) {
    throw new PaymentWebhookRejected("Square webhook merchant could not be verified.");
  }
  return { event, siteId: match.siteId, environment: match.environment || "production" };
}

function squareEventSummary(event: SquareWebhookEvent): Prisma.InputJsonObject {
  const payment = event.data?.object?.payment;
  const refund = event.data?.object?.refund;
  return {
    createdAt: event.created_at || "",
    dataId: event.data?.id || "",
    dataType: event.data?.type || "",
    eventId: event.event_id || "",
    merchantId: event.merchant_id || "",
    payment: payment
      ? {
          amount: payment.amount_money?.amount,
          currency: payment.amount_money?.currency,
          id: payment.id || "",
          orderId: payment.order_id || "",
          receiptUrl: payment.receipt_url || "",
          status: payment.status || ""
        }
      : undefined,
    refund: refund
      ? {
          amount: refund.amount_money?.amount,
          currency: refund.amount_money?.currency,
          id: refund.id || "",
          paymentId: refund.payment_id || "",
          status: refund.status || ""
        }
      : undefined,
    type: event.type || ""
  };
}

async function claimSquareEvent(event: SquareWebhookEvent, siteId: string) {
  const eventId = event.event_id || event.data?.id || crypto.randomUUID();
  const historical = await prisma.squareWebhookEvent.findFirst({
    where: { siteId: "", eventId, status: SquareWebhookEventStatus.PROCESSED },
    select: { id: true }
  });
  if (historical) return { claimed: false, eventId };
  try {
    await prisma.squareWebhookEvent.create({
      data: {
        siteId,
        eventId,
        merchantId: event.merchant_id || "",
        status: SquareWebhookEventStatus.PROCESSING,
        summary: squareEventSummary(event),
        type: event.type || event.data?.type || ""
      }
    });
    return { claimed: true, eventId };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const reclaimed = await prisma.squareWebhookEvent.updateMany({
      where: {
        siteId,
        eventId,
        OR: [
          { status: SquareWebhookEventStatus.FAILED },
          {
            status: SquareWebhookEventStatus.PROCESSING,
            updatedAt: {
              lte: new Date(Date.now() - squareEventStaleProcessingMs)
            }
          }
        ]
      },
      data: {
        error: "",
        merchantId: event.merchant_id || "",
        processedAt: null,
        status: SquareWebhookEventStatus.PROCESSING,
        summary: squareEventSummary(event),
        type: event.type || event.data?.type || ""
      }
    });

    return { claimed: reclaimed.count === 1, eventId };
  }
}

async function markSquareEventProcessed(siteId: string, eventId: string) {
  await prisma.squareWebhookEvent.update({
    where: { siteId_eventId: { siteId, eventId } },
    data: {
      error: "",
      processedAt: new Date(),
      status: SquareWebhookEventStatus.PROCESSED
    }
  });
}

async function markSquareEventFailed(siteId: string, eventId: string) {
  await prisma.squareWebhookEvent.update({
    where: { siteId_eventId: { siteId, eventId } },
    data: {
      error: "Square webhook handling failed.",
      processedAt: null,
      status: SquareWebhookEventStatus.FAILED
    }
  });
}

async function findSquarePayment(payment: SquarePayment, siteId: string) {
  const identifiers = [payment.id, payment.order_id].filter(Boolean) as string[];
  if (!identifiers.length) return null;

  return prisma.payment.findFirst({
    where: {
      provider: PaymentProvider.SQUARE,
      order: { siteId },
      OR: [
        { externalPaymentId: { in: identifiers } },
        { externalCheckoutSession: { in: identifiers } }
      ]
    },
    include: { order: { include: { gallerySelectionPurchase: { select: { id: true } } } } },
    orderBy: { createdAt: "asc" }
  });
}

async function findSquareBillingPayment(payment: SquarePayment, siteId: string) {
  if (!payment.id) return null;
  const matches = await prisma.billingPayment.findMany({
    where: {
      provider: PaymentProvider.SQUARE,
      billingDocument: { siteId },
      OR: [
        { externalPaymentId: payment.id },
        ...(payment.order_id ? [
          { externalOrderId: payment.order_id },
          { externalOrderId: null, externalPaymentId: payment.order_id, externalCheckoutSession: { not: null } }
        ] : [])
      ]
    },
    include: { billingDocument: true },
    take: 2
  });
  const match = matches[0];
  if (matches.length !== 1 || !match) return null;
  const orderId = match.externalOrderId ||
    metadataObject(metadataObject(match.rawSummary).payment ?? null).orderId ||
    metadataObject(metadataObject(match.rawSummary).checkoutSession ?? null).orderId;
  if (orderId && payment.order_id && orderId !== payment.order_id) return null;
  if (match.externalPaymentId && match.externalPaymentId !== payment.id &&
      (match.externalOrderId || match.externalPaymentId !== payment.order_id)) return null;
  return match;
}

async function handleSquarePaymentUpdated(event: SquareWebhookEvent, payment: SquarePayment, siteId: string) {
  // A failed card attempt does not close its reusable Square payment link.
  if (payment.status !== "COMPLETED") return;

  const orderPayment = await findSquarePayment(payment, siteId);
  if (orderPayment) {
    const checkoutIdentity = metadataObject(metadataObject(orderPayment.rawSummary).checkoutSession ?? null);
    if (orderPayment.order.gallerySelectionPurchase) {
      const savedOrderId = typeof checkoutIdentity.orderId === "string" ? checkoutIdentity.orderId : orderPayment.externalPaymentId;
      requireCheckoutIdentity(Boolean(payment.id) && Boolean(savedOrderId) && payment.order_id === savedOrderId);
    }
    const paidAmount = payment.total_money?.amount ?? payment.amount_money?.amount;
    const currency = payment.total_money?.currency ?? payment.amount_money?.currency ?? "";
    if (paidAmount !== orderPayment.amountCents) {
      throw new Error(`Square payment amount mismatch for order ${orderPayment.order.orderNumber}.`);
    }
    if (currency.toUpperCase() !== orderPayment.currency.toUpperCase()) {
      throw new Error(`Square payment currency mismatch for order ${orderPayment.order.orderNumber}.`);
    }

    await prisma.payment.update({
      where: { id: orderPayment.id },
      data: {
        externalPaymentId: payment.id || orderPayment.externalPaymentId,
        hostedReceiptUrl: payment.receipt_url || orderPayment.hostedReceiptUrl,
        rawSummary: orderPayment.order.gallerySelectionPurchase ? { ...squareEventSummary(event), checkoutSession: checkoutIdentity } : squareEventSummary(event),
        providerVerifiedAt: new Date(),
        status: PaymentStatus.PAID
      }
    });
    await updateOrderStatus({
      orderId: orderPayment.orderId,
      providerConfirmed: true,
      siteId: orderPayment.order.siteId,
      status: OrderStatus.PAID
    });
    return;
  }

  const billingPayment = await findSquareBillingPayment(payment, siteId);
  if (!billingPayment) throw new Error("Square payment record not found.");
  const paidAmount = payment.total_money?.amount ?? payment.amount_money?.amount;
  const currency = payment.total_money?.currency ?? payment.amount_money?.currency ?? "";
  if (paidAmount !== billingPayment.amountCents) {
    throw new Error(`Square payment amount mismatch for billing document ${billingPayment.billingDocument.documentNumber}.`);
  }
  if (currency.toUpperCase() !== billingPayment.currency.toUpperCase()) {
    throw new Error(`Square payment currency mismatch for billing document ${billingPayment.billingDocument.documentNumber}.`);
  }

  await settleBillingPayment({
    billingPaymentId: billingPayment.id,
    capturedAt: new Date(payment.created_at || event.created_at || ""),
    externalOrderId: payment.order_id,
    externalPaymentId: payment.id,
    hostedReceiptUrl: payment.receipt_url || billingPayment.hostedReceiptUrl || undefined,
    rawSummary: squareEventSummary(event),
    siteId: billingPayment.billingDocument.siteId
  });
}

export async function closeSquareBookingCheckout(siteId: string, linkId: string, orderId: string) {
  const { credential } = await getSquareAccessToken(siteId);
  const { order } = await squareFetch<{ order?: { id?: string; state?: string; location_id?: string; tenders?: unknown[] } }>(
    siteId, `/v2/orders/${encodeURIComponent(orderId)}`, { signal: AbortSignal.timeout(10_000) }
  );
  if (order?.id !== orderId || order.location_id !== squareLocationId(credential)) throw new Error("Square checkout identity changed.");
  if (order.tenders?.length || order.state === "COMPLETED") return false;
  if (order.state === "CANCELED") return true;
  if (order.state !== "OPEN") return false;
  const closed = await squareFetch<{ id?: string; cancelled_order_id?: string }>(
    siteId, `/v2/online-checkout/payment-links/${encodeURIComponent(linkId)}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) }
  );
  return closed.id === linkId && closed.cancelled_order_id === orderId;
}

async function handleSquareRefundUpdated(event: SquareWebhookEvent, refund: SquareRefund, siteId: string) {
  if (!refund.payment_id) return;

  const orderPayment = await prisma.payment.findFirst({
    where: {
      externalPaymentId: refund.payment_id,
      order: { siteId },
      provider: PaymentProvider.SQUARE
    },
    include: { order: { include: { gallerySelectionPurchase: { select: { id: true } } } } }
  });
  if (orderPayment) {
    if (refund.status !== "COMPLETED") return;
    await revokeGalleryPurchaseForRefund({ orderId: orderPayment.orderId, siteId: orderPayment.order.siteId,
      amountCents: refund.amount_money?.amount || 0, currency: refund.amount_money?.currency || "", paymentCurrency: orderPayment.currency });
    const isFullRefund = (refund.amount_money?.amount || 0) >= orderPayment.amountCents;
    await prisma.payment.update({
      where: { id: orderPayment.id },
      data: {
        rawSummary: orderPayment.order.gallerySelectionPurchase ? { ...metadataObject(orderPayment.rawSummary), ...squareEventSummary(event) } : squareEventSummary(event),
        status: isFullRefund ? PaymentStatus.REFUNDED : orderPayment.status
      }
    });
    if (isFullRefund) {
      await updateOrderStatus({
        orderId: orderPayment.orderId,
        providerConfirmed: true,
        siteId: orderPayment.order.siteId,
        status: OrderStatus.REFUNDED
      });
    }
    return;
  }

  const billingPayment = await prisma.billingPayment.findFirst({
    where: {
      externalPaymentId: refund.payment_id,
      billingDocument: { siteId },
      provider: PaymentProvider.SQUARE
    }
  });
  // Refunds can precede the paid event that binds Square payment ID to the local attempt.
  // Keep this event retryable rather than acknowledging and losing revocation evidence.
  if (!billingPayment) throw new Error("Square refund payment record not found; retry after payment reconciliation.");
  await recordBillingRefund(siteId, billingPayment.id, refund.payment_id, squareRefundObservation(refund));
}

async function dispatchSquareEvent(event: SquareWebhookEvent, siteId: string) {
  const payment = event.data?.object?.payment;
  if ((event.type === "payment.updated" || event.type === "payment.created") && payment) {
    await handleSquarePaymentUpdated(event, payment, siteId);
    return;
  }

  const refund = event.data?.object?.refund;
  if ((event.type === "refund.updated" || event.type === "refund.created") && refund) {
    await handleSquareRefundUpdated(event, refund, siteId);
  }
}

export async function handleSquareWebhookEvent(event: SquareWebhookEvent, siteId: string) {
  const claim = await claimSquareEvent(event, siteId);
  if (!claim.claimed) return { duplicate: true };

  try {
    await dispatchSquareEvent(event, siteId);
    await markSquareEventProcessed(siteId, claim.eventId);
    return { duplicate: false };
  } catch (error) {
    await markSquareEventFailed(siteId, claim.eventId);
    throw error;
  }
}

async function createSquareGatewayCheckoutSession(input: PaymentGatewayCheckoutInput) {
  if (input.kind === "order") {
    const order = await createSquareCheckoutSessionForOrder(input.orderId, input.siteId);
    return {
      checkoutUrl: String(order.checkoutUrl || ""),
      order,
      provider: PaymentProvider.SQUARE
    };
  }

  const result = await createSquareCheckoutSessionForBillingDocument({
    amountCents: input.amountCents,
    billingDocumentId: input.billingDocumentId,
    recoveryOnly: input.recoveryOnly,
    siteId: input.siteId
  });

  return {
    checkoutUrl: result.checkoutUrl,
    paymentId: result.paymentId,
    provider: PaymentProvider.SQUARE
  };
}

async function refundSquareGatewayPayment(input: { amountCents?: number; paymentId: string; siteId: string }) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      order: { siteId: input.siteId },
      provider: PaymentProvider.SQUARE
    },
    include: { order: true }
  });
  if (payment) {
    if (!payment.externalPaymentId) throw new Error("Square payment id is missing for this order payment.");
    const amountCents = input.amountCents || payment.amountCents;
    const response = await squareFetch<{ refund?: SquareRefund }>(payment.order.siteId, "/v2/refunds", {
      body: JSON.stringify({
        amount_money: {
          amount: amountCents,
          currency: assertSquareCurrency(payment.currency)
        },
        idempotency_key: `refund_${payment.id}_${amountCents}`,
        payment_id: payment.externalPaymentId
      }),
      method: "POST"
    });
    if (response.refund?.status === "COMPLETED") await revokeGalleryPurchaseForRefund({ orderId: payment.orderId, siteId: payment.order.siteId,
      amountCents: response.refund.amount_money?.amount || 0, currency: response.refund.amount_money?.currency || "", paymentCurrency: payment.currency });
    const isFullRefund = amountCents >= payment.amountCents;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        rawSummary: {
          refund: response.refund || {},
          strategy: "square_refund"
        },
        status: isFullRefund ? PaymentStatus.REFUNDED : payment.status
      }
    });
    if (isFullRefund) {
      await updateOrderStatus({
        orderId: payment.orderId,
        providerConfirmed: true,
        siteId: payment.order.siteId,
        status: OrderStatus.REFUNDED
      });
    }
    return response.refund;
  }

  throw new Error("Square order payment not found for refund.");
}

function squareRefundObservation(refund: SquareRefund): BillingRefundObservation {
  return {
    externalRefundId: refund.id || "", amountCents: refund.amount_money?.amount || 0,
    currency: refund.amount_money?.currency || "", providerCreatedAt: new Date(refund.created_at || ""),
    status: refund.status === "COMPLETED" ? "SUCCEEDED" : refund.status === "FAILED" || refund.status === "REJECTED" ? "FAILED" : "PENDING"
  };
}

async function refundSquareBilling(input: GatewayBillingRefundInput) {
  const signal = AbortSignal.timeout(10_000);
  const response = input.externalRefundId
    ? await squareFetch<{ refund?: SquareRefund }>(input.siteId, `/v2/refunds/${encodeURIComponent(input.externalRefundId)}`, { signal })
    : await squareFetch<{ refund?: SquareRefund }>(input.siteId, "/v2/refunds", {
      body: JSON.stringify({
        amount_money: { amount: input.amountCents, currency: assertSquareCurrency(input.currency) },
        idempotency_key: input.requestId, payment_id: input.captureId
      }), method: "POST", signal
    });
  if (!response.refund || response.refund.payment_id !== input.captureId) throw new Error("Square refund capture does not match.");
  return squareRefundObservation(response.refund);
}

export const squarePaymentGateway: PaymentGateway = {
  provider: PaymentProvider.SQUARE,
  createCheckoutSession: createSquareGatewayCheckoutSession,
  handleWebhookEvent: ({ event, siteId }) => handleSquareWebhookEvent(event as SquareWebhookEvent, siteId),
  refundBilling: refundSquareBilling,
  refund: async (input) => refundSquareGatewayPayment(input),
  supportedWallets: async () => ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"] satisfies PaymentWallet[],
  verifyWebhook: ({ rawBody, signature }) => constructSquareWebhookEvent(rawBody, signature)
};

/** Never delete/cancel an active Square link just to make another checkout. */
export async function inspectSquareGalleryCheckout(input: GalleryCheckoutIdentity): Promise<GalleryCheckoutInspection> {
  const credential = await getConnectedGatewayCredential(input.siteId, PaymentProvider.SQUARE);
  if (!isSquareCredentialUsable(credential)) throw new Error("Square checkout verification is unavailable.");
  if (!input.externalPaymentId) throw new Error("Square checkout is missing its original order identity.");
  const response = await squareFetch<{ order?: {
    id?: string; location_id?: string; state?: string; total_money?: SquareMoney; tenders?: unknown[];
  } }>(input.siteId, `/v2/orders/${encodeURIComponent(input.externalPaymentId)}`);
  const order = response.order;
  requireCheckoutIdentity(order?.id === input.externalPaymentId && order?.location_id === squareLocationId(credential) &&
    order?.total_money?.amount === input.amountCents && order.total_money.currency?.toUpperCase() === input.currency.toUpperCase());
  if (order?.tenders?.length) return { state: "WAITING" };
  if (order?.state === "CANCELED") return { state: "TERMINAL", providerState: "CANCELED" };
  if (order?.state !== "OPEN" && order?.state !== "DRAFT") return { state: "WAITING" };
  const link = (await squareFetch<SquarePaymentLinkResponse>(input.siteId, `/v2/online-checkout/payment-links/${encodeURIComponent(input.checkoutSessionId)}`)).payment_link;
  requireCheckoutIdentity(link?.id === input.checkoutSessionId && link?.order_id === order.id);
  return { state: "OPEN", checkoutUrl: safeHostedCheckoutUrl(link?.url) };
}
