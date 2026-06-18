import "server-only";

import crypto from "node:crypto";
import {
  BillingDocumentStatus,
  OrderStatus,
  PayPalWebhookEventStatus,
  PaymentGatewayConnectionStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { ensureBillingPublicToken } from "@/lib/billing/documents";
import { getBillingPaymentSummary, markBillingPaymentFailed, settleBillingPayment } from "@/lib/billing/payments";
import { publicAppBaseUrl } from "@/lib/env";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { createPayPalPartnerReferralUrl, paypalFetch } from "@/lib/payments/paypal-connect";
import type { PaymentGateway, PaymentGatewayCheckoutInput } from "@/lib/payments/types";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { updateOrderStatus } from "./orders";

type PayPalLink = {
  href?: string;
  rel?: string;
};

type PayPalMoney = {
  currency_code?: string;
  value?: string;
};

type PayPalOrderResponse = {
  id?: string;
  links?: PayPalLink[];
  status?: string;
};

type PayPalCapture = {
  amount?: PayPalMoney;
  custom_id?: string;
  id?: string;
  invoice_id?: string;
  links?: PayPalLink[];
  seller_receivable_breakdown?: {
    gross_amount?: PayPalMoney;
  };
  status?: string;
  supplementary_data?: {
    related_ids?: {
      order_id?: string;
    };
  };
};

type PayPalCaptureResponse = {
  id?: string;
  purchase_units?: {
    payments?: {
      captures?: PayPalCapture[];
    };
  }[];
  status?: string;
};

type PayPalWebhookEvent = {
  create_time?: string;
  event_type?: string;
  id?: string;
  resource?: {
    amount?: PayPalMoney;
    custom_id?: string;
    id?: string;
    invoice_id?: string;
    links?: PayPalLink[];
    parent_payment?: string;
    seller_receivable_breakdown?: {
      gross_amount?: PayPalMoney;
    };
    status?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
  resource_type?: string;
  summary?: string;
};

type PayPalRefundResponse = {
  amount?: PayPalMoney;
  id?: string;
  status?: string;
};

const payPalEventStaleProcessingMs = 5 * 60 * 1000;

function publicOrderUrl(orderNumber: string, status: "success" | "cancel") {
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

function requirePayPalWebhookId() {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is required to verify PayPal webhooks.");
  return webhookId;
}

function assertPayPalCurrency(currency: string) {
  const safeCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(safeCurrency)) throw new Error("Currency is not supported by PayPal.");
  return safeCurrency;
}

function payPalAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function amountValueCents(value?: string) {
  const amount = Number(value || "0");
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

async function requireConnectedPayPalCredential(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.PAYPAL);
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED || !credential.merchantId.trim()) {
    throw new Error("Connect PayPal before creating PayPal checkout.");
  }

  return credential;
}

function approveUrl(order: PayPalOrderResponse) {
  return order.links?.find((link) => link.rel === "approve")?.href || "";
}

function orderRawSummary(input: {
  merchantId: string;
  order: PayPalOrderResponse;
  strategy: string;
}) {
  return {
    checkoutSession: {
      id: input.order.id || "",
      merchantId: input.merchantId,
      status: input.order.status || ""
    },
    pciScope: "Hosted/tokenized collection only. No raw card data is stored.",
    strategy: input.strategy
  } satisfies Prisma.InputJsonObject;
}

function payPalPurchaseUnit(input: {
  amountCents: number;
  currency: string;
  customId: string;
  description: string;
  merchantId: string;
}) {
  if (input.amountCents <= 0) throw new Error("PayPal checkout requires a positive amount.");
  return {
    amount: {
      currency_code: assertPayPalCurrency(input.currency),
      value: payPalAmount(input.amountCents)
    },
    custom_id: input.customId,
    description: input.description.slice(0, 127),
    payee: {
      merchant_id: input.merchantId
    }
  };
}

async function createPayPalOrder(input: {
  amountCents: number;
  cancelUrl: string;
  currency: string;
  customId: string;
  description: string;
  merchantId: string;
  returnUrl: string;
}) {
  return paypalFetch<PayPalOrderResponse>("/v2/checkout/orders", {
    body: JSON.stringify({
      application_context: {
        cancel_url: input.cancelUrl,
        return_url: input.returnUrl,
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW"
      },
      intent: "CAPTURE",
      purchase_units: [
        payPalPurchaseUnit({
          amountCents: input.amountCents,
          currency: input.currency,
          customId: input.customId,
          description: input.description,
          merchantId: input.merchantId
        })
      ]
    }),
    merchantId: input.merchantId,
    method: "POST",
    requestId: `paypal_order_${input.customId}`
  });
}

export async function createPayPalCheckoutSessionForOrder(orderId: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  const credential = await requireConnectedPayPalCredential(currentSiteId);
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      siteId: currentSiteId
    },
    include: {
      payments: {
        where: { provider: PaymentProvider.PAYPAL },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  if (!order) throw new Error("Order not found.");
  if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.DRAFT) {
    throw new Error("PayPal checkout sessions can only be created before payment.");
  }
  if (order.totalCents <= 0) throw new Error("PayPal checkout requires a positive order total.");

  const payment =
    order.payments[0] ||
    (await prisma.payment.create({
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        orderId: order.id,
        provider: PaymentProvider.PAYPAL,
        status: PaymentStatus.PENDING
      }
    }));
  const paypalOrder = await createPayPalOrder({
    amountCents: order.totalCents,
    cancelUrl: publicOrderUrl(order.orderNumber, "cancel"),
    currency: order.currency,
    customId: payment.id,
    description: `Order ${order.orderNumber}`,
    merchantId: credential.merchantId,
    returnUrl: publicOrderUrl(order.orderNumber, "success")
  });
  const checkoutUrl = approveUrl(paypalOrder);
  if (!paypalOrder.id || !checkoutUrl) throw new Error("PayPal did not return a hosted checkout URL.");

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        checkoutUrl,
        notes: order.notes.includes("PayPal checkout")
          ? order.notes
          : `${order.notes ? `${order.notes}\n` : ""}PayPal checkout order created.`
      }
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        externalCheckoutSession: paypalOrder.id,
        rawSummary: orderRawSummary({
          merchantId: credential.merchantId,
          order: paypalOrder,
          strategy: "paypal_order"
        }),
        status: PaymentStatus.PENDING
      }
    })
  ]);

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { payments: true }
  });
}

export async function createPayPalCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  siteId?: string;
}) {
  const currentSiteId = input.siteId || (await getCurrentSiteId());
  const credential = await requireConnectedPayPalCredential(currentSiteId);
  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.billingDocument.findFirst({
      where: {
        id: input.billingDocumentId,
        siteId: currentSiteId
      },
      include: { payments: true }
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
        provider: PaymentProvider.PAYPAL,
        status: PaymentStatus.PENDING
      }
    });

    return {
      document: {
        currency: document.currency,
        documentNumber: document.documentNumber,
        id: document.id,
        publicAccessToken,
        siteId: document.siteId
      },
      payment
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const paypalOrder = await createPayPalOrder({
    amountCents: result.payment.amountCents,
    cancelUrl: publicBillingUrl(result.document.publicAccessToken, "cancel"),
    currency: result.payment.currency,
    customId: result.payment.id,
    description: `Payment for ${result.document.documentNumber}`,
    merchantId: credential.merchantId,
    returnUrl: publicBillingUrl(result.document.publicAccessToken, "success")
  });
  const checkoutUrl = approveUrl(paypalOrder);
  if (!paypalOrder.id || !checkoutUrl) throw new Error("PayPal did not return a hosted checkout URL.");

  await prisma.$transaction([
    prisma.billingDocument.update({
      where: { id: result.document.id },
      data: {
        checkoutProvider: PaymentProvider.PAYPAL,
        checkoutUrl,
        paymentExternalReference: paypalOrder.id
      }
    }),
    prisma.billingPayment.update({
      where: { id: result.payment.id },
      data: {
        externalCheckoutSession: paypalOrder.id,
        rawSummary: orderRawSummary({
          merchantId: credential.merchantId,
          order: paypalOrder,
          strategy: "paypal_order_billing_document"
        }),
        status: PaymentStatus.PENDING
      }
    })
  ]);

  return {
    checkoutUrl,
    paymentId: result.payment.id
  };
}

export async function constructPayPalWebhookEvent(rawBody: string, headers: Headers) {
  const event = JSON.parse(rawBody) as PayPalWebhookEvent;
  const verification = await paypalFetch<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo") || "",
      cert_url: headers.get("paypal-cert-url") || "",
      transmission_id: headers.get("paypal-transmission-id") || "",
      transmission_sig: headers.get("paypal-transmission-sig") || "",
      transmission_time: headers.get("paypal-transmission-time") || "",
      webhook_event: event,
      webhook_id: requirePayPalWebhookId()
    }),
    method: "POST",
    requestId: `paypal_webhook_verify_${event.id || crypto.randomUUID()}`
  });
  if (verification.verification_status !== "SUCCESS") {
    throw new Error("PayPal webhook signature is invalid.");
  }

  return event;
}

function payPalEventSummary(event: PayPalWebhookEvent): Prisma.InputJsonObject {
  const resource = event.resource || {};
  const amount = resource.amount || resource.seller_receivable_breakdown?.gross_amount;
  return {
    createdAt: event.create_time || "",
    eventId: event.id || "",
    resource: {
      amount: amount?.value || "",
      captureId: resource.id || "",
      currency: amount?.currency_code || "",
      customId: resource.custom_id || "",
      orderId: resource.supplementary_data?.related_ids?.order_id || "",
      status: resource.status || ""
    },
    resourceType: event.resource_type || "",
    summary: event.summary || "",
    type: event.event_type || ""
  };
}

async function claimPayPalEvent(event: PayPalWebhookEvent) {
  const eventId = event.id || crypto.randomUUID();
  try {
    await prisma.payPalWebhookEvent.create({
      data: {
        eventId,
        status: PayPalWebhookEventStatus.PROCESSING,
        summary: payPalEventSummary(event),
        type: event.event_type || ""
      }
    });
    return { claimed: true, eventId };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const reclaimed = await prisma.payPalWebhookEvent.updateMany({
      where: {
        eventId,
        OR: [
          { status: PayPalWebhookEventStatus.FAILED },
          {
            status: PayPalWebhookEventStatus.PROCESSING,
            updatedAt: {
              lte: new Date(Date.now() - payPalEventStaleProcessingMs)
            }
          }
        ]
      },
      data: {
        error: "",
        processedAt: null,
        status: PayPalWebhookEventStatus.PROCESSING,
        summary: payPalEventSummary(event),
        type: event.event_type || ""
      }
    });

    return { claimed: reclaimed.count === 1, eventId };
  }
}

async function markPayPalEventProcessed(eventId: string) {
  await prisma.payPalWebhookEvent.update({
    where: { eventId },
    data: {
      error: "",
      processedAt: new Date(),
      status: PayPalWebhookEventStatus.PROCESSED
    }
  });
}

async function markPayPalEventFailed(eventId: string, error: unknown) {
  await prisma.payPalWebhookEvent.update({
    where: { eventId },
    data: {
      error: error instanceof Error ? error.message.slice(0, 1000) : "PayPal webhook handling failed.",
      processedAt: null,
      status: PayPalWebhookEventStatus.FAILED
    }
  });
}

async function findPayPalPayment(input: { captureId?: string; customId?: string; orderId?: string }) {
  const candidates: Prisma.PaymentWhereInput[] = [];
  if (input.customId) candidates.push({ id: input.customId });
  if (input.captureId) candidates.push({ externalPaymentId: input.captureId });
  if (input.orderId) candidates.push({ externalCheckoutSession: input.orderId });

  for (const candidate of candidates) {
    const payment = await prisma.payment.findFirst({
      where: {
        provider: PaymentProvider.PAYPAL,
        ...candidate
      },
      include: { order: true },
      orderBy: { createdAt: "asc" }
    });
    if (payment) return payment;
  }

  return null;
}

async function findPayPalBillingPayment(input: { captureId?: string; customId?: string; orderId?: string }) {
  const candidates: Prisma.BillingPaymentWhereInput[] = [];
  if (input.customId) candidates.push({ id: input.customId });
  if (input.captureId) candidates.push({ externalPaymentId: input.captureId });
  if (input.orderId) candidates.push({ externalCheckoutSession: input.orderId });

  for (const candidate of candidates) {
    const payment = await prisma.billingPayment.findFirst({
      where: {
        provider: PaymentProvider.PAYPAL,
        ...candidate
      },
      include: { billingDocument: true },
      orderBy: { createdAt: "asc" }
    });
    if (payment) return payment;
  }

  return null;
}

async function settlePayPalCapture(event: PayPalWebhookEvent, capture: PayPalCapture) {
  if (capture.status !== "COMPLETED") return;
  const orderId = capture.supplementary_data?.related_ids?.order_id || "";
  const capturedAmount = amountValueCents(capture.amount?.value || capture.seller_receivable_breakdown?.gross_amount?.value);
  const currency = capture.amount?.currency_code || capture.seller_receivable_breakdown?.gross_amount?.currency_code || "";

  const orderPayment = await findPayPalPayment({
    captureId: capture.id,
    customId: capture.custom_id,
    orderId
  });
  if (orderPayment) {
    if (capturedAmount !== orderPayment.amountCents) throw new Error(`PayPal capture amount mismatch for order ${orderPayment.order.orderNumber}.`);
    if (currency.toUpperCase() !== orderPayment.currency.toUpperCase()) throw new Error(`PayPal capture currency mismatch for order ${orderPayment.order.orderNumber}.`);

    await prisma.payment.update({
      where: { id: orderPayment.id },
      data: {
        externalPaymentId: capture.id || orderPayment.externalPaymentId,
        hostedReceiptUrl: capture.links?.find((link) => link.rel === "up")?.href || orderPayment.hostedReceiptUrl,
        rawSummary: payPalEventSummary(event),
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

  const billingPayment = await findPayPalBillingPayment({
    captureId: capture.id,
    customId: capture.custom_id,
    orderId
  });
  if (!billingPayment) throw new Error("PayPal payment record not found.");
  if (capturedAmount !== billingPayment.amountCents) {
    throw new Error(`PayPal capture amount mismatch for billing document ${billingPayment.billingDocument.documentNumber}.`);
  }
  if (currency.toUpperCase() !== billingPayment.currency.toUpperCase()) {
    throw new Error(`PayPal capture currency mismatch for billing document ${billingPayment.billingDocument.documentNumber}.`);
  }

  await settleBillingPayment({
    billingPaymentId: billingPayment.id,
    externalCheckoutSession: orderId || billingPayment.externalCheckoutSession || undefined,
    externalPaymentId: capture.id || billingPayment.externalPaymentId || undefined,
    hostedReceiptUrl: capture.links?.find((link) => link.rel === "up")?.href || billingPayment.hostedReceiptUrl || undefined,
    rawSummary: payPalEventSummary(event),
    siteId: billingPayment.billingDocument.siteId
  });
}

async function captureApprovedPayPalOrder(event: PayPalWebhookEvent) {
  const orderId = event.resource?.id || "";
  if (!orderId) return;
  const orderPayment = await findPayPalPayment({ orderId });
  const billingPayment = orderPayment ? null : await findPayPalBillingPayment({ orderId });
  const merchantId =
    orderPayment
      ? (await requireConnectedPayPalCredential(orderPayment.order.siteId)).merchantId
      : billingPayment
        ? (await requireConnectedPayPalCredential(billingPayment.billingDocument.siteId)).merchantId
        : "";
  if (!merchantId) throw new Error("PayPal payment record not found for approved order.");

  const captured = await paypalFetch<PayPalCaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    body: JSON.stringify({}),
    merchantId,
    method: "POST",
    requestId: `paypal_capture_${orderId}`
  });
  const capture = captured.purchase_units?.flatMap((unit) => unit.payments?.captures || [])[0];
  if (capture) {
    await settlePayPalCapture(
      {
        ...event,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: capture
      },
      capture
    );
  }
}

async function handlePayPalPaymentFailed(event: PayPalWebhookEvent) {
  const resource = event.resource || {};
  const orderId = resource.supplementary_data?.related_ids?.order_id || "";
  const billingPayment = await findPayPalBillingPayment({
    captureId: resource.id,
    customId: resource.custom_id,
    orderId
  });
  if (billingPayment) {
    await markBillingPaymentFailed({
      billingPaymentId: billingPayment.id,
      externalCheckoutSession: orderId || billingPayment.externalCheckoutSession || undefined,
      externalPaymentId: resource.id || billingPayment.externalPaymentId || undefined,
      rawSummary: payPalEventSummary(event),
      siteId: billingPayment.billingDocument.siteId
    });
    return;
  }

  const orderPayment = await findPayPalPayment({
    captureId: resource.id,
    customId: resource.custom_id,
    orderId
  });
  if (!orderPayment) return;
  await prisma.payment.update({
    where: { id: orderPayment.id },
    data: {
      externalPaymentId: resource.id || orderPayment.externalPaymentId,
      rawSummary: payPalEventSummary(event),
      status: orderPayment.status === PaymentStatus.PAID || orderPayment.status === PaymentStatus.REFUNDED ? orderPayment.status : PaymentStatus.FAILED
    }
  });
  if (orderPayment.order.status === OrderStatus.DRAFT || orderPayment.order.status === OrderStatus.PENDING) {
    await updateOrderStatus({
      orderId: orderPayment.orderId,
      siteId: orderPayment.order.siteId,
      status: OrderStatus.CANCELED
    });
  }
}

async function dispatchPayPalEvent(event: PayPalWebhookEvent) {
  if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
    await captureApprovedPayPalOrder(event);
    return;
  }

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && event.resource) {
    await settlePayPalCapture(event, event.resource);
    return;
  }

  if (
    event.event_type === "PAYMENT.CAPTURE.DENIED" ||
    event.event_type === "PAYMENT.CAPTURE.DECLINED" ||
    event.event_type === "CHECKOUT.ORDER.VOIDED"
  ) {
    await handlePayPalPaymentFailed(event);
  }
}

export async function handlePayPalWebhookEvent(event: PayPalWebhookEvent) {
  const claim = await claimPayPalEvent(event);
  if (!claim.claimed) return { duplicate: true };

  try {
    await dispatchPayPalEvent(event);
    await markPayPalEventProcessed(claim.eventId);
    return { duplicate: false };
  } catch (error) {
    await markPayPalEventFailed(claim.eventId, error);
    throw error;
  }
}

async function createPayPalGatewayCheckoutSession(input: PaymentGatewayCheckoutInput) {
  if (input.kind === "order") {
    const order = await createPayPalCheckoutSessionForOrder(input.orderId, input.siteId);
    return {
      checkoutUrl: String(order.checkoutUrl || ""),
      order,
      provider: PaymentProvider.PAYPAL
    };
  }

  const result = await createPayPalCheckoutSessionForBillingDocument({
    amountCents: input.amountCents,
    billingDocumentId: input.billingDocumentId,
    siteId: input.siteId
  });

  return {
    checkoutUrl: result.checkoutUrl,
    paymentId: result.paymentId,
    provider: PaymentProvider.PAYPAL
  };
}

async function refundPayPalGatewayPayment(input: { amountCents?: number; paymentId: string; siteId: string }) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      order: { siteId: input.siteId },
      provider: PaymentProvider.PAYPAL
    },
    include: { order: true }
  });
  if (payment) {
    if (!payment.externalPaymentId) throw new Error("PayPal capture id is missing for this order payment.");
    const amountCents = input.amountCents || payment.amountCents;
    const merchantId = (await requireConnectedPayPalCredential(payment.order.siteId)).merchantId;
    const refund = await paypalFetch<PayPalRefundResponse>(`/v2/payments/captures/${encodeURIComponent(payment.externalPaymentId)}/refund`, {
      body: JSON.stringify({
        amount: {
          currency_code: assertPayPalCurrency(payment.currency),
          value: payPalAmount(amountCents)
        }
      }),
      merchantId,
      method: "POST",
      requestId: `paypal_refund_${payment.id}_${amountCents}`
    });
    const isFullRefund = amountCents >= payment.amountCents;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        rawSummary: {
          refund,
          strategy: "paypal_refund"
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
    return refund;
  }

  const billingPayment = await prisma.billingPayment.findFirst({
    where: {
      billingDocument: { siteId: input.siteId },
      id: input.paymentId,
      provider: PaymentProvider.PAYPAL
    },
    include: { billingDocument: true }
  });
  if (!billingPayment) throw new Error("PayPal payment record not found for refund.");
  if (!billingPayment.externalPaymentId) throw new Error("PayPal capture id is missing for this billing payment.");

  const amountCents = input.amountCents || billingPayment.amountCents;
  const merchantId = (await requireConnectedPayPalCredential(billingPayment.billingDocument.siteId)).merchantId;
  const refund = await paypalFetch<PayPalRefundResponse>(`/v2/payments/captures/${encodeURIComponent(billingPayment.externalPaymentId)}/refund`, {
    body: JSON.stringify({
      amount: {
        currency_code: assertPayPalCurrency(billingPayment.currency),
        value: payPalAmount(amountCents)
      }
    }),
    merchantId,
    method: "POST",
    requestId: `paypal_refund_${billingPayment.id}_${amountCents}`
  });
  const isFullRefund = amountCents >= billingPayment.amountCents;
  await prisma.billingPayment.update({
    where: { id: billingPayment.id },
    data: {
      rawSummary: {
        refund,
        strategy: "paypal_refund_billing_document"
      },
      status: isFullRefund ? PaymentStatus.REFUNDED : billingPayment.status
    }
  });

  return refund;
}

export const paypalPaymentGateway: PaymentGateway = {
  provider: PaymentProvider.PAYPAL,
  createCheckoutSession: createPayPalGatewayCheckoutSession,
  createOnboardingSession: async (siteId: string) => ({
    provider: PaymentProvider.PAYPAL,
    status: "pending",
    url: await createPayPalPartnerReferralUrl(siteId)
  }),
  handleWebhookEvent: async (event: unknown) => handlePayPalWebhookEvent(event as PayPalWebhookEvent),
  refund: async (input) => refundPayPalGatewayPayment(input),
  supportedWallets: async () => [],
  verifyWebhook: ({ headers, rawBody }) => constructPayPalWebhookEvent(rawBody, headers || new Headers())
};
