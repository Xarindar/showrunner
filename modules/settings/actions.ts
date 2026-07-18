"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MediaVariantType } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import {
  applyDataScopePreset,
  dataScopeConfigFromFormData,
  dataScopePresets,
  getOwnerStaffIds,
  requireAdmin,
  resolveDataScopeMode,
  type DataScopePreset
} from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { setModuleEnablement } from "@/lib/modules/installation";
import { clientVipSettingsFromFormData } from "@/lib/clients/vip-settings";
import { saveClientVipSettings } from "@/lib/clients/vip";
import { createSiteApiKey, parseOriginsInput, revokeSiteApiKey, updateSiteApiKeyOrigins } from "@/lib/embed/keys";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { normalizeScopes } from "@/lib/embed/scopes";
import { normalizeModules } from "@/shell/modules";
import { prisma } from "@/lib/prisma";
import { getSiteSettings, resolveCurrentSite } from "@/lib/site";
import { normalizeThemePreset } from "@/lib/theme/tokens";

function refreshSettings() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/modules/settings");
  revalidatePath("/admin/modules/media");
  revalidatePath("/sitemap.xml");
}

function hasUpload(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

async function setLogoImageUrl(siteId: string, logoImageUrl: string) {
  await prisma.siteSettings.update({
    where: { siteId },
    data: { logoImageUrl }
  });
}

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
      themePrimary: input.themePrimary,
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

  refreshSettings();
  redirect("/admin/modules/settings?saved=1");
}

export async function uploadSiteLogoAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const file = formData.get("file");
  if (!hasUpload(file)) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Choose a logo image before uploading.")}`);
  }

  const ownerStaffIds = await getOwnerStaffIds(user, settings.siteId);
  if ((await resolveDataScopeMode(user, settings.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Create an active staff profile before uploading scoped media.")}`);
  }

  let asset: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    asset = await uploadMedia(
      file,
      {
        alt: String(formData.get("alt") || `${settings.businessName} logo`).trim() || `${settings.businessName} logo`,
        folder: "brand/logo",
        tags: ["brand", "logo"],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "site logo"
      },
      settings.mediaDriver,
      settings.siteId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo upload failed.";
    redirect(`/admin/modules/settings?error=${encodeURIComponent(message)}`);
  }

  const logoImageUrl = mediaAssetDisplayUrl(asset, MediaVariantType.FULL);
  await setLogoImageUrl(settings.siteId, logoImageUrl);
  await recordAuditLog({
    action: "settings.logo.uploaded",
    actor: user,
    metadata: {
      logoImageUrl,
      mediaAssetId: asset.id
    },
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: settings.businessName,
    targetType: "site_settings"
  });

  refreshSettings();
  redirect("/admin/modules/settings?saved=logo");
}

export async function attachSiteLogoAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const mediaAssetId = String(formData.get("mediaAssetId") || "").trim();
  if (!mediaAssetId) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Choose an active logo asset.")}`);
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, siteId: settings.siteId, deletedAt: null, isPrivate: false },
    select: { alt: true, driver: true, filename: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
  });
  if (!asset) {
    redirect(`/admin/modules/settings?error=${encodeURIComponent("Choose an active public logo asset.")}`);
  }

  const logoImageUrl = mediaAssetDisplayUrl(asset, MediaVariantType.FULL);
  await setLogoImageUrl(settings.siteId, logoImageUrl);
  await recordAuditLog({
    action: "settings.logo.attached",
    actor: user,
    metadata: {
      logoImageUrl,
      mediaAssetId: asset.id
    },
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: settings.businessName,
    targetType: "site_settings"
  });

  refreshSettings();
  redirect("/admin/modules/settings?saved=logo");
}

export async function removeSiteLogoAction(_formData: FormData) {
  void _formData;
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  await setLogoImageUrl(settings.siteId, "");
  await recordAuditLog({
    action: "settings.logo.removed",
    actor: user,
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: settings.businessName,
    targetType: "site_settings"
  });

  refreshSettings();
  redirect("/admin/modules/settings?saved=logo-removed");
}

export async function updateClientVipSettingsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const vipSettings = clientVipSettingsFromFormData(formData);

  await saveClientVipSettings(site.id, vipSettings);

  await recordAuditLog({
    action: "settings.clients_vip.updated",
    actor: user,
    metadata: vipSettings,
    siteId: site.id,
    targetId: site.id,
    targetLabel: "Clients VIP settings",
    targetType: "module_setting"
  });

  revalidatePath("/admin/modules/settings/modules");
  revalidatePath("/admin/modules/clients");
  redirect("/admin/modules/settings/modules?saved=clients-vip");
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

  refreshSettings();
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

  refreshSettings();
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

  refreshSettings();
  redirect("/admin/modules/settings?saved=embed");
}
