"use server";

import { randomBytes } from "crypto";
import { BillingDocumentStatus, BillingDocumentType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  currencyCode,
  maxIntCents,
  moneyCents,
  optionalId,
  optionalStoredText,
  parseForm,
  requiredText,
  safeExternalHttpsUrl,
  zeroableMoneyCents
} from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const optionalDate = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value ? new Date(`${value}T00:00:00`) : undefined))
  .refine((value) => value === undefined || !Number.isNaN(value.getTime()), "Use a valid date.");

const billingDocumentSchema = z
  .object({
    type: z.enum(BillingDocumentType).catch(BillingDocumentType.INVOICE),
    status: z.enum([BillingDocumentStatus.DRAFT, BillingDocumentStatus.SENT]).catch(BillingDocumentStatus.DRAFT),
    clientId: optionalId,
    customerName: requiredText,
    customerEmail: z.email().transform((value) => value.trim().toLowerCase()),
    currency: currencyCode.catch("USD"),
    dueAt: optionalDate,
    notes: optionalStoredText,
    publicMemo: optionalStoredText,
    lineDescription: requiredText,
    quantity: z.coerce.number().int().min(1).max(999),
    unitPrice: moneyCents,
    discount: zeroableMoneyCents,
    tax: zeroableMoneyCents
  })
  .refine((value) => value.discount <= value.quantity * value.unitPrice, {
    message: "Discount cannot exceed the subtotal.",
    path: ["discount"]
  })
  .refine((value) => value.quantity * value.unitPrice <= maxIntCents, {
    message: "Line total is too high.",
    path: ["unitPrice"]
  })
  .refine((value) => value.quantity * value.unitPrice - value.discount + value.tax <= maxIntCents, {
    message: "Document total is too high.",
    path: ["tax"]
  });

const billingStatusSchema = z.object({
  id: requiredText,
  status: z.enum(BillingDocumentStatus)
});

const billingDocumentUpdateSchema = z.object({
  id: requiredText,
  clientId: optionalId,
  customerName: requiredText,
  customerEmail: z.email().transform((value) => value.trim().toLowerCase()),
  currency: currencyCode.catch("USD"),
  dueAt: optionalDate,
  discount: zeroableMoneyCents,
  tax: zeroableMoneyCents,
  notes: optionalStoredText,
  publicMemo: optionalStoredText
});

const billingLineItemBaseSchema = z.object({
    billingDocumentId: requiredText,
    description: requiredText,
    quantity: z.coerce.number().int().min(1).max(999),
    unitPrice: moneyCents
  });

const billingLineItemSchema = billingLineItemBaseSchema
  .refine((value) => value.quantity * value.unitPrice <= maxIntCents, {
    message: "Line total is too high.",
    path: ["unitPrice"]
  });

const billingLineItemUpdateSchema = billingLineItemBaseSchema
  .extend({
    id: requiredText,
    sortOrder: z.coerce.number().int().default(0)
  })
  .refine((value) => value.quantity * value.unitPrice <= maxIntCents, {
    message: "Line total is too high.",
    path: ["unitPrice"]
  });

const billingLineItemDeleteSchema = z.object({
  id: requiredText,
  billingDocumentId: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the line item." })
});

const billingAttachmentSchema = z.object({
  billingDocumentId: requiredText,
  title: requiredText,
  url: safeExternalHttpsUrl,
  notes: optionalStoredText
});

function refreshBilling() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/billing");
}

function documentPrefix(type: BillingDocumentType) {
  if (type === BillingDocumentType.QUOTE) return "QUO";
  if (type === BillingDocumentType.CONTRACT) return "CON";
  return "INV";
}

async function generateDocumentNumber(type: BillingDocumentType) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = documentPrefix(type);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}-${today}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.billingDocument.findUnique({
      where: { documentNumber: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique document number.");
}

async function recomputeDocumentTotals(tx: Prisma.TransactionClient, billingDocumentId: string) {
  const [document, lineItems] = await Promise.all([
    tx.billingDocument.findUnique({
      where: { id: billingDocumentId },
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

async function requireDraftDocument(tx: Prisma.TransactionClient, billingDocumentId: string) {
  const document = await tx.billingDocument.findUnique({
    where: { id: billingDocumentId },
    select: { status: true }
  });

  if (!document) throw new Error("Billing document not found.");
  if (document.status !== BillingDocumentStatus.DRAFT) {
    throw new Error("Finalized billing documents cannot be edited.");
  }
}

async function validateClientId(clientId?: string) {
  if (!clientId) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true }
  });

  if (!client) {
    redirect(`/admin/modules/billing?error=${encodeURIComponent("Selected client no longer exists.")}`);
  }
}

function assertAllowedStatusTransition(current: BillingDocumentStatus, next: BillingDocumentStatus) {
  if (current === next) return;

  const allowed: Record<BillingDocumentStatus, BillingDocumentStatus[]> = {
    [BillingDocumentStatus.DRAFT]: [BillingDocumentStatus.SENT, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.SENT]: [BillingDocumentStatus.ACCEPTED, BillingDocumentStatus.PAID, BillingDocumentStatus.VOID, BillingDocumentStatus.OVERDUE],
    [BillingDocumentStatus.ACCEPTED]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID, BillingDocumentStatus.OVERDUE],
    [BillingDocumentStatus.OVERDUE]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.PAID]: [],
    [BillingDocumentStatus.VOID]: []
  };

  if (!allowed[current].includes(next)) {
    throw new Error(`Cannot change ${current.toLowerCase()} to ${next.toLowerCase()}.`);
  }
}

export async function createBillingDocumentAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingDocumentSchema, formData, "/admin/modules/billing");
  await validateClientId(input.clientId);
  const lineTotalCents = input.quantity * input.unitPrice;

  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
      const created = await tx.billingDocument.create({
        data: {
          documentNumber: await generateDocumentNumber(input.type),
          type: input.type,
          status: input.status,
          clientId: input.clientId,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          currency: input.currency,
          discountCents: input.discount,
          taxCents: input.tax,
          dueAt: input.dueAt,
          notes: input.notes,
          publicMemo: input.publicMemo,
          lineItems: {
            create: {
              description: input.lineDescription,
              quantity: input.quantity,
              unitPriceCents: input.unitPrice,
              lineTotalCents,
              sortOrder: 10
            }
          }
        }
      });

      await recomputeDocumentTotals(tx, created.id);
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2003")) {
      redirect(`/admin/modules/billing?error=${encodeURIComponent("Could not create that billing document. Try again.")}`);
    }

    const message = error instanceof Error ? error.message : "Could not create that billing document. Try again.";
    redirect(`/admin/modules/billing?error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=document&document=${document.id}`);
}

export async function updateBillingDocumentAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingDocumentUpdateSchema, formData, "/admin/modules/billing");
  await validateClientId(input.clientId);

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.id);

      await tx.billingDocument.update({
        where: { id: input.id },
        data: {
          clientId: input.clientId,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          currency: input.currency,
          dueAt: input.dueAt,
          discountCents: input.discount,
          taxCents: input.tax,
          notes: input.notes,
          publicMemo: input.publicMemo
        }
      });

      await recomputeDocumentTotals(tx, input.id);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that billing document.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=document&document=${input.id}`);
}

export async function updateBillingDocumentStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingStatusSchema, formData, "/admin/modules/billing");
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.billingDocument.findUnique({
        where: { id: input.id },
        select: { status: true, acceptedAt: true }
      });

      if (!document) throw new Error("Billing document not found.");
      assertAllowedStatusTransition(document.status, input.status);

      await tx.billingDocument.update({
        where: { id: input.id },
        data: {
          status: input.status,
          acceptedAt:
            input.status === BillingDocumentStatus.ACCEPTED || input.status === BillingDocumentStatus.PAID
              ? document.acceptedAt || now
              : undefined,
          paidAt: input.status === BillingDocumentStatus.PAID ? now : undefined
        }
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that billing status.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
}

export async function addBillingLineItemAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingLineItemSchema, formData, "/admin/modules/billing");
  const lineTotalCents = input.quantity * input.unitPrice;

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId);

      const currentSubtotal = await tx.billingLineItem.aggregate({
        where: { billingDocumentId: input.billingDocumentId },
        _sum: { lineTotalCents: true }
      });

      if ((currentSubtotal._sum.lineTotalCents || 0) + lineTotalCents > maxIntCents) {
        throw new Error("Document subtotal is too high.");
      }

      const lineCount = await tx.billingLineItem.count({
        where: { billingDocumentId: input.billingDocumentId }
      });

      await tx.billingLineItem.create({
        data: {
          billingDocumentId: input.billingDocumentId,
          description: input.description,
          quantity: input.quantity,
          unitPriceCents: input.unitPrice,
          lineTotalCents,
          sortOrder: lineCount * 10 + 10
        }
      });

      await recomputeDocumentTotals(tx, input.billingDocumentId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line&document=${input.billingDocumentId}`);
}

export async function updateBillingLineItemAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingLineItemUpdateSchema, formData, "/admin/modules/billing");
  const lineTotalCents = input.quantity * input.unitPrice;

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId);

      await tx.billingLineItem.update({
        where: { id: input.id },
        data: {
          description: input.description,
          quantity: input.quantity,
          unitPriceCents: input.unitPrice,
          lineTotalCents,
          sortOrder: input.sortOrder
        }
      });

      await recomputeDocumentTotals(tx, input.billingDocumentId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line&document=${input.billingDocumentId}`);
}

export async function deleteBillingLineItemAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingLineItemDeleteSchema, formData, "/admin/modules/billing");

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId);

      await tx.billingLineItem.delete({
        where: { id: input.id }
      });

      await recomputeDocumentTotals(tx, input.billingDocumentId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line-delete&document=${input.billingDocumentId}`);
}

export async function addBillingAttachmentAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(billingAttachmentSchema, formData, "/admin/modules/billing");

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId);

      await tx.billingAttachment.create({
        data: {
          billingDocumentId: input.billingDocumentId,
          title: input.title,
          url: input.url,
          notes: input.notes
        }
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach that document.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=attachment&document=${input.billingDocumentId}`);
}
