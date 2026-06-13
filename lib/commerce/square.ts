import "server-only";

import crypto from "node:crypto";
import {
  BillingDocumentStatus,
  OrderStatus,
  PaymentGatewayConnectionStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SquareWebhookEventStatus
} from "@prisma/client";
import { ensureBillingPublicToken } from "@/lib/billing/documents";
import { getBillingPaymentSummary, markBillingPaymentFailed, settleBillingPayment } from "@/lib/billing/payments";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { createSquareConnectAuthorizeUrl, getSquareAccessToken, squareApiBaseUrl } from "@/lib/payments/square-connect";
import type { PaymentGateway, PaymentGatewayCheckoutInput, PaymentWallet } from "@/lib/payments/types";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { updateOrderStatus } from "./orders";

type SquareMoney = {
  amount?: number;
  currency?: string;
};

type SquarePayment = {
  amount_money?: SquareMoney;
  id?: string;
  order_id?: string;
  receipt_url?: string;
  status?: string;
  total_money?: SquareMoney;
};

type SquareRefund = {
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

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function publicOrderUrl(orderNumber: string, status: "success" | "cancel") {
  const params = new URLSearchParams({
    checkout: status,
    order: orderNumber
  });

  return `${appBaseUrl()}/cart?${params.toString()}`;
}

function publicBillingUrl(token: string, status: "success" | "cancel") {
  const params = new URLSearchParams({
    checkout: status
  });

  return `${appBaseUrl()}/billing/${encodeURIComponent(token)}?${params.toString()}`;
}

function squareWebhookNotificationUrl() {
  return process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || `${appBaseUrl()}/api/webhooks/square`;
}

function requireSquareWebhookSignatureKey() {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";
  if (!signatureKey) throw new Error("SQUARE_WEBHOOK_SIGNATURE_KEY is required to verify Square webhooks.");
  return signatureKey;
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
  const { accessToken } = await getSquareAccessToken(siteId);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Square-Version", process.env.SQUARE_API_VERSION || "2026-05-20");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${squareApiBaseUrl()}${path}`, {
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
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED) throw new Error("Connect Square before creating Square checkout.");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      siteId: currentSiteId
    },
    include: {
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

  const payment =
    order.payments[0] ||
    (await prisma.payment.create({
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        orderId: order.id,
        provider: PaymentProvider.SQUARE,
        status: PaymentStatus.PENDING
      }
    }));
  const metadata = squareOrderMetadata({
    ...order,
    payments: [payment]
  });
  const response = await squareFetch<SquarePaymentLinkResponse>(order.siteId, "/v2/online-checkout/payment-links", {
    body: JSON.stringify({
      checkout_options: {
        accepted_payment_methods: squareAcceptedPaymentMethods(),
        redirect_url: publicOrderUrl(order.orderNumber, "success")
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

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        checkoutUrl: paymentLink.url,
        notes: order.notes.includes("Square checkout")
          ? order.notes
          : `${order.notes ? `${order.notes}\n` : ""}Square checkout link created.`
      }
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        externalCheckoutSession: paymentLink.id,
        externalPaymentId: paymentLink.order_id || payment.externalPaymentId,
        rawSummary,
        status: PaymentStatus.PENDING
      }
    })
  ]);

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { payments: true }
  });
}

export async function createSquareCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  siteId?: string;
}) {
  const currentSiteId = input.siteId || (await getCurrentSiteId());
  const credential = await getConnectedGatewayCredential(currentSiteId, PaymentProvider.SQUARE);
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED) throw new Error("Connect Square before creating Square checkout.");

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

    const summary = await getBillingPaymentSummary(tx, document.id, { reservePending: true });
    const availableCents = Math.max(0, document.totalCents - summary.reservedCents);
    if (availableCents <= 0) throw new Error("This document has no remaining balance.");
    if (input.amountCents <= 0 || input.amountCents > availableCents) {
      throw new Error("Payment amount must be greater than zero and no more than the remaining balance.");
    }

    const publicAccessToken = await ensureBillingPublicToken(tx, document.id);
    const payment = await tx.billingPayment.create({
      data: {
        amountCents: input.amountCents,
        billingDocumentId: document.id,
        currency: document.currency,
        provider: PaymentProvider.SQUARE,
        status: PaymentStatus.PENDING
      }
    });

    return {
      document: {
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

  await prisma.$transaction([
    prisma.billingDocument.update({
      where: { id: result.document.id },
      data: {
        checkoutProvider: PaymentProvider.SQUARE,
        checkoutUrl: paymentLink.url,
        paymentExternalReference: paymentLink.order_id || paymentLink.id
      }
    }),
    prisma.billingPayment.update({
      where: { id: result.payment.id },
      data: {
        externalCheckoutSession: paymentLink.id,
        externalPaymentId: paymentLink.order_id || result.payment.externalPaymentId,
        rawSummary,
        status: PaymentStatus.PENDING
      }
    })
  ]);

  return {
    checkoutUrl: paymentLink.url,
    paymentId: result.payment.id
  };
}

export function constructSquareWebhookEvent(rawBody: string, signature: string | null) {
  if (!signature) throw new Error("Missing x-square-hmacsha256-signature header.");
  const expected = crypto
    .createHmac("sha256", requireSquareWebhookSignatureKey())
    .update(`${squareWebhookNotificationUrl()}${rawBody}`)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Square webhook signature is invalid.");
  }

  return JSON.parse(rawBody) as SquareWebhookEvent;
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

async function claimSquareEvent(event: SquareWebhookEvent) {
  const eventId = event.event_id || event.data?.id || crypto.randomUUID();
  try {
    await prisma.squareWebhookEvent.create({
      data: {
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

async function markSquareEventProcessed(eventId: string) {
  await prisma.squareWebhookEvent.update({
    where: { eventId },
    data: {
      error: "",
      processedAt: new Date(),
      status: SquareWebhookEventStatus.PROCESSED
    }
  });
}

async function markSquareEventFailed(eventId: string, error: unknown) {
  await prisma.squareWebhookEvent.update({
    where: { eventId },
    data: {
      error: error instanceof Error ? error.message.slice(0, 1000) : "Square webhook handling failed.",
      processedAt: null,
      status: SquareWebhookEventStatus.FAILED
    }
  });
}

async function findSquarePayment(payment: SquarePayment) {
  const identifiers = [payment.id, payment.order_id].filter(Boolean) as string[];
  if (!identifiers.length) return null;

  return prisma.payment.findFirst({
    where: {
      provider: PaymentProvider.SQUARE,
      OR: [
        { externalPaymentId: { in: identifiers } },
        { externalCheckoutSession: { in: identifiers } }
      ]
    },
    include: { order: true },
    orderBy: { createdAt: "asc" }
  });
}

async function findSquareBillingPayment(payment: SquarePayment) {
  const identifiers = [payment.id, payment.order_id].filter(Boolean) as string[];
  if (!identifiers.length) return null;

  return prisma.billingPayment.findFirst({
    where: {
      provider: PaymentProvider.SQUARE,
      OR: [
        { externalPaymentId: { in: identifiers } },
        { externalCheckoutSession: { in: identifiers } }
      ]
    },
    include: { billingDocument: true },
    orderBy: { createdAt: "asc" }
  });
}

async function handleSquarePaymentUpdated(event: SquareWebhookEvent, payment: SquarePayment) {
  if (payment.status !== "COMPLETED") {
    if (payment.status === "FAILED" || payment.status === "CANCELED") {
      const billingPayment = await findSquareBillingPayment(payment);
      if (billingPayment) {
        await markBillingPaymentFailed({
          billingPaymentId: billingPayment.id,
          externalPaymentId: payment.id || billingPayment.externalPaymentId || undefined,
          rawSummary: squareEventSummary(event),
          siteId: billingPayment.billingDocument.siteId
        });
      }
    }
    return;
  }

  const orderPayment = await findSquarePayment(payment);
  if (orderPayment) {
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
        rawSummary: squareEventSummary(event),
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

  const billingPayment = await findSquareBillingPayment(payment);
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
    externalPaymentId: payment.id || billingPayment.externalPaymentId || undefined,
    hostedReceiptUrl: payment.receipt_url || billingPayment.hostedReceiptUrl || undefined,
    rawSummary: squareEventSummary(event),
    siteId: billingPayment.billingDocument.siteId
  });
}

async function handleSquareRefundUpdated(event: SquareWebhookEvent, refund: SquareRefund) {
  if (refund.status !== "COMPLETED" || !refund.payment_id) return;

  const orderPayment = await prisma.payment.findFirst({
    where: {
      externalPaymentId: refund.payment_id,
      provider: PaymentProvider.SQUARE
    },
    include: { order: true }
  });
  if (orderPayment) {
    const isFullRefund = (refund.amount_money?.amount || 0) >= orderPayment.amountCents;
    await prisma.payment.update({
      where: { id: orderPayment.id },
      data: {
        rawSummary: squareEventSummary(event),
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
      provider: PaymentProvider.SQUARE
    }
  });
  if (!billingPayment) return;
  const isFullRefund = (refund.amount_money?.amount || 0) >= billingPayment.amountCents;
  await prisma.billingPayment.update({
    where: { id: billingPayment.id },
    data: {
      rawSummary: squareEventSummary(event),
      status: isFullRefund ? PaymentStatus.REFUNDED : billingPayment.status
    }
  });
}

async function dispatchSquareEvent(event: SquareWebhookEvent) {
  const payment = event.data?.object?.payment;
  if ((event.type === "payment.updated" || event.type === "payment.created") && payment) {
    await handleSquarePaymentUpdated(event, payment);
    return;
  }

  const refund = event.data?.object?.refund;
  if ((event.type === "refund.updated" || event.type === "refund.created") && refund) {
    await handleSquareRefundUpdated(event, refund);
  }
}

export async function handleSquareWebhookEvent(event: SquareWebhookEvent) {
  const claim = await claimSquareEvent(event);
  if (!claim.claimed) return { duplicate: true };

  try {
    await dispatchSquareEvent(event);
    await markSquareEventProcessed(claim.eventId);
    return { duplicate: false };
  } catch (error) {
    await markSquareEventFailed(claim.eventId, error);
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

  const billingPayment = await prisma.billingPayment.findFirst({
    where: {
      billingDocument: { siteId: input.siteId },
      id: input.paymentId,
      provider: PaymentProvider.SQUARE
    },
    include: { billingDocument: true }
  });
  if (!billingPayment) throw new Error("Square payment record not found for refund.");
  if (!billingPayment.externalPaymentId) throw new Error("Square payment id is missing for this billing payment.");

  const amountCents = input.amountCents || billingPayment.amountCents;
  const response = await squareFetch<{ refund?: SquareRefund }>(billingPayment.billingDocument.siteId, "/v2/refunds", {
    body: JSON.stringify({
      amount_money: {
        amount: amountCents,
        currency: assertSquareCurrency(billingPayment.currency)
      },
      idempotency_key: `refund_${billingPayment.id}_${amountCents}`,
      payment_id: billingPayment.externalPaymentId
    }),
    method: "POST"
  });
  const isFullRefund = amountCents >= billingPayment.amountCents;
  await prisma.billingPayment.update({
    where: { id: billingPayment.id },
    data: {
      rawSummary: {
        refund: response.refund || {},
        strategy: "square_refund_billing_document"
      },
      status: isFullRefund ? PaymentStatus.REFUNDED : billingPayment.status
    }
  });

  return response.refund;
}

export const squarePaymentGateway: PaymentGateway = {
  provider: PaymentProvider.SQUARE,
  createCheckoutSession: createSquareGatewayCheckoutSession,
  createOnboardingSession: async (siteId: string) => ({
    provider: PaymentProvider.SQUARE,
    status: "pending",
    url: createSquareConnectAuthorizeUrl(siteId)
  }),
  handleWebhookEvent: async (event: unknown) => handleSquareWebhookEvent(event as SquareWebhookEvent),
  refund: async (input) => refundSquareGatewayPayment(input),
  supportedWallets: async () => ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"] satisfies PaymentWallet[],
  verifyWebhook: ({ rawBody, signature }) => constructSquareWebhookEvent(rawBody, signature)
};
