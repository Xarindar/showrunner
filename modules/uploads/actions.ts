"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUploadAdmin } from "@/lib/uploads/access";
import { configureUploadCors } from "@/lib/uploads/storage";

const path = "/admin/modules/uploads";

export async function createUploadRequest(form: FormData) {
  const { siteId } = await requireUploadAdmin();
  const title = String(form.get("title") || "").trim();
  if (!title || title.length > 120) redirect(`${path}?error=title`);
  try {
    await configureUploadCors(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    await prisma.uploadRequest.create({ data: {
      siteId, title, token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 30 * 86400000)
    } });
  } catch (error) {
    console.error("Create upload request failed", error);
    redirect(`${path}?error=storage`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function closeUploadRequest(form: FormData) {
  const { siteId } = await requireUploadAdmin();
  await prisma.uploadRequest.updateMany({ where: { id: String(form.get("id") || ""), siteId, closedAt: null }, data: { closedAt: new Date() } });
  revalidatePath(path);
}
