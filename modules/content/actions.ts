"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCurrentSite } from "@/lib/site";
import { defaultEnabledModules } from "@/shell/modules";

export async function updateContentAction(formData: FormData) {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();

  await prisma.siteSettings.upsert({
    where: { siteId: site.id },
    update: {
      heroImageUrl: String(formData.get("heroImageUrl") || "/hero.svg"),
      heroHeadline: String(formData.get("heroHeadline") || ""),
      heroSubheadline: String(formData.get("heroSubheadline") || ""),
      introTitle: String(formData.get("introTitle") || ""),
      introBody: String(formData.get("introBody") || "")
    },
    create: {
      siteId: site.id,
      enabledModules: defaultEnabledModules,
      heroImageUrl: String(formData.get("heroImageUrl") || "/hero.svg"),
      heroHeadline: String(formData.get("heroHeadline") || ""),
      heroSubheadline: String(formData.get("heroSubheadline") || ""),
      introTitle: String(formData.get("introTitle") || ""),
      introBody: String(formData.get("introBody") || "")
    }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  redirect("/admin/modules/content?saved=1");
}
