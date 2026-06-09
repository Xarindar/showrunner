"use server";

import { MediaDriver } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { setModuleEnablement } from "@/lib/modules/installation";
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

  // ModuleInstallation records are the forward source of truth; the JSON column above stays in sync as a
  // backward-compatible fallback. Tolerate the install table being absent so saving never hard-fails.
  await setModuleEnablement(safeModules).catch((error) => {
    console.error("[settings:module-enablement-failed]", error);
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=1");
}
