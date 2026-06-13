import "server-only";

import { randomBytes } from "crypto";
import type { BillingDocumentStatus, BillingDocumentType, PaymentProvider, Prisma } from "@prisma/client";

type BillingTx = Prisma.TransactionClient;

export function generateBillingPublicToken() {
  return `bdoc_${randomBytes(24).toString("base64url")}`;
}

export function publicBillingPath(token: string) {
  return `/billing/${encodeURIComponent(token)}`;
}

export function publicBillingUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}${publicBillingPath(token)}`;
}

function moneySnapshot(cents: number, currency: string) {
  return {
    cents,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)
  };
}

export async function ensureBillingPublicToken(tx: BillingTx, documentId: string) {
  const document = await tx.billingDocument.findUnique({
    where: { id: documentId },
    select: { publicAccessToken: true, siteId: true }
  });

  if (!document) throw new Error("Billing document not found.");
  if (document.publicAccessToken) return document.publicAccessToken;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const publicAccessToken = generateBillingPublicToken();
    const existing = await tx.billingDocument.findFirst({
      where: { siteId: document.siteId, publicAccessToken },
      select: { id: true }
    });

    if (!existing) {
      await tx.billingDocument.update({
        where: { id: documentId },
        data: { publicAccessToken }
      });
      return publicAccessToken;
    }
  }

  throw new Error("Could not generate a public billing token.");
}

export async function snapshotBillingDocument(tx: BillingTx, documentId: string) {
  const document = await tx.billingDocument.findUnique({
    where: { id: documentId },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!document) throw new Error("Billing document not found.");

  const publicAccessToken = await ensureBillingPublicToken(tx, document.id);
  const paidCents = document.payments
    .filter((payment) => payment.status === "PAID" || payment.status === "AUTHORIZED")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, document.totalCents - paidCents);
  const snapshot = {
    documentNumber: document.documentNumber,
    type: document.type,
    status: document.status,
    customerName: document.customerName,
    customerEmail: document.customerEmail,
    currency: document.currency,
    subtotal: moneySnapshot(document.subtotalCents, document.currency),
    discount: moneySnapshot(document.discountCents, document.currency),
    tax: moneySnapshot(document.taxCents, document.currency),
    total: moneySnapshot(document.totalCents, document.currency),
    paid: moneySnapshot(paidCents, document.currency),
    remaining: moneySnapshot(remainingCents, document.currency),
    dueAt: document.dueAt?.toISOString() || null,
    acceptedAt: document.acceptedAt?.toISOString() || null,
    paidAt: document.paidAt?.toISOString() || null,
    publicMemo: document.publicMemo,
    checkoutProvider: document.checkoutProvider,
    checkoutUrl: document.checkoutUrl,
    paymentExternalReference: document.paymentExternalReference,
    publicAccessToken,
    lineItems: document.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: moneySnapshot(item.unitPriceCents, document.currency),
      total: moneySnapshot(item.lineTotalCents, document.currency),
      sortOrder: item.sortOrder
    })),
    attachments: document.attachments.map((attachment) => ({
      title: attachment.title,
      url: attachment.url,
      notes: attachment.notes,
      createdAt: attachment.createdAt.toISOString()
    })),
    payments: document.payments.map((payment) => ({
      provider: payment.provider,
      status: payment.status,
      amount: moneySnapshot(payment.amountCents, payment.currency),
      externalCheckoutSession: payment.externalCheckoutSession,
      externalPaymentId: payment.externalPaymentId,
      hostedReceiptUrl: payment.hostedReceiptUrl,
      createdAt: payment.createdAt.toISOString()
    }))
  };

  await tx.billingDocument.update({
    where: { id: document.id },
    data: {
      publicAccessToken,
      snapshot,
      snapshotAt: new Date()
    }
  });

  return snapshot;
}

export type BillingDocumentEmailInput = {
  id: string;
  documentNumber: string;
  type: BillingDocumentType;
  status: BillingDocumentStatus;
  customerName: string;
  customerEmail: string;
  currency: string;
  totalCents: number;
  dueAt?: Date | null;
  publicMemo: string;
  checkoutProvider?: PaymentProvider | null;
  checkoutUrl: string;
};
