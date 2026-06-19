"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { applyDataScopePreset, dataScopeConfigFromFormData, dataScopePresets, requireAdmin, type DataScopePreset } from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { setModuleEnablement } from "@/lib/modules/installation";
import { createSiteApiKey, parseOriginsInput, revokeSiteApiKey, updateSiteApiKeyOrigins } from "@/lib/embed/keys";
import { normalizeScopes } from "@/lib/embed/scopes";
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

export async function createSiteApiKeyAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const name = String(formData.get("name") || "").trim();
  const allowedOrigins = parseOriginsInput(String(formData.get("allowedOrigins") || ""));
  const allowServerToServer = formData.get("allowServerToServer") === "on";
  const scopes = normalizeScopes(formData.getAll("scopes").map(String));

  if (!name) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Name the embed key so you can recognize it later.")}`);
  }

  const key = await createSiteApiKey({ siteId: site.id, name, allowedOrigins, allowServerToServer, scopes });

  await recordAuditLog({
    action: "embed.api_key.created",
    actor: user,
    metadata: {
      allowedOrigins: key.allowedOrigins,
      allowServerToServer: key.allowServerToServer,
      scopes: key.scopes
    },
    siteId: site.id,
    targetId: key.id,
    targetLabel: key.name,
    targetType: "site_api_key"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=embed");
}

export async function revokeSiteApiKeyAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const keyId = String(formData.get("keyId") || "").trim();
  const confirmRevoke = String(formData.get("confirmRevoke") || "").trim();

  if (!keyId) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Missing embed key to revoke.")}`);
  }

  if (confirmRevoke !== "REVOKE") {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Type REVOKE to confirm API key revocation.")}`);
  }

  const result = await revokeSiteApiKey(site.id, keyId);
  if (result.count === 0) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("That embed key was not found for this site.")}`);
  }

  await recordAuditLog({
    action: "embed.api_key.revoked",
    actor: user,
    siteId: site.id,
    targetId: keyId,
    targetLabel: keyId,
    targetType: "site_api_key"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=embed");
}

export async function updateSiteApiKeyOriginsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const keyId = String(formData.get("keyId") || "").trim();
  const allowedOrigins = parseOriginsInput(String(formData.get("allowedOrigins") || ""));

  if (!keyId) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Missing embed key to update.")}`);
  }

  const result = await updateSiteApiKeyOrigins(site.id, keyId, allowedOrigins);
  if (result.count === 0) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("That embed key was not found for this site.")}`);
  }

  await recordAuditLog({
    action: "embed.api_key.origins_updated",
    actor: user,
    metadata: { allowedOrigins },
    siteId: site.id,
    targetId: keyId,
    targetLabel: keyId,
    targetType: "site_api_key"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=embed");
}
