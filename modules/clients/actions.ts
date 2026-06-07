"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { clientFormSchema, clientNoteFormSchema, clientUpdateFormSchema, parseForm } from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";

export async function createClientAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(clientFormSchema, formData);

  const client = await prisma.client.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      phone: input.phone,
      privateNotes: input.privateNotes
    },
    create: {
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

  await prisma.client.update({
    where: { id: input.id },
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

  await prisma.clientNote.create({
    data: {
      clientId: input.clientId,
      content: input.content
    }
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=note`);
}
