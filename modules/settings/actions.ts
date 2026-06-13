"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { applyDataScopePreset, dataScopeConfigFromFormData, dataScopePresets, requireAdmin, type DataScopePreset } from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { setModuleEnablement } from "@/lib/modules/installation";
import { normalizeModules } from "@/shell/modules";
import { prisma } from "@/lib/prisma";
import { resolveCurrentSite } from "@/lib/site";
import { normalizeThemePreset } from "@/lib/theme/tokens";

export async function updateSettingsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const input = await parseForm(settingsFormSchema, formData);

  const enabledModules = formData.getAll("enabledModules").map(String);
  const safeModules = normalizeModules(enabledModules);
  const themePreset = normalizeThemePreset(input.themePreset);
  const site = await resolveCurrentSite();
  const dataScopePreset = String(formData.get("dataScopePreset") || "custom");
  const dataScopeConfig = dataScopePresets.includes(dataScopePreset as DataScopePreset)
    ? applyDataScopePreset(dataScopePreset as DataScopePreset)
    : dataScopeConfigFromFormData(formData);

  await prisma.siteSettings.upsert({
    where: { siteId: site.id },
    update: {
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      timezone: input.timezone,
      themePreset,
      themePrimary: input.themePrimary,
      mediaDriver: input.mediaDriver,
      ga4MeasurementId: input.ga4MeasurementId,
      googleAdsTagId: input.googleAdsTagId,
      metaPixelId: input.metaPixelId,
      searchConsoleVerification: input.searchConsoleVerification,
      analyticsRetentionDays: input.analyticsRetentionDays,
      dataScopeConfig,
      enabledModules: safeModules
    },
    create: {
      siteId: site.id,
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      timezone: input.timezone,
      themePreset,
      themePrimary: input.themePrimary,
      mediaDriver: input.mediaDriver,
      ga4MeasurementId: input.ga4MeasurementId,
      googleAdsTagId: input.googleAdsTagId,
      metaPixelId: input.metaPixelId,
      searchConsoleVerification: input.searchConsoleVerification,
      analyticsRetentionDays: input.analyticsRetentionDays,
      dataScopeConfig,
      enabledModules: safeModules
    }
  });

  // ModuleInstallation records are the forward source of truth; the JSON column above stays in sync as a
  // backward-compatible fallback. Tolerate the install table being absent so saving never hard-fails.
  await setModuleEnablement(safeModules, site.id).catch((error) => {
    console.error("[settings:module-enablement-failed]", error);
  });

  await recordAuditLog({
    action: "settings.updated",
    actor: user,
    metadata: {
      enabledModules: safeModules,
      ga4MeasurementId: input.ga4MeasurementId,
      googleAdsTagId: input.googleAdsTagId,
      metaPixelId: input.metaPixelId,
      mediaDriver: input.mediaDriver,
      analyticsRetentionDays: input.analyticsRetentionDays,
      searchConsoleVerification: input.searchConsoleVerification,
      dataScopePreset,
      themePreset,
      timezone: input.timezone
    },
    siteId: site.id,
    targetId: site.id,
    targetLabel: input.businessName,
    targetType: "site_settings"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=1");
}
