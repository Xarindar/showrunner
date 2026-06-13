"use server";

import { BillingDocumentStatus, BillingDocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { moneyCents } from "@/lib/admin-validation";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { getBillingPaymentSummary } from "@/lib/billing/payments";
import { createStripeCheckoutSessionForBillingDocument } from "@/lib/commerce/stripe";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

const acceptSchema = z.object({
  token: z.string().trim().min(1)
});

const paymentSchema = z.object({
  token: z.string().trim().min(1),
  amount: moneyCents
});

export async function acceptPublicBillingDocumentAction(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token")
  });

  if (!parsed.success) {
    redirect("/?error=billing-document");
  }

  const token = parsed.data.token;
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.billingDocument.findUnique({
        where: { siteId_publicAccessToken: { siteId, publicAccessToken: token } },
        select: { id: true, type: true, status: true, acceptedAt: true }
      });

      if (!document) throw new Error("Document not found.");
      if (document.type === BillingDocumentType.INVOICE) {
        throw new Error("Invoices are payable, not accepted.");
      }
      if (document.status !== BillingDocumentStatus.SENT && document.status !== BillingDocumentStatus.OVERDUE) {
        throw new Error("This document cannot be accepted from its current state.");
      }

      await tx.billingDocument.update({
        where: { id: document.id },
        data: {
          status: BillingDocumentStatus.ACCEPTED,
          acceptedAt: document.acceptedAt || new Date()
        }
      });
      await snapshotBillingDocument(tx, document.id);
    });
  } catch (error) {
    redirect(`/billing/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not accept this document.")}`);
  }

  revalidatePath(`/billing/${token}`);
  revalidatePath("/admin/modules/billing");
  redirect(`/billing/${encodeURIComponent(token)}?accepted=1`);
}

export async function createPublicBillingCheckoutAction(formData: FormData) {
  const parsed = paymentSchema.safeParse({
    token: formData.get("token"),
    amount: formData.get("amount")
  });

  if (!parsed.success) {
    redirect("/?error=billing-payment");
  }

  const { amount, token } = parsed.data;
  const siteId = await getCurrentSiteId();
  let checkoutUrl = "";

  try {
    const document = await prisma.billingDocument.findUnique({
      where: { siteId_publicAccessToken: { siteId, publicAccessToken: token } },
      select: {
        id: true,
        status: true
      }
    });

    if (!document || document.status === BillingDocumentStatus.DRAFT) throw new Error("Document not found.");

    const summary = await prisma.$transaction((tx) => getBillingPaymentSummary(tx, document.id));
    if (amount > summary.remainingCents) {
      throw new Error("Payment amount cannot exceed the remaining balance.");
    }

    const checkout = await createStripeCheckoutSessionForBillingDocument({
      amountCents: amount,
      billingDocumentId: document.id,
      siteId
    });
    checkoutUrl = checkout.checkoutUrl;
  } catch (error) {
    redirect(`/billing/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not start payment.")}`);
  }

  redirect(checkoutUrl);
}
