"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { clientFormSchema, clientNoteFormSchema, clientUpdateFormSchema, parseForm } from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

export async function createClientAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(clientFormSchema, formData);

  const client = await prisma.client.upsert({
    where: { siteId_email: { siteId: DEFAULT_SITE_ID, email: input.email } },
    update: {
      name: input.name,
      phone: input.phone,
      privateNotes: input.privateNotes
    },
    create: {
      siteId: DEFAULT_SITE_ID,
      name: input.name,
      email: input.email,
      phone: input.phone,
      privateNotes: input.privateNotes
    }
  });

  revalidatePath("/admin/modules/clients");
  redirect(`/admin/clients/${client.id}`);
}

export async function updateClientAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(clientUpdateFormSchema, formData);

  await prisma.client.updateMany({
    where: { id: input.id, siteId: DEFAULT_SITE_ID },
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      status: input.status,
      privateNotes: input.privateNotes
    }
  });

  revalidatePath("/admin/modules/clients");
  revalidatePath(`/admin/clients/${input.id}`);
  redirect(`/admin/clients/${input.id}?saved=client`);
}

export async function addClientNoteAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(clientNoteFormSchema, formData);
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, siteId: DEFAULT_SITE_ID },
    select: { id: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  await prisma.clientNote.create({
    data: {
      clientId: input.clientId,
      content: input.content
    }
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=note`);
}
