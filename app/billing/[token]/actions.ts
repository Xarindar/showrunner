"use server";

import { BillingDocumentStatus, BillingDocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { snapshotBillingDocument } from "@/lib/billing/documents";
import { prisma } from "@/lib/prisma";

const acceptSchema = z.object({
  token: z.string().trim().min(1)
});

export async function acceptPublicBillingDocumentAction(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token")
  });

  if (!parsed.success) {
    redirect("/?error=billing-document");
  }

  const token = parsed.data.token;

  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.billingDocument.findUnique({
        where: { publicAccessToken: token },
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
