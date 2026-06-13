import "server-only";

import {
  BillingDocumentStatus,
  OrderStatus,
  PaymentGatewayConnectionStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  StripeWebhookEventStatus
} from "@prisma/client";
import Stripe from "stripe";
import { getBillingPaymentSummary, markBillingPaymentFailed, settleBillingPayment } from "@/lib/billing/payments";
import { ensureBillingPublicToken } from "@/lib/billing/documents";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { resolveStripeCheckoutPaymentMethods } from "@/lib/payments/methods";
import { createStripeConnectAuthorizeUrl } from "@/lib/payments/stripe-connect";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import type { PaymentGateway, PaymentGatewayCheckoutInput, PaymentWallet } from "@/lib/payments/types";
import { updateOrderStatus } from "./orders";

let stripeClient: Stripe | null = null;
const STRIPE_EVENT_STALE_PROCESSING_MS = 5 * 60 * 1000;

function requireStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required to create Stripe Checkout sessions.");
  return secretKey;
}

function requireStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is required to verify Stripe webhooks.");
  return webhookSecret;
}

function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeSecretKey());
  }

  return stripeClient;
}

function configuredStripeWallets(): PaymentWallet[] {
  return ["APPLE_PAY", "GOOGLE_PAY", "CASH_APP_PAY"];
}

function parseConnectedWallets(value: Prisma.JsonValue): PaymentWallet[] {
  if (!Array.isArray(value)) return configuredStripeWallets();
  const supported = new Set(configuredStripeWallets());
  const wallets = value.filter((item): item is PaymentWallet => typeof item === "string" && supported.has(item as PaymentWallet));
  return wallets.length ? wallets : configuredStripeWallets();
}

async function getStripeConnectedAccountId(siteId?: string) {
  if (!siteId) return "";
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.STRIPE);
  if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED) return "";
  return credential.externalAccountId.trim();
}

async function stripeRequestOptions(siteId?: string): Promise<Stripe.RequestOptions | undefined> {
  const stripeAccount = await getStripeConnectedAccountId(siteId);
  return stripeAccount ? { stripeAccount } : undefined;
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function stripeMetadata(order: {
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

function stripeBillingMetadata(input: {
  billingDocumentId: string;
  billingPaymentId: string;
  documentNumber: string;
  siteId: string;
}) {
  return {
    targetType: "billing_document",
    billingDocumentId: input.billingDocumentId,
    billingPaymentId: input.billingPaymentId,
    documentNumber: input.documentNumber,
    siteId: input.siteId
  };
}

function assertStripeCurrency(currency: string) {
  const safeCurrency = currency.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(safeCurrency)) throw new Error("Order currency is not supported by Stripe.");
  return safeCurrency;
}

function stripeLineItems(order: {
  currency: string;
  discountCents: number;
  items: { lineTotalCents: number; name: string; quantity: number; unitPriceCents: number }[];
  orderNumber: string;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}) {
  if (order.discountCents > 0) {
    return [
      {
        price_data: {
          currency: assertStripeCurrency(order.currency),
          product_data: {
            name: `Order ${order.orderNumber}`.slice(0, 250)
          },
          unit_amount: order.totalCents
        },
        quantity: 1
      }
    ] satisfies Stripe.Checkout.SessionCreateParams.LineItem[];
  }

  const lineItems = order.items.map((item) => {
    if (item.quantity <= 0 || item.unitPriceCents <= 0 || item.lineTotalCents <= 0) {
      throw new Error("Stripe Checkout requires positive line item amounts.");
    }

    return {
      price_data: {
        currency: assertStripeCurrency(order.currency),
        product_data: {
          name: item.name.slice(0, 250)
        },
        unit_amount: item.unitPriceCents
      },
      quantity: item.quantity
    } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
  });

  for (const adjustment of [
    { amountCents: order.shippingCents, name: "Shipping" },
    { amountCents: order.taxCents, name: "Tax" }
  ]) {
    if (adjustment.amountCents <= 0) continue;
    lineItems.push({
      price_data: {
        currency: assertStripeCurrency(order.currency),
        product_data: {
          name: adjustment.name
        },
        unit_amount: adjustment.amountCents
      },
      quantity: 1
    });
  }

  return lineItems;
}

function stripeBillingLineItems(input: { amountCents: number; currency: string; documentNumber: string }) {
  if (input.amountCents <= 0) {
    throw new Error("Stripe Checkout requires a positive payment amount.");
  }

  return [
    {
      price_data: {
        currency: assertStripeCurrency(input.currency),
        product_data: {
          name: `Payment for ${input.documentNumber}`.slice(0, 250)
        },
        unit_amount: input.amountCents
      },
      quantity: 1
    }
  ] satisfies Stripe.Checkout.SessionCreateParams.LineItem[];
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

export async function createStripeCheckoutSessionForOrder(orderId: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      siteId: currentSiteId
    },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: {
        where: { provider: PaymentProvider.STRIPE },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  if (!order) throw new Error("Order not found.");
  if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.DRAFT) {
    throw new Error("Stripe Checkout sessions can only be created before payment.");
  }
  if (!order.items.length) throw new Error("Add at least one item before creating Stripe Checkout.");
  if (order.totalCents <= 0) throw new Error("Stripe Checkout requires a positive order total.");

  const payment =
    order.payments[0] ||
    (await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PENDING,
        amountCents: order.totalCents,
        currency: order.currency
      }
    }));
  const orderForMetadata = {
    ...order,
    payments: [payment]
  };
  const metadata = stripeMetadata(orderForMetadata);
  const requestOptions = await stripeRequestOptions(order.siteId);
  const methodSelection = await resolveStripeCheckoutPaymentMethods(order.siteId);
  const session = await getStripe().checkout.sessions.create({
    client_reference_id: order.id,
    customer_email: order.customerEmail,
    line_items: stripeLineItems(order),
    metadata,
    mode: "payment",
    payment_method_types: methodSelection.paymentMethodTypes,
    payment_intent_data: {
      metadata
    },
    success_url: publicOrderUrl(order.orderNumber, "success"),
    cancel_url: publicOrderUrl(order.orderNumber, "cancel")
  }, requestOptions);

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");

  const rawSummary = {
    strategy: "stripe_checkout",
    checkoutSession: {
      amountTotal: session.amount_total,
      connectedAccount: requestOptions?.stripeAccount || "",
      currency: session.currency,
      id: session.id,
      livemode: session.livemode,
      paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      paymentStatus: session.payment_status,
      status: session.status
    },
    enabledPaymentMethods: methodSelection.enabledKeys,
    enabledWallets: methodSelection.cardWallets,
    pciScope: "Hosted/tokenized collection only. No raw card data is stored."
  } satisfies Prisma.InputJsonObject;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        checkoutUrl: session.url,
        notes: order.notes.includes("Stripe Checkout")
          ? order.notes
          : `${order.notes ? `${order.notes}\n` : ""}Stripe Checkout session created.`
      }
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountCents: order.totalCents,
        currency: order.currency,
        externalCheckoutSession: session.id,
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

export async function createStripeCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  siteId?: string;
}) {
  const currentSiteId = input.siteId || (await getCurrentSiteId());

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
    if (document.status === BillingDocumentStatus.DRAFT) {
      throw new Error("Send the billing document before payment.");
    }
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
        billingDocumentId: document.id,
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PENDING,
        amountCents: input.amountCents,
        currency: document.currency
      }
    });

    return {
      document: {
        id: document.id,
        customerEmail: document.customerEmail,
        currency: document.currency,
        documentNumber: document.documentNumber,
        publicAccessToken,
        siteId: document.siteId
      },
      payment
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const metadata = stripeBillingMetadata({
    billingDocumentId: result.document.id,
    billingPaymentId: result.payment.id,
    documentNumber: result.document.documentNumber,
    siteId: result.document.siteId
  });
  const requestOptions = await stripeRequestOptions(result.document.siteId);
  const methodSelection = await resolveStripeCheckoutPaymentMethods(result.document.siteId);
  const session = await getStripe().checkout.sessions.create({
    client_reference_id: result.document.id,
    customer_email: result.document.customerEmail,
    line_items: stripeBillingLineItems({
      amountCents: result.payment.amountCents,
      currency: result.payment.currency,
      documentNumber: result.document.documentNumber
    }),
    metadata,
    mode: "payment",
    payment_method_types: methodSelection.paymentMethodTypes,
    payment_intent_data: {
      metadata
    },
    success_url: publicBillingUrl(result.document.publicAccessToken, "success"),
    cancel_url: publicBillingUrl(result.document.publicAccessToken, "cancel")
  }, requestOptions);

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");

  const rawSummary = {
    strategy: "stripe_checkout_billing_document",
    checkoutSession: {
      amountTotal: session.amount_total,
      connectedAccount: requestOptions?.stripeAccount || "",
      currency: session.currency,
      id: session.id,
      livemode: session.livemode,
      paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      paymentStatus: session.payment_status,
      status: session.status
    },
    enabledPaymentMethods: methodSelection.enabledKeys,
    enabledWallets: methodSelection.cardWallets,
    pciScope: "Hosted/tokenized collection only. No raw card data is stored."
  } satisfies Prisma.InputJsonObject;

  await prisma.$transaction([
    prisma.billingDocument.update({
      where: { id: result.document.id },
      data: {
        checkoutProvider: PaymentProvider.STRIPE,
        checkoutUrl: session.url,
        paymentExternalReference: session.id
      }
    }),
    prisma.billingPayment.update({
      where: { id: result.payment.id },
      data: {
        externalCheckoutSession: session.id,
        rawSummary,
        status: PaymentStatus.PENDING
      }
    })
  ]);

  return {
    checkoutUrl: session.url,
    paymentId: result.payment.id
  };
}

export function constructStripeWebhookEvent(rawBody: string, signature: string | null) {
  if (!signature) throw new Error("Missing Stripe-Signature header.");
  return getStripe().webhooks.constructEvent(rawBody, signature, requireStripeWebhookSecret());
}

function stripeEventSummary(event: Stripe.Event): Prisma.InputJsonObject {
  const base = {
    apiVersion: event.api_version || "",
    created: event.created,
    id: event.id,
    livemode: event.livemode,
    connectedAccount: event.account || "",
    type: event.type
  };
  const object = event.data.object;

  if (object.object === "checkout.session") {
    return {
      ...base,
      checkoutSession: {
        amountTotal: object.amount_total,
        currency: object.currency,
        id: object.id,
        paymentIntent: typeof object.payment_intent === "string" ? object.payment_intent : "",
        paymentStatus: object.payment_status,
        status: object.status
      }
    };
  }

  if (object.object === "charge") {
    return {
      ...base,
      charge: {
        amount: object.amount,
        amountRefunded: object.amount_refunded,
        id: object.id,
        paid: object.paid,
        paymentIntent: typeof object.payment_intent === "string" ? object.payment_intent : "",
        refunded: object.refunded,
        status: object.status
      }
    };
  }

  if (object.object === "refund") {
    return {
      ...base,
      refund: {
        amount: object.amount,
        charge: typeof object.charge === "string" ? object.charge : object.charge?.id || "",
        id: object.id,
        paymentIntent: typeof object.payment_intent === "string" ? object.payment_intent : "",
        status: object.status
      }
    };
  }

  return base;
}

async function claimStripeEvent(event: Stripe.Event) {
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
        livemode: event.livemode,
        status: StripeWebhookEventStatus.PROCESSING,
        summary: stripeEventSummary(event)
      }
    });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const reclaimed = await prisma.stripeWebhookEvent.updateMany({
      where: {
        eventId: event.id,
        OR: [
          { status: StripeWebhookEventStatus.FAILED },
          {
            status: StripeWebhookEventStatus.PROCESSING,
            updatedAt: {
              lte: new Date(Date.now() - STRIPE_EVENT_STALE_PROCESSING_MS)
            }
          }
        ]
      },
      data: {
        error: "",
        processedAt: null,
        status: StripeWebhookEventStatus.PROCESSING,
        summary: stripeEventSummary(event)
      }
    });

    return reclaimed.count === 1;
  }
}

async function markStripeEventProcessed(eventId: string) {
  await prisma.stripeWebhookEvent.update({
    where: { eventId },
    data: {
      error: "",
      processedAt: new Date(),
      status: StripeWebhookEventStatus.PROCESSED
    }
  });
}

async function markStripeEventFailed(eventId: string, error: unknown) {
  await prisma.stripeWebhookEvent.update({
    where: { eventId },
    data: {
      error: error instanceof Error ? error.message.slice(0, 1000) : "Stripe webhook handling failed.",
      processedAt: null,
      status: StripeWebhookEventStatus.FAILED
    }
  });
}

function metadataValue(value: string | null | undefined) {
  return String(value || "").trim();
}

async function findStripePayment(input: { checkoutSessionId?: string; orderId?: string; paymentId?: string; paymentIntentId?: string }) {
  const candidates: Prisma.PaymentWhereInput[] = [];
  if (input.paymentId) candidates.push({ id: input.paymentId });
  if (input.checkoutSessionId) candidates.push({ externalCheckoutSession: input.checkoutSessionId });
  if (input.paymentIntentId) candidates.push({ externalPaymentId: input.paymentIntentId });
  if (input.orderId) candidates.push({ orderId: input.orderId });

  for (const candidate of candidates) {
    const payment = await prisma.payment.findFirst({
      where: {
        provider: PaymentProvider.STRIPE,
        ...candidate
      },
      include: { order: true },
      orderBy: { createdAt: "asc" }
    });
    if (payment) return payment;
  }

  return null;
}

async function findStripeBillingPayment(input: {
  billingDocumentId?: string;
  billingPaymentId?: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
}) {
  const candidates: Prisma.BillingPaymentWhereInput[] = [];
  if (input.billingPaymentId) candidates.push({ id: input.billingPaymentId });
  if (input.checkoutSessionId) candidates.push({ externalCheckoutSession: input.checkoutSessionId });
  if (input.paymentIntentId) candidates.push({ externalPaymentId: input.paymentIntentId });
  if (input.billingDocumentId) candidates.push({ billingDocumentId: input.billingDocumentId });

  for (const candidate of candidates) {
    const payment = await prisma.billingPayment.findFirst({
      where: {
        provider: PaymentProvider.STRIPE,
        ...candidate
      },
      include: { billingDocument: true },
      orderBy: { createdAt: "asc" }
    });
    if (payment) return payment;
  }

  return null;
}

async function handleCheckoutSessionCompleted(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  if (metadataValue(session.metadata?.targetType) === "billing_document") {
    await handleBillingCheckoutSessionCompleted(event, session);
    return;
  }

  const payment = await findStripePayment({
    checkoutSessionId: session.id,
    orderId: metadataValue(session.metadata?.orderId),
    paymentId: metadataValue(session.metadata?.paymentId),
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });
  if (!payment) throw new Error("Stripe payment record not found for Checkout Session.");
  if (session.amount_total !== payment.order.totalCents) {
    throw new Error(
      `Stripe Checkout amount mismatch for order ${payment.order.orderNumber}: expected ${payment.order.totalCents}, received ${session.amount_total ?? "null"}.`
    );
  }
  if ((session.currency || "").toUpperCase() !== payment.order.currency.toUpperCase()) {
    throw new Error(
      `Stripe Checkout currency mismatch for order ${payment.order.orderNumber}: expected ${payment.order.currency}, received ${session.currency || "null"}.`
    );
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      externalCheckoutSession: session.id,
      externalPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId,
      rawSummary: stripeEventSummary(event),
      status: PaymentStatus.PAID
    }
  });

  await updateOrderStatus({
    orderId: payment.orderId,
    providerConfirmed: true,
    siteId: payment.order.siteId,
    status: OrderStatus.PAID
  });
}

async function handleBillingCheckoutSessionCompleted(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const payment = await findStripeBillingPayment({
    billingDocumentId: metadataValue(session.metadata?.billingDocumentId),
    billingPaymentId: metadataValue(session.metadata?.billingPaymentId),
    checkoutSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });
  if (!payment) throw new Error("Stripe billing payment record not found for Checkout Session.");
  if (session.amount_total !== payment.amountCents) {
    throw new Error(
      `Stripe Checkout amount mismatch for billing document ${payment.billingDocument.documentNumber}: expected ${payment.amountCents}, received ${session.amount_total ?? "null"}.`
    );
  }
  if ((session.currency || "").toUpperCase() !== payment.currency.toUpperCase()) {
    throw new Error(
      `Stripe Checkout currency mismatch for billing document ${payment.billingDocument.documentNumber}: expected ${payment.currency}, received ${session.currency || "null"}.`
    );
  }

  await settleBillingPayment({
    billingPaymentId: payment.id,
    externalCheckoutSession: session.id,
    externalPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId || undefined,
    rawSummary: stripeEventSummary(event),
    siteId: payment.billingDocument.siteId
  });
}

async function handleCheckoutSessionFailure(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (metadataValue(session.metadata?.targetType) === "billing_document") {
    const billingPayment = await findStripeBillingPayment({
      billingDocumentId: metadataValue(session.metadata?.billingDocumentId),
      billingPaymentId: metadataValue(session.metadata?.billingPaymentId),
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
    });
    if (!billingPayment) throw new Error("Stripe billing payment record not found for failed or expired Checkout Session.");

    await markBillingPaymentFailed({
      billingPaymentId: billingPayment.id,
      externalCheckoutSession: session.id,
      externalPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : billingPayment.externalPaymentId || undefined,
      rawSummary: stripeEventSummary(event),
      siteId: billingPayment.billingDocument.siteId
    });
    return;
  }

  const payment = await findStripePayment({
    checkoutSessionId: session.id,
    orderId: metadataValue(session.metadata?.orderId),
    paymentId: metadataValue(session.metadata?.paymentId),
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });
  if (!payment) throw new Error("Stripe payment record not found for failed or expired Checkout Session.");

  const paymentUpdate =
    payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED
      ? {
          externalCheckoutSession: session.id,
          externalPaymentId:
            typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId,
          rawSummary: stripeEventSummary(event)
        }
      : {
          externalCheckoutSession: session.id,
          externalPaymentId:
            typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId,
          rawSummary: stripeEventSummary(event),
          status: PaymentStatus.FAILED
        };

  await prisma.payment.update({
    where: { id: payment.id },
    data: paymentUpdate
  });

  if (payment.order.status === OrderStatus.DRAFT || payment.order.status === OrderStatus.PENDING) {
    await updateOrderStatus({
      orderId: payment.orderId,
      siteId: payment.order.siteId,
      status: OrderStatus.CANCELED
    });
  }
}

async function handlePaymentIntentFailure(event: Stripe.Event, intent: Stripe.PaymentIntent) {
  if (metadataValue(intent.metadata.targetType) === "billing_document") {
    const billingPayment = await findStripeBillingPayment({
      billingDocumentId: metadataValue(intent.metadata.billingDocumentId),
      billingPaymentId: metadataValue(intent.metadata.billingPaymentId),
      paymentIntentId: intent.id
    });
    if (!billingPayment) throw new Error("Stripe billing payment record not found for failed PaymentIntent.");

    await markBillingPaymentFailed({
      billingPaymentId: billingPayment.id,
      externalPaymentId: intent.id,
      rawSummary: stripeEventSummary(event),
      siteId: billingPayment.billingDocument.siteId
    });
    return;
  }

  const payment = await findStripePayment({
    orderId: metadataValue(intent.metadata.orderId),
    paymentId: metadataValue(intent.metadata.paymentId),
    paymentIntentId: intent.id
  });
  if (!payment) throw new Error("Stripe payment record not found for failed PaymentIntent.");

  const paymentUpdate =
    payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED
      ? {
          externalPaymentId: intent.id,
          rawSummary: stripeEventSummary(event)
        }
      : {
          externalPaymentId: intent.id,
          rawSummary: stripeEventSummary(event),
          status: PaymentStatus.FAILED
        };

  await prisma.payment.update({
    where: { id: payment.id },
    data: paymentUpdate
  });

  if (payment.order.status === OrderStatus.DRAFT || payment.order.status === OrderStatus.PENDING) {
    await updateOrderStatus({
      orderId: payment.orderId,
      siteId: payment.order.siteId,
      status: OrderStatus.CANCELED
    });
  }
}

async function handleRefundEvent(event: Stripe.Event) {
  const object = event.data.object;
  const paymentIntentId =
    object.object === "charge"
      ? typeof object.payment_intent === "string"
        ? object.payment_intent
        : ""
      : object.object === "refund" && typeof object.payment_intent === "string"
        ? object.payment_intent
        : "";
  if (!paymentIntentId) return;

  const payment = await findStripePayment({ paymentIntentId });
  if (!payment) {
    const billingPayment = await findStripeBillingPayment({ paymentIntentId });
    if (!billingPayment) throw new Error("Stripe payment record not found for refund event.");

    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: {
        rawSummary: stripeEventSummary(event),
        status:
          object.object === "charge" && (object.refunded || object.amount_refunded >= billingPayment.amountCents)
            ? PaymentStatus.REFUNDED
            : billingPayment.status
      }
    });
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      rawSummary: stripeEventSummary(event),
      status:
        object.object === "charge" && (object.refunded || object.amount_refunded >= payment.amountCents)
          ? PaymentStatus.REFUNDED
          : payment.status
    }
  });

  if (object.object === "charge" && (object.refunded || object.amount_refunded >= payment.amountCents)) {
    await updateOrderStatus({
      orderId: payment.orderId,
      providerConfirmed: true,
      siteId: payment.order.siteId,
      status: OrderStatus.REFUNDED
    });
  }
}

async function dispatchStripeEvent(event: Stripe.Event) {
  const object = event.data.object;

  if (event.type === "checkout.session.completed" && object.object === "checkout.session") {
    await handleCheckoutSessionCompleted(event, object);
    return;
  }

  if (event.type === "checkout.session.async_payment_succeeded" && object.object === "checkout.session") {
    await handleCheckoutSessionCompleted(event, object);
    return;
  }

  if (
    (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") &&
    object.object === "checkout.session"
  ) {
    await handleCheckoutSessionFailure(event, object);
    return;
  }

  if (event.type === "payment_intent.payment_failed" && object.object === "payment_intent") {
    await handlePaymentIntentFailure(event, object);
    return;
  }

  if (event.type === "charge.refunded" && object.object === "charge") {
    await handleRefundEvent(event);
    return;
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  const claimed = await claimStripeEvent(event);
  if (!claimed) return { duplicate: true };

  try {
    await dispatchStripeEvent(event);
    await markStripeEventProcessed(event.id);
    return { duplicate: false };
  } catch (error) {
    await markStripeEventFailed(event.id, error);
    throw error;
  }
}

async function createStripeGatewayCheckoutSession(input: PaymentGatewayCheckoutInput) {
  if (input.kind === "order") {
    const order = await createStripeCheckoutSessionForOrder(input.orderId, input.siteId);
    return {
      checkoutUrl: String(order.checkoutUrl || ""),
      order,
      provider: PaymentProvider.STRIPE
    };
  }

  const result = await createStripeCheckoutSessionForBillingDocument({
    amountCents: input.amountCents,
    billingDocumentId: input.billingDocumentId,
    siteId: input.siteId
  });

  return {
    checkoutUrl: result.checkoutUrl,
    paymentId: result.paymentId,
    provider: PaymentProvider.STRIPE
  };
}

async function refundStripeGatewayPayment(input: { amountCents?: number; paymentId: string; siteId: string }) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      provider: PaymentProvider.STRIPE,
      order: { siteId: input.siteId }
    },
    include: { order: true }
  });

  if (payment) {
    if (!payment.externalPaymentId) throw new Error("Stripe payment intent is missing for this order payment.");
    const refund = await getStripe().refunds.create(
      {
        amount: input.amountCents,
        payment_intent: payment.externalPaymentId
      },
      await stripeRequestOptions(payment.order.siteId)
    );
    const isFullRefund = !input.amountCents || input.amountCents >= payment.amountCents;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        rawSummary: {
          refund: {
            amount: refund.amount,
            id: refund.id,
            paymentIntent:
              typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || "",
            status: refund.status || ""
          },
          strategy: "stripe_refund"
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
      id: input.paymentId,
      provider: PaymentProvider.STRIPE,
      billingDocument: { siteId: input.siteId }
    },
    include: { billingDocument: true }
  });

  if (!billingPayment) throw new Error("Stripe payment record not found for refund.");
  if (!billingPayment.externalPaymentId) throw new Error("Stripe payment intent is missing for this billing payment.");

  const refund = await getStripe().refunds.create(
    {
      amount: input.amountCents,
      payment_intent: billingPayment.externalPaymentId
    },
    await stripeRequestOptions(billingPayment.billingDocument.siteId)
  );
  const isFullRefund = !input.amountCents || input.amountCents >= billingPayment.amountCents;

  await prisma.billingPayment.update({
    where: { id: billingPayment.id },
    data: {
      rawSummary: {
        refund: {
          amount: refund.amount,
          id: refund.id,
          paymentIntent: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || "",
          status: refund.status || ""
        },
        strategy: "stripe_refund_billing_document"
      },
      status: isFullRefund ? PaymentStatus.REFUNDED : billingPayment.status
    }
  });

  return refund;
}

export const stripePaymentGateway: PaymentGateway = {
  provider: PaymentProvider.STRIPE,
  createCheckoutSession: createStripeGatewayCheckoutSession,
  createOnboardingSession: async (siteId: string) => ({
    provider: PaymentProvider.STRIPE,
    status: "pending",
    url: createStripeConnectAuthorizeUrl(siteId)
  }),
  handleWebhookEvent: async (event: unknown) => handleStripeWebhookEvent(event as Stripe.Event),
  refund: async (input) => {
    return refundStripeGatewayPayment(input);
  },
  supportedWallets: async (siteId?: string) => {
    if (!siteId) return configuredStripeWallets();
    const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.STRIPE);
    if (credential?.status !== PaymentGatewayConnectionStatus.CONNECTED) return configuredStripeWallets();
    return parseConnectedWallets(credential.supportedWallets);
  },
  verifyWebhook: ({ rawBody, signature }) => constructStripeWebhookEvent(rawBody, signature)
};
