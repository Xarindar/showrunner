"use server";

import { randomBytes } from "crypto";
import { BillingDocumentStatus, BillingDocumentType, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import {
  ensureBillingPublicToken,
  generateBillingPublicToken,
  publicBillingUrl,
  snapshotBillingDocument
} from "@/lib/billing/documents";
import { isRejectedCapturedPayment } from "@/lib/billing/payments";
import { updateBillingDocumentStatus } from "@/lib/billing/status";
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
import { queueBillingDocumentEmail } from "@/lib/email";
import { refundPaymentGatewayPayment } from "@/lib/payments/refunds";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

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

const billingCheckoutSchema = z.object({
  id: requiredText,
  checkoutUrl: safeExternalHttpsUrl,
  paymentExternalReference: optionalStoredText
});

const billingCheckoutClearSchema = z.object({
  id: requiredText,
  confirmClear: z.literal("on", { error: "Confirm before clearing the hosted checkout link." })
});

const billingEmailSchema = z.object({
  id: requiredText
});

const billingRefundSchema = z.object({
  paymentId: requiredText,
  amount: moneyCents
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

async function generateDocumentNumber(type: BillingDocumentType, siteId: string) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = documentPrefix(type);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}-${today}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.billingDocument.findFirst({
      where: { siteId, documentNumber: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique document number.");
}

async function requestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("host") || "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
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

async function requireDraftDocument(tx: Prisma.TransactionClient, billingDocumentId: string, siteId: string) {
  const document = await tx.billingDocument.findFirst({
    where: { id: billingDocumentId, siteId },
    select: { status: true }
  });

  if (!document) throw new Error("Billing document not found.");
  if (document.status !== BillingDocumentStatus.DRAFT) {
    throw new Error("Finalized billing documents cannot be edited.");
  }
}

async function validateClientId(clientId: string | undefined, siteId: string) {
  if (!clientId) return;

  const client = await prisma.client.findFirst({
    where: { id: clientId, siteId },
    select: { id: true }
  });

  if (!client) {
    redirect(`/admin/modules/billing?error=${encodeURIComponent("Selected client no longer exists.")}`);
  }
}

export async function createBillingDocumentAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingDocumentSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();
  await validateClientId(input.clientId, siteId);
  const lineTotalCents = input.quantity * input.unitPrice;

  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
      const created = await tx.billingDocument.create({
        data: {
          siteId,
          documentNumber: await generateDocumentNumber(input.type, siteId),
          publicAccessToken: generateBillingPublicToken(),
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

      await recomputeDocumentTotals(tx, created.id, siteId);
      if (input.status !== BillingDocumentStatus.DRAFT) {
        await snapshotBillingDocument(tx, created.id);
      }
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
  await requireAdmin("billing:manage");
  const input = await parseForm(billingDocumentUpdateSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();
  await validateClientId(input.clientId, siteId);

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.id, siteId);

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

      await recomputeDocumentTotals(tx, input.id, siteId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that billing document.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=document&document=${input.id}`);
}

export async function updateBillingDocumentStatusAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingStatusSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    await updateBillingDocumentStatus({ billingDocumentId: input.id, status: input.status, siteId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that billing status.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
}

export async function setBillingCheckoutLinkAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingCheckoutSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.billingDocument.findFirst({
        where: { id: input.id, siteId },
        select: { status: true }
      });

      if (!document) throw new Error("Billing document not found.");
      if (document.status === BillingDocumentStatus.DRAFT) {
        throw new Error("Send the document before attaching a hosted payment link.");
      }
      if (document.status === BillingDocumentStatus.PAID || document.status === BillingDocumentStatus.VOID) {
        throw new Error("Finalized billing documents cannot receive a payment link.");
      }

      await tx.billingDocument.update({
        where: { id: input.id },
        data: {
          checkoutProvider: PaymentProvider.STRIPE,
          checkoutUrl: input.checkoutUrl,
          paymentExternalReference: input.paymentExternalReference
        }
      });
      await snapshotBillingDocument(tx, input.id);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the hosted checkout link.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=checkout&document=${input.id}`);
}

export async function clearBillingCheckoutLinkAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingCheckoutClearSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.billingDocument.findFirst({
        where: { id: input.id, siteId },
        select: { status: true }
      });

      if (!document) throw new Error("Billing document not found.");
      if (document.status === BillingDocumentStatus.PAID || document.status === BillingDocumentStatus.VOID) {
        throw new Error("Finalized billing documents cannot be changed.");
      }

      await tx.billingDocument.update({
        where: { id: input.id },
        data: {
          checkoutProvider: null,
          checkoutUrl: "",
          paymentExternalReference: ""
        }
      });
      if (document.status !== BillingDocumentStatus.DRAFT) {
        await snapshotBillingDocument(tx, input.id);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not clear the hosted checkout link.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=checkout-clear&document=${input.id}`);
}

export async function queueBillingDocumentEmailAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingEmailSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    const origin = await requestOrigin();
    const document = await prisma.$transaction(async (tx) => {
      const owned = await tx.billingDocument.findFirst({
        where: { id: input.id, siteId },
        select: { id: true }
      });

      if (!owned) return null;

      const publicAccessToken = await ensureBillingPublicToken(tx, input.id);
      await snapshotBillingDocument(tx, input.id);

      return tx.billingDocument.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          documentNumber: true,
          type: true,
          status: true,
          customerName: true,
          customerEmail: true,
          currency: true,
          totalCents: true,
          dueAt: true,
          publicMemo: true,
          checkoutProvider: true,
          checkoutUrl: true,
          publicAccessToken: true
        }
      }).then((row) => (row ? { ...row, publicAccessToken } : null));
    });

    if (!document) throw new Error("Billing document not found.");
    if (document.status === BillingDocumentStatus.DRAFT) {
      throw new Error("Send the document before emailing the customer link.");
    }

    await queueBillingDocumentEmail({
      document,
      publicUrl: publicBillingUrl(origin, document.publicAccessToken),
      idempotencyKey: `billing:${document.id}:notice:${document.status}:${Date.now()}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue that billing email.";
    redirect(`/admin/modules/billing?document=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=email&document=${input.id}`);
}

export async function addBillingLineItemAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingLineItemSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();
  const lineTotalCents = input.quantity * input.unitPrice;

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId, siteId);

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

      await recomputeDocumentTotals(tx, input.billingDocumentId, siteId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line&document=${input.billingDocumentId}`);
}

export async function updateBillingLineItemAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingLineItemUpdateSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();
  const lineTotalCents = input.quantity * input.unitPrice;

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId, siteId);

      await tx.billingLineItem.updateMany({
        where: { id: input.id, billingDocumentId: input.billingDocumentId },
        data: {
          description: input.description,
          quantity: input.quantity,
          unitPriceCents: input.unitPrice,
          lineTotalCents,
          sortOrder: input.sortOrder
        }
      });

      await recomputeDocumentTotals(tx, input.billingDocumentId, siteId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line&document=${input.billingDocumentId}`);
}

export async function deleteBillingLineItemAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingLineItemDeleteSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId, siteId);

      await tx.billingLineItem.deleteMany({
        where: { id: input.id, billingDocumentId: input.billingDocumentId }
      });

      await recomputeDocumentTotals(tx, input.billingDocumentId, siteId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that line item.";
    redirect(`/admin/modules/billing?document=${input.billingDocumentId}&error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=line-delete&document=${input.billingDocumentId}`);
}

export async function addBillingAttachmentAction(formData: FormData) {
  await requireAdmin("billing:manage");
  const input = await parseForm(billingAttachmentSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      await requireDraftDocument(tx, input.billingDocumentId, siteId);

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

function billingPaymentAuditSnapshot(payment: {
  amountCents: number;
  billingDocument: {
    documentNumber: string;
    id: string;
    status: BillingDocumentStatus;
  };
  currency: string;
  externalCheckoutSession: string | null;
  externalPaymentId: string | null;
  id: string;
  provider: PaymentProvider;
  refundedCents: number;
  status: PaymentStatus;
}) {
  return {
    amountCents: payment.amountCents,
    billingDocumentId: payment.billingDocument.id,
    currency: payment.currency,
    documentNumber: payment.billingDocument.documentNumber,
    documentStatus: payment.billingDocument.status,
    externalCheckoutSession: payment.externalCheckoutSession || "",
    externalPaymentId: payment.externalPaymentId || "",
    paymentId: payment.id,
    provider: payment.provider,
    refundedCents: payment.refundedCents,
    remainingRefundableCents: Math.max(0, payment.amountCents - payment.refundedCents),
    status: payment.status
  };
}

async function rollbackBillingRefundReservation(input: {
  amountCents: number;
  paymentId: string;
  status: PaymentStatus;
}) {
  await prisma.billingPayment.update({
    where: { id: input.paymentId },
    data: {
      refundedCents: { decrement: input.amountCents },
      status: input.status
    }
  });
}

export async function refundBillingPaymentAction(formData: FormData) {
  const user = await requireAdmin("billing:manage");
  const input = await parseForm(billingRefundSchema, formData, "/admin/modules/billing");
  const siteId = await getCurrentSiteId();
  let documentId = "";

  try {
    const payment = await prisma.billingPayment.findFirst({
      where: {
        id: input.paymentId,
        billingDocument: { siteId }
      },
      include: { billingDocument: true }
    });

    if (!payment) throw new Error("Billing payment not found.");
    documentId = payment.billingDocumentId;
    const rejectedButCaptured = isRejectedCapturedPayment(payment);
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.AUTHORIZED && !rejectedButCaptured) {
      throw new Error("Only paid billing payments can be refunded.");
    }

    const remainingCents = rejectedButCaptured ? payment.amountCents : Math.max(0, payment.amountCents - payment.refundedCents);
    if (input.amount <= 0 || input.amount > remainingCents) {
      throw new Error("Refund amount must be greater than zero and no more than the refundable balance.");
    }

    const before = billingPaymentAuditSnapshot(payment);
    const reserved = await prisma.billingPayment.updateMany({
      where: {
        id: payment.id,
        billingDocument: { siteId },
        status: rejectedButCaptured ? PaymentStatus.FAILED : { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] },
        refundedCents: { lte: payment.amountCents - input.amount }
      },
      data: {
        refundedCents: { increment: input.amount }
      }
    });
    if (reserved.count !== 1) {
      throw new Error("Refund amount is no longer available. Reload and try again.");
    }

    try {
      await refundPaymentGatewayPayment({
        amountCents: input.amount,
        paymentId: payment.id,
        provider: payment.provider,
        siteId
      });
    } catch (refundError) {
      await rollbackBillingRefundReservation({
        amountCents: input.amount,
        paymentId: payment.id,
        status: payment.status
      });
      throw refundError;
    }

    await prisma.billingPayment.updateMany({
      where: {
        id: payment.id,
        refundedCents: { gte: payment.amountCents },
        status: rejectedButCaptured ? PaymentStatus.FAILED : { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] }
      },
      data: { status: PaymentStatus.REFUNDED }
    });

    const afterPayment = await prisma.billingPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { billingDocument: true }
    });
    await recordAuditLog({
      action: "billing.payment_refunded",
      actor: user,
      metadata: {
        amountCents: input.amount,
        after: billingPaymentAuditSnapshot(afterPayment),
        before,
        currency: payment.currency,
        provider: payment.provider
      },
      siteId,
      targetId: payment.id,
      targetLabel: payment.billingDocument.documentNumber,
      targetType: "billing_payment"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refund that billing payment.";
    redirect(`/admin/modules/billing${documentId ? `?document=${documentId}&` : "?"}error=${encodeURIComponent(message)}`);
  }

  refreshBilling();
  redirect(`/admin/modules/billing?saved=refund&document=${documentId}`);
}
