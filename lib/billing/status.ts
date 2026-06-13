import "server-only";

import { randomBytes } from "crypto";
import { BillingDocumentStatus, BillingDocumentType, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { generateBillingPublicToken, snapshotBillingDocument } from "@/lib/billing/documents";
import { maxIntCents } from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

export function assertAllowedBillingStatusTransition(current: BillingDocumentStatus, next: BillingDocumentStatus) {
  if (current === next) return;

  const allowed: Record<BillingDocumentStatus, BillingDocumentStatus[]> = {
    [BillingDocumentStatus.DRAFT]: [BillingDocumentStatus.SENT, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.SENT]: [
      BillingDocumentStatus.ACCEPTED,
      BillingDocumentStatus.PAID,
      BillingDocumentStatus.VOID,
      BillingDocumentStatus.OVERDUE
    ],
    [BillingDocumentStatus.ACCEPTED]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID, BillingDocumentStatus.OVERDUE],
    [BillingDocumentStatus.OVERDUE]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.PAID]: [],
    [BillingDocumentStatus.VOID]: []
  };

  if (!allowed[current].includes(next)) {
    throw new Error(`Cannot change ${current.toLowerCase()} to ${next.toLowerCase()}.`);
  }
}

function documentPrefix(type: BillingDocumentType) {
  if (type === BillingDocumentType.QUOTE) return "QUO";
  if (type === BillingDocumentType.CONTRACT) return "CON";
  return "INV";
}

async function generateDocumentNumber(tx: Prisma.TransactionClient, type: BillingDocumentType, siteId: string) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = documentPrefix(type);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}-${today}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await tx.billingDocument.findFirst({
      where: { siteId, documentNumber: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique document number.");
}

async function recomputeDocumentTotals(tx: Prisma.TransactionClient, billingDocumentId: string, siteId: string) {
  const [document, lineItems] = await Promise.all([
    tx.billingDocument.findFirst({
      where: { id: billingDocumentId, siteId },
      select: { discountCents: true, taxCents: true }
    }),
    tx.billingLineItem.findMany({
      where: { billingDocumentId },
      select: { lineTotalCents: true }
    })
  ]);

  if (!document) return;

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = Math.min(document.discountCents, subtotalCents);
  const totalCents = Math.max(0, subtotalCents - discountCents + document.taxCents);

  await tx.billingDocument.update({
    where: { id: billingDocumentId },
    data: { subtotalCents, discountCents, totalCents }
  });
}

export async function updateBillingDocumentStatus(input: {
  billingDocumentId: string;
  status: BillingDocumentStatus;
  siteId?: string;
}) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const document = await tx.billingDocument.findFirst({
      where: { id: input.billingDocumentId, siteId },
      select: { acceptedAt: true, currency: true, status: true, totalCents: true }
    });

    if (!document) throw new Error("Billing document target not found.");
    assertAllowedBillingStatusTransition(document.status, input.status);

    if (input.status === BillingDocumentStatus.PAID && document.status !== BillingDocumentStatus.PAID) {
      const paid = await tx.billingPayment.aggregate({
        where: {
          billingDocumentId: input.billingDocumentId,
          status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] }
        },
        _sum: { amountCents: true }
      });
      const remainingCents = Math.max(0, document.totalCents - (paid._sum.amountCents || 0));

      if (remainingCents > 0) {
        await tx.billingPayment.create({
          data: {
            billingDocumentId: input.billingDocumentId,
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.PAID,
            amountCents: remainingCents,
            currency: document.currency,
            rawSummary: {
              strategy: "manual_admin_status_transition",
              note: "Created when an admin marked the billing document paid."
            }
          }
        });
      }
    }

    const updated = await tx.billingDocument.update({
      where: { id: input.billingDocumentId },
      data: {
        status: input.status,
        acceptedAt:
          input.status === BillingDocumentStatus.ACCEPTED || input.status === BillingDocumentStatus.PAID
            ? document.acceptedAt || now
            : undefined,
        paidAt: input.status === BillingDocumentStatus.PAID ? now : undefined
      }
    });

    if (input.status !== BillingDocumentStatus.DRAFT) {
      await snapshotBillingDocument(tx, input.billingDocumentId);
    }

    return updated;
  });
}

export async function createAutomationInvoice(input: {
  clientId?: string;
  customerName: string;
  customerEmail: string;
  currency?: string;
  dueAt?: Date;
  lineDescription: string;
  quantity?: number;
  unitPriceCents: number;
  discountCents?: number;
  taxCents?: number;
  notes?: string;
  publicMemo?: string;
  siteId?: string;
}) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const quantity = Math.min(Math.max(input.quantity || 1, 1), 999);
  const lineTotalCents = quantity * input.unitPriceCents;
  const discountCents = Math.max(0, input.discountCents || 0);
  const taxCents = Math.max(0, input.taxCents || 0);

  if (lineTotalCents > maxIntCents || lineTotalCents - discountCents + taxCents > maxIntCents) {
    throw new Error("Invoice total is too high.");
  }

  if (discountCents > lineTotalCents) {
    throw new Error("Invoice discount cannot exceed subtotal.");
  }

  return prisma.$transaction(async (tx) => {
    if (input.clientId) {
      const client = await tx.client.findFirst({ where: { id: input.clientId, siteId }, select: { id: true } });
      if (!client) throw new Error("Invoice client target not found.");
    }

    const document = await tx.billingDocument.create({
      data: {
        siteId,
        documentNumber: await generateDocumentNumber(tx, BillingDocumentType.INVOICE, siteId),
        publicAccessToken: generateBillingPublicToken(),
        type: BillingDocumentType.INVOICE,
        status: BillingDocumentStatus.DRAFT,
        clientId: input.clientId,
        customerName: input.customerName,
        customerEmail: input.customerEmail.toLowerCase(),
        currency: (input.currency || "USD").toUpperCase(),
        discountCents,
        taxCents,
        dueAt: input.dueAt,
        notes: input.notes || "",
        publicMemo: input.publicMemo || "",
        lineItems: {
          create: {
            description: input.lineDescription,
            quantity,
            unitPriceCents: input.unitPriceCents,
            lineTotalCents,
            sortOrder: 10
          }
        }
      }
    });

    await recomputeDocumentTotals(tx, document.id, siteId);
    return document;
  });
}
