"use server";

import { MediaDriver } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { normalizeModules } from "@/shell/modules";
import { prisma } from "@/lib/prisma";
import { normalizeThemePreset } from "@/lib/theme/tokens";

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(settingsFormSchema, formData);

  const enabledModules = formData.getAll("enabledModules").map(String);
  const safeModules = normalizeModules(enabledModules);
  const themePreset = normalizeThemePreset(input.themePreset);

  await prisma.siteSettings.upsert({
    where: { id: "site" },
    update: {
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      timezone: input.timezone,
      themePreset,
      themePrimary: input.themePrimary,
      mediaDriver: input.mediaDriver === MediaDriver.R2 ? MediaDriver.R2 : MediaDriver.REPO,
      enabledModules: safeModules
    },
    create: {
      id: "site",
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      timezone: input.timezone,
      themePreset,
      themePrimary: input.themePrimary,
      mediaDriver: input.mediaDriver === MediaDriver.R2 ? MediaDriver.R2 : MediaDriver.REPO,
      enabledModules: safeModules
    }
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=1");
}
