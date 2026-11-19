import "server-only";
import { persistGalleryHostedCheckout } from "@/lib/portfolio/checkout-persistence";
import { assertGalleryCheckoutCreation, requireCheckoutIdentity, safeHostedCheckoutUrl, type GalleryCheckoutIdentity, type GalleryCheckoutInspection } from "@/lib/portfolio/checkout-recovery-policy";
import { revokeGalleryPurchaseForRefund } from "@/lib/portfolio/refunds";

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
import { reserveBillingCheckout, markBillingPaymentFailed, persistBillingCheckout, settleBillingPayment } from "@/lib/billing/payments";
import { recordBillingRefund, type BillingRefundObservation } from "@/lib/billing/refund-ledger";
import type { GatewayBillingRefundInput } from "@/lib/payments/types";
import { ensureBillingPublicToken } from "@/lib/billing/documents";
import { publicAppBaseUrl } from "@/lib/env";
import { getConnectedGatewayCredential, getWebhookSigningCredentials, getStripeApiKeyForSite } from "@/lib/payments/credentials";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { resolveStripeCheckoutPaymentMethods } from "@/lib/payments/methods";
import { PaymentWebhookRejected } from "@/lib/payments/webhook-auth";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import type { PaymentGateway, PaymentGatewayCheckoutInput, PaymentWallet } from "@/lib/payments/types";
import { updateOrderStatus } from "./orders";

const STRIPE_EVENT_STALE_PROCESSING_MS = 5 * 60 * 1000;

// Build a Stripe client from the merchant's own pasted secret key for this site (direct-charge model:
// no Connect, no stripeAccount). Never charge a different account when this site is disconnected.
async function getStripeForSite(siteId: string) {
  const apiKey = await getStripeApiKeyForSite(siteId);
  if (!apiKey) {
    throw new Error("Connect Stripe in Settings → Payments before creating Stripe Checkout.");
  }

  return new Stripe(apiKey);
}

// Webhook signature verification needs the signing secret only, not a live API key, so a placeholder
// client is fine here — constructEvent is pure crypto over the raw body.
function stripeWebhookClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "sk_webhook_verify_placeholder");
}

// Optional methods that can be enabled in onboarding but require the connected account to be eligible
// (Stripe activates Cash App Pay, Affirm, and Klarna per account/region). Cards always stay available.
const optionalStripeMethodTypes = ["cashapp", "affirm", "klarna"];

function isStripePaymentMethodActivationError(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeError)) return false;
  if (error.type !== "StripeInvalidRequestError") return false;
  const param = (error.param || "").toLowerCase();
  const message = (error.message || "").toLowerCase();
  return param.includes("payment_method_types") || message.includes("payment method type") || message.includes("payment_method_types");
}

// Drop any optional method the connected account cannot use yet, keeping card so checkout still works.
// If the error names specific methods, drop only those; otherwise drop every optional method as a safe floor.
function methodsWithoutUnavailable(methodTypes: string[] | undefined, errorMessage: string): string[] {
  const requested = methodTypes && methodTypes.length ? methodTypes : ["card"];
  const message = errorMessage.toLowerCase();
  const named = requested.filter((type) => type === "card" || !message.includes(type));
  const retained = named.length !== requested.length ? named : requested.filter((type) => !optionalStripeMethodTypes.includes(type));
  return retained.length ? retained : ["card"];
}

// Create a hosted Checkout session, but never let an optional payment method the seller has not finished
// activating (Affirm, Cash App Pay, Klarna) block the sale. Retry once with the usable methods.
async function createResilientCheckoutSession(stripe: Stripe, params: Stripe.Checkout.SessionCreateParams, idempotencyKey?: string) {
  try {
    return await stripe.checkout.sessions.create(params, idempotencyKey ? { idempotencyKey } : undefined);
  } catch (error) {
    if (!isStripePaymentMethodActivationError(error)) throw error;

    const requested = params.payment_method_types || [];
    const fallback = methodsWithoutUnavailable(requested, error instanceof Error ? error.message : "");
    if (fallback.length === requested.length) throw error;

    console.warn("[payments:stripe-checkout-method-fallback]", {
      fallback,
      requested
    });

    return stripe.checkout.sessions.create({
      ...params,
      payment_method_types: fallback as Stripe.Checkout.SessionCreateParams.PaymentMethodType[]
    }, idempotencyKey ? { idempotencyKey } : undefined);
  }
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
  giftCardCreditCents: number;
  items: { lineTotalCents: number; name: string; quantity: number; unitPriceCents: number }[];
  orderNumber: string;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}) {
  if (order.discountCents > 0 || order.giftCardCreditCents > 0) {
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

export async function createStripeCheckoutSessionForOrder(orderId: string, siteId?: string) {
  const currentSiteId = siteId || (await getCurrentSiteId());
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      siteId: currentSiteId
    },
    include: {
      gallerySelectionPurchase: { select: { id: true } },
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

  // Ordinary commerce retains its original payment choice; a gallery renewal
  // has a new immutable payment attempt and must never reuse an older key.
  const payment =
    (order.gallerySelectionPurchase
      ? await prisma.payment.findFirst({ where: { orderId: order.id, provider: PaymentProvider.STRIPE }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
      : order.payments[0]) ||
    (await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PENDING,
        amountCents: order.totalCents,
        currency: order.currency
      }
    }));
  if (order.gallerySelectionPurchase) assertGalleryCheckoutCreation(payment);
  const orderForMetadata = {
    ...order,
    payments: [payment]
  };
  const metadata = stripeMetadata(orderForMetadata);
  const stripe = await getStripeForSite(order.siteId);
  const methodSelection = await resolveStripeCheckoutPaymentMethods(order.siteId);
  const session = await createResilientCheckoutSession(stripe, {
    client_reference_id: order.id,
    customer_email: order.customerEmail,
    line_items: stripeLineItems(order),
    metadata,
    mode: "payment",
    payment_method_types: methodSelection.paymentMethodTypes,
    payment_intent_data: {
      metadata
    },
    success_url: publicOrderUrl(order.orderNumber, "success", Boolean(order.gallerySelectionPurchase)),
    cancel_url: publicOrderUrl(order.orderNumber, "cancel", Boolean(order.gallerySelectionPurchase))
  }, order.gallerySelectionPurchase ? `gallery_${order.id}_${payment.id}` : undefined);

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");

  const rawSummary = {
    strategy: "stripe_checkout",
    checkoutSession: {
      amountTotal: session.amount_total,
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

  const orderCheckoutData = {
    checkoutUrl: session.url,
    notes: order.notes.includes("Stripe Checkout")
      ? order.notes
      : `${order.notes ? `${order.notes}\n` : ""}Stripe Checkout session created.`
  } satisfies Prisma.OrderUpdateManyMutationInput;
  const paymentCheckoutData = {
    amountCents: order.totalCents,
    currency: order.currency,
    externalCheckoutSession: session.id,
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

export async function createStripeCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  siteId?: string;
  recoveryOnly?: boolean;
}) {
  const currentSiteId = input.siteId || (await getCurrentSiteId());
  const apiKey = await getStripeApiKeyForSite(currentSiteId);
  const credential = await getConnectedGatewayCredential(currentSiteId, PaymentProvider.STRIPE);
  if (!apiKey || !credential?.externalAccountId) throw new Error("Connect Stripe before creating Stripe checkout.");

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

    const payment = await reserveBillingCheckout(tx, document, input.amountCents, PaymentProvider.STRIPE,
      `${apiKey.includes("_live_") ? "live" : "test"}:${credential.externalAccountId}`, input.recoveryOnly);
    const publicAccessToken = await ensureBillingPublicToken(tx, document.id);

    return {
      document: {
        bookingId: document.bookingId,
        status: document.status,
        totalCents: document.totalCents,
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
  const stripe = new Stripe(apiKey);
  const methodSelection = await resolveStripeCheckoutPaymentMethods(result.document.siteId);
  const session = await createResilientCheckoutSession(stripe, {
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
  }, `billing_${result.payment.id}`);

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");

  const rawSummary = {
    strategy: "stripe_checkout_billing_document",
    checkoutSession: {
      amountTotal: session.amount_total,
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

  await persistBillingCheckout(result.document, result.payment.id, {
    checkoutProvider: PaymentProvider.STRIPE,
    checkoutUrl: session.url,
    paymentExternalReference: session.id
  }, {
    externalCheckoutSession: session.id,
    rawSummary
  }, input.recoveryOnly);

  return {
    checkoutUrl: session.url,
    paymentId: result.payment.id
  };
}

export async function constructStripeWebhookEvent(rawBody: string, signature: string | null) {
  if (!signature) throw new PaymentWebhookRejected("Missing Stripe-Signature header.");

  const credentials = await getWebhookSigningCredentials("STRIPE");
  const fallback = process.env.STRIPE_WEBHOOK_SECRET;
  if (fallback && !credentials.some(({ siteId, secret }) => siteId === DEFAULT_SITE_ID && secret === fallback)) {
    const apiKey = process.env.STRIPE_SECRET_KEY || "";
    credentials.push({ siteId: DEFAULT_SITE_ID, secret: fallback, merchantId: "", environment: apiKey.includes("_test_") ? "test" : apiKey.includes("_live_") ? "live" : "" });
  }

  const client = stripeWebhookClient();
  const verified = credentials.flatMap(({ secret, ...binding }) => {
    try {
      return [{ ...binding, event: client.webhooks.constructEvent(rawBody, signature, secret) }];
    } catch {
      return [];
    }
  });
  const match = verified[0];
  if (verified.length !== 1 || !match ||
    (match.environment && match.event.livemode !== (match.environment === "live")) ||
    (match.event.account && match.event.account !== match.merchantId)) {
    throw new PaymentWebhookRejected("Stripe webhook merchant could not be verified.");
  }
  return { event: match.event, siteId: match.siteId, environment: match.event.livemode ? "live" : "test" };
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

async function claimStripeEvent(event: Stripe.Event, siteId: string) {
  const eventId = event.id;
  const historical = await prisma.stripeWebhookEvent.findFirst({
    where: { siteId: "", eventId, status: StripeWebhookEventStatus.PROCESSED },
    select: { id: true }
  });
  if (historical) return false;
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        siteId,
        eventId,
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
        siteId,
        eventId,
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

async function markStripeEventProcessed(siteId: string, eventId: string) {
  await prisma.stripeWebhookEvent.update({
    where: { siteId_eventId: { siteId, eventId } },
    data: {
      error: "",
      processedAt: new Date(),
      status: StripeWebhookEventStatus.PROCESSED
    }
  });
}

async function markStripeEventFailed(siteId: string, eventId: string) {
  await prisma.stripeWebhookEvent.update({
    where: { siteId_eventId: { siteId, eventId } },
    data: {
      error: "Stripe webhook handling failed.",
      processedAt: null,
      status: StripeWebhookEventStatus.FAILED
    }
  });
}

function metadataValue(value: string | null | undefined) {
  return String(value || "").trim();
}

async function findStripePayment(siteId: string, input: { checkoutSessionId?: string; orderId?: string; paymentId?: string; paymentIntentId?: string }) {
  const candidates: Prisma.PaymentWhereInput[] = [];
  if (input.paymentId) candidates.push({ id: input.paymentId });
  if (input.checkoutSessionId) candidates.push({ externalCheckoutSession: input.checkoutSessionId });
  if (input.paymentIntentId) candidates.push({ externalPaymentId: input.paymentIntentId });
  if (input.orderId) candidates.push({ orderId: input.orderId });

  for (const candidate of candidates) {
    const payment = await prisma.payment.findFirst({
      where: {
        provider: PaymentProvider.STRIPE,
        order: { siteId },
        ...candidate
      },
      include: { order: { include: { gallerySelectionPurchase: { select: { id: true } } } } },
      orderBy: { createdAt: "asc" }
    });
    if (payment) return payment;
  }

  return null;
}

async function findStripeBillingPayment(siteId: string, input: {
  billingDocumentId?: string;
  billingPaymentId?: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
}) {
  if (!input.checkoutSessionId && !input.paymentIntentId) return null;
  return prisma.billingPayment.findFirst({
    where: {
      provider: PaymentProvider.STRIPE,
      billingDocument: { siteId },
      id: input.billingPaymentId || undefined,
      billingDocumentId: input.billingDocumentId || undefined,
      externalCheckoutSession: input.checkoutSessionId || undefined,
      ...(input.paymentIntentId ? {
        OR: [
          { externalPaymentId: input.paymentIntentId },
          ...(input.checkoutSessionId ? [{ externalPaymentId: null }] : [])
        ]
      } : {})
    },
    include: { billingDocument: true }
  });
}

async function handleCheckoutSessionCompleted(event: Stripe.Event, siteId: string, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  if (metadataValue(session.metadata?.targetType) === "billing_document") {
    await handleBillingCheckoutSessionCompleted(event, siteId, session);
    return;
  }

  const payment = await findStripePayment(siteId, {
    checkoutSessionId: session.id,
    orderId: metadataValue(session.metadata?.orderId),
    paymentId: metadataValue(session.metadata?.paymentId),
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });
  if (!payment) throw new Error("Stripe payment record not found for Checkout Session.");
  if (payment.order.gallerySelectionPurchase) {
    requireCheckoutIdentity(session.id === payment.externalCheckoutSession && session.metadata?.paymentId === payment.id &&
      session.metadata?.orderId === payment.orderId && session.metadata?.siteId === payment.order.siteId);
  }
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
      providerVerifiedAt: new Date(),
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

async function handleBillingCheckoutSessionCompleted(event: Stripe.Event, siteId: string, session: Stripe.Checkout.Session) {
  const payment = await findStripeBillingPayment(siteId, {
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
    capturedAt: new Date(event.created * 1000),
    externalCheckoutSession: session.id,
    externalPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId || undefined,
    rawSummary: stripeEventSummary(event),
    siteId: payment.billingDocument.siteId
  });
}

export async function closeStripeBookingCheckout(siteId: string, checkoutSessionId: string) {
  const stripe = await getStripeForSite(siteId);
  const options = { timeout: 10_000, maxNetworkRetries: 0 };
  let session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {}, options);
  if (session.id !== checkoutSessionId || session.metadata?.siteId !== siteId || session.metadata?.targetType !== "billing_document") {
    throw new Error("Stripe checkout identity changed.");
  }
  if (session.status === "open") session = await stripe.checkout.sessions.expire(checkoutSessionId, {}, options);
  return session.status === "expired" && session.payment_status === "unpaid";
}

async function handleCheckoutSessionFailure(event: Stripe.Event, siteId: string, session: Stripe.Checkout.Session) {
  if (metadataValue(session.metadata?.targetType) === "billing_document") {
    const billingPayment = await findStripeBillingPayment(siteId, {
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

  const payment = await findStripePayment(siteId, {
    checkoutSessionId: session.id,
    orderId: metadataValue(session.metadata?.orderId),
    paymentId: metadataValue(session.metadata?.paymentId),
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });
  if (!payment) throw new Error("Stripe payment record not found for failed or expired Checkout Session.");
  if (payment.order.gallerySelectionPurchase) {
    requireCheckoutIdentity(session.id === payment.externalCheckoutSession && session.metadata?.paymentId === payment.id &&
      session.metadata?.orderId === payment.orderId && session.metadata?.siteId === payment.order.siteId);
  }

  const failureSummary = payment.order.gallerySelectionPurchase && payment.rawSummary && typeof payment.rawSummary === "object" && !Array.isArray(payment.rawSummary)
    ? { ...payment.rawSummary, ...stripeEventSummary(event) } : stripeEventSummary(event);
  const paymentUpdate =
    payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED
      ? {
          externalCheckoutSession: session.id,
          externalPaymentId:
            typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId,
          rawSummary: failureSummary
        }
      : {
          externalCheckoutSession: session.id,
          externalPaymentId:
            typeof session.payment_intent === "string" ? session.payment_intent : payment.externalPaymentId,
          rawSummary: failureSummary,
          status: PaymentStatus.FAILED
        };

  if (payment.order.gallerySelectionPurchase) {
    // A delayed failure must not regress a concurrently verified paid attempt.
    await prisma.payment.updateMany({ where: { id: payment.id, status: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } }, data: paymentUpdate });
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: paymentUpdate });
  }

  const galleryPurchase = payment.order.gallerySelectionPurchase;
  if (!galleryPurchase && (payment.order.status === OrderStatus.DRAFT || payment.order.status === OrderStatus.PENDING)) {
    await updateOrderStatus({
      orderId: payment.orderId,
      siteId: payment.order.siteId,
      status: OrderStatus.CANCELED
    });
  }
}

async function handlePaymentIntentFailure(event: Stripe.Event, siteId: string, intent: Stripe.PaymentIntent) {
  // Checkout remains payable after a failed card authorization.
  if (metadataValue(intent.metadata.targetType) === "billing_document") return;

  const payment = await findStripePayment(siteId, {
    orderId: metadataValue(intent.metadata.orderId),
    paymentId: metadataValue(intent.metadata.paymentId),
    paymentIntentId: intent.id
  });
  if (!payment) throw new Error("Stripe payment record not found for failed PaymentIntent.");
  if (payment.order.gallerySelectionPurchase) {
    requireCheckoutIdentity(intent.id === payment.externalPaymentId && intent.metadata.paymentId === payment.id &&
      intent.metadata.orderId === payment.orderId && intent.metadata.siteId === payment.order.siteId);
  }

  const failureSummary = payment.order.gallerySelectionPurchase && payment.rawSummary && typeof payment.rawSummary === "object" && !Array.isArray(payment.rawSummary)
    ? { ...payment.rawSummary, ...stripeEventSummary(event) } : stripeEventSummary(event);
  const paymentUpdate =
    payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED
      ? {
          externalPaymentId: intent.id,
          rawSummary: failureSummary
        }
      : {
          externalPaymentId: intent.id,
          rawSummary: failureSummary,
          status: PaymentStatus.FAILED
        };

  if (payment.order.gallerySelectionPurchase) {
    // A delayed failure must not regress a concurrently verified paid attempt.
    await prisma.payment.updateMany({ where: { id: payment.id, status: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } }, data: paymentUpdate });
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: paymentUpdate });
  }

  const galleryPurchase = payment.order.gallerySelectionPurchase;
  if (!galleryPurchase && (payment.order.status === OrderStatus.DRAFT || payment.order.status === OrderStatus.PENDING)) {
    await updateOrderStatus({
      orderId: payment.orderId,
      siteId: payment.order.siteId,
      status: OrderStatus.CANCELED
    });
  }
}

async function handleRefundEvent(event: Stripe.Event, siteId: string) {
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

  const payment = await findStripePayment(siteId, { paymentIntentId });
  if (!payment) {
    const billingPayment = await findStripeBillingPayment(siteId, { paymentIntentId });
    if (!billingPayment) throw new Error("Stripe payment record not found for refund event.");

    if (object.object === "refund") {
      await recordBillingRefund(siteId, billingPayment.id, paymentIntentId, stripeRefundObservation(object));
    } else if (object.object === "charge") {
      const stripe = await getStripeForSite(siteId);
      for await (const refund of stripe.refunds.list({ charge: object.id, limit: 100 }, { timeout: 10_000, maxNetworkRetries: 0 })) {
        if (refund.payment_intent !== paymentIntentId) throw new Error("Stripe refund capture does not match.");
        await recordBillingRefund(siteId, billingPayment.id, paymentIntentId, stripeRefundObservation(refund));
      }
    }
    return;
  }

  if (object.object === "refund" && object.status !== "succeeded") return;
  if ((object.object === "charge" && object.amount_refunded > 0) || (object.object === "refund" && object.status === "succeeded" && object.amount > 0)) {
    await revokeGalleryPurchaseForRefund({ orderId: payment.orderId, siteId: payment.order.siteId,
      amountCents: object.object === "charge" ? object.amount_refunded : object.amount,
      currency: object.currency, paymentCurrency: payment.currency });
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

async function dispatchStripeEvent(event: Stripe.Event, siteId: string) {
  const object = event.data.object;

  if (event.type === "checkout.session.completed" && object.object === "checkout.session") {
    await handleCheckoutSessionCompleted(event, siteId, object);
    return;
  }

  if (event.type === "checkout.session.async_payment_succeeded" && object.object === "checkout.session") {
    await handleCheckoutSessionCompleted(event, siteId, object);
    return;
  }

  if (
    (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") &&
    object.object === "checkout.session"
  ) {
    await handleCheckoutSessionFailure(event, siteId, object);
    return;
  }

  if (event.type === "payment_intent.payment_failed" && object.object === "payment_intent") {
    await handlePaymentIntentFailure(event, siteId, object);
    return;
  }

  if ((event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") && object.object === "refund") {
    await handleRefundEvent(event, siteId);
    return;
  }

  if (event.type === "charge.refunded" && object.object === "charge") {
    await handleRefundEvent(event, siteId);
    return;
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event, siteId: string) {
  const claimed = await claimStripeEvent(event, siteId);
  if (!claimed) return { duplicate: true };

  try {
    await dispatchStripeEvent(event, siteId);
    await markStripeEventProcessed(siteId, event.id);
    return { duplicate: false };
  } catch (error) {
    await markStripeEventFailed(siteId, event.id);
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
    recoveryOnly: input.recoveryOnly,
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
    const stripe = await getStripeForSite(payment.order.siteId);
    const refund = await stripe.refunds.create({
      amount: input.amountCents,
      payment_intent: payment.externalPaymentId
    });
    if (refund.status === "succeeded") await revokeGalleryPurchaseForRefund({ orderId: payment.orderId, siteId: payment.order.siteId,
      amountCents: refund.amount, currency: refund.currency, paymentCurrency: payment.currency });
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

  throw new Error("Stripe order payment not found for refund.");
}

function stripeRefundObservation(refund: Stripe.Refund): BillingRefundObservation {
  return {
    externalRefundId: refund.id, amountCents: refund.amount, currency: refund.currency,
    providerCreatedAt: new Date(refund.created * 1000), requestId: refund.metadata?.showrunnerRefundId,
    status: refund.status === "succeeded" ? "SUCCEEDED" : refund.status === "failed" || refund.status === "canceled" ? "FAILED" : "PENDING"
  };
}

async function refundStripeBilling(input: GatewayBillingRefundInput) {
  const stripe = await getStripeForSite(input.siteId);
  const options = { timeout: 10_000, maxNetworkRetries: 0 };
  const refund = input.externalRefundId
    ? await stripe.refunds.retrieve(input.externalRefundId, {}, options)
    : await stripe.refunds.create({
      amount: input.amountCents, payment_intent: input.captureId, metadata: { showrunnerRefundId: input.requestId }
    }, { ...options, idempotencyKey: input.requestId });
  if (refund.payment_intent !== input.captureId) throw new Error("Stripe refund capture does not match.");
  return stripeRefundObservation(refund);
}

export const stripePaymentGateway: PaymentGateway = {
  provider: PaymentProvider.STRIPE,
  createCheckoutSession: createStripeGatewayCheckoutSession,
  handleWebhookEvent: ({ event, siteId }) => handleStripeWebhookEvent(event as Stripe.Event, siteId),
  refundBilling: refundStripeBilling,
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

/** Read-only recovery: only a retrieved, unpaid, terminal session permits renewal. */
export async function inspectStripeGalleryCheckout(input: GalleryCheckoutIdentity): Promise<GalleryCheckoutInspection> {
  const stripe = await getStripeForSite(input.siteId);
  const session = await stripe.checkout.sessions.retrieve(input.checkoutSessionId, { expand: ["payment_intent"] });
  requireCheckoutIdentity(session.id === input.checkoutSessionId && session.mode === "payment" &&
    session.client_reference_id === input.orderId && session.metadata?.orderId === input.orderId &&
    session.metadata?.paymentId === input.paymentId && session.metadata?.siteId === input.siteId &&
    session.amount_total === input.amountCents && session.currency?.toUpperCase() === input.currency.toUpperCase());
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (session.payment_intent && !intent) return { state: "WAITING" };
  if (intent) {
    requireCheckoutIdentity(intent.amount === input.amountCents && intent.currency.toUpperCase() === input.currency.toUpperCase() &&
      intent.metadata.orderId === input.orderId && intent.metadata.paymentId === input.paymentId && intent.metadata.siteId === input.siteId &&
      (!input.externalPaymentId || input.externalPaymentId === intent.id));
  }
  if (session.payment_status !== "unpaid" || session.status === "complete" ||
      (intent && ["processing", "succeeded", "requires_capture"].includes(intent.status))) return { state: "WAITING" };
  if (session.status === "expired" && (!intent || intent.status === "canceled")) return { state: "TERMINAL", providerState: "expired" };
  if (session.status === "open") return { state: "OPEN", checkoutUrl: safeHostedCheckoutUrl(session.url) };
  return { state: "WAITING" };
}
