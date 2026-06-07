"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export async function uploadMediaAction(formData: FormData) {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/modules/media?error=missing-file");
  }

  try {
    await uploadMedia(file, String(formData.get("alt") || ""));
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "upload-failed";
    redirect(`/admin/modules/media?error=${message}`);
  }

  revalidatePath("/admin/modules/media");
  redirect("/admin/modules/media?saved=upload");
}

export async function setHeroImageAction(formData: FormData) {
  await requireAdmin();

  const url = String(formData.get("url") || "/hero.svg");
  await prisma.siteSettings.update({
    where: { id: "site" },
    data: { heroImageUrl: url }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect("/admin/modules/media?saved=hero");
}
