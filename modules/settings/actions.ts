"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { applyDataScopePreset, dataScopeConfigFromFormData, dataScopePresets, requireAdmin, type DataScopePreset } from "@/lib/auth";
import { parseForm, settingsFormSchema } from "@/lib/admin-validation";
import { setModuleEnablement } from "@/lib/modules/installation";
import { createSiteApiKey, parseOriginsInput, revokeSiteApiKey, updateSiteApiKeyOrigins } from "@/lib/embed/keys";
import { normalizeScopes } from "@/lib/embed/scopes";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { updateStripePaymentMethodSettings } from "@/lib/payments/methods";
import {
  disconnectPaymentProvider,
  reverifyPaymentProvider,
  savePayPalCredentials,
  saveSquareCredentials,
  saveStripeCredentials,
  type PayPalEnvironment,
  type SquareEnvironment
} from "@/lib/payments/provider-onboarding";
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

export async function updateStripePaymentMethodsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const enabledMethods = formData.getAll("stripePaymentMethods").map(String);

  try {
    await updateStripePaymentMethodSettings({
      enabledKeys: enabledMethods,
      siteId: site.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Stripe checkout methods.";
    redirect(`/admin/modules/settings?error=${encodeURIComponent(message)}`);
  }

  await recordAuditLog({
    action: "settings.payment_methods.updated",
    actor: user,
    metadata: {
      enabledMethods,
      provider: "STRIPE"
    },
    siteId: site.id,
    targetId: site.id,
    targetLabel: site.name,
    targetType: "payment_gateway"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=payments");
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

function parseCheckoutProvider(value: FormDataEntryValue | null) {
  const provider = String(value || "").trim().toUpperCase();
  if (provider === PaymentProvider.STRIPE || provider === PaymentProvider.SQUARE || provider === PaymentProvider.PAYPAL) return provider;
  throw new Error("Choose a supported checkout provider.");
}

export async function updateCheckoutProviderAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseCheckoutProvider(formData.get("checkoutProvider"));
    if (provider === PaymentProvider.STRIPE || provider === PaymentProvider.SQUARE || provider === PaymentProvider.PAYPAL) {
      const credential = await getConnectedGatewayCredential(site.id, provider);
      const connected =
        credential?.status === PaymentGatewayConnectionStatus.CONNECTED &&
        (provider === PaymentProvider.STRIPE ? Boolean(credential.externalAccountId.trim()) : Boolean(credential.merchantId.trim()));
      if (!connected) {
        const label =
          provider === PaymentProvider.STRIPE ? "Stripe" : provider === PaymentProvider.SQUARE ? "Square" : "PayPal";
        throw new Error(`Connect ${label} before making it the checkout provider.`);
      }
    }

    await prisma.siteSettings.upsert({
      where: { siteId: site.id },
      update: { checkoutProvider: provider },
      create: {
        checkoutProvider: provider,
        enabledModules: normalizeModules([]),
        siteId: site.id
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update checkout provider.";
    redirect(`/admin/modules/settings?error=${encodeURIComponent(message)}`);
  }

  await recordAuditLog({
    action: "settings.checkout_provider.updated",
    actor: user,
    metadata: {
      provider
    },
    siteId: site.id,
    targetId: site.id,
    targetLabel: site.name,
    targetType: "payment_gateway"
  });

  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=payments");
}

function paymentProviderError(message: string): never {
  redirect(`/admin/modules/settings?error=${encodeURIComponent(message)}`);
}

function paymentProviderSaved(): never {
  revalidatePath("/", "layout");
  redirect("/admin/modules/settings?saved=payments");
}

function parseConnectablePaymentProvider(value: FormDataEntryValue | null) {
  const provider = String(value || "").trim().toUpperCase();
  if (provider === PaymentProvider.STRIPE || provider === PaymentProvider.SQUARE || provider === PaymentProvider.PAYPAL) {
    return provider as PaymentProvider;
  }
  throw new Error("Choose a supported payment provider.");
}

// Audit logging never records the pasted secret values themselves — only that a provider was connected.
async function auditPaymentProvider(
  user: Awaited<ReturnType<typeof requireAdmin>>,
  siteId: string,
  siteName: string,
  action: string,
  provider: PaymentProvider,
  metadata: Record<string, unknown> = {}
) {
  await recordAuditLog({
    action,
    actor: user,
    metadata: { provider, ...metadata },
    siteId,
    targetId: siteId,
    targetLabel: siteName,
    targetType: "payment_gateway"
  });
}

export async function saveStripeCredentialsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  try {
    const result = await saveStripeCredentials({
      apiKey: String(formData.get("stripeApiKey") || ""),
      siteId: site.id,
      webhookSecret: String(formData.get("stripeWebhookSecret") || "")
    });
    await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.connected", PaymentProvider.STRIPE, {
      keyMode: result.livemode ? "live" : "test"
    });
  } catch (error) {
    paymentProviderError(error instanceof Error ? error.message : "Could not save Stripe credentials.");
  }

  paymentProviderSaved();
}

export async function saveSquareCredentialsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const environment = (String(formData.get("squareEnvironment") || "production").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production") as SquareEnvironment;

  try {
    await saveSquareCredentials({
      accessToken: String(formData.get("squareAccessToken") || ""),
      environment,
      locationId: String(formData.get("squareLocationId") || ""),
      siteId: site.id,
      webhookSignatureKey: String(formData.get("squareWebhookSignatureKey") || "")
    });
    await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.connected", PaymentProvider.SQUARE, {
      environment
    });
  } catch (error) {
    paymentProviderError(error instanceof Error ? error.message : "Could not save Square credentials.");
  }

  paymentProviderSaved();
}

export async function savePayPalCredentialsAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const environment = (String(formData.get("paypalEnvironment") || "live").toLowerCase() === "sandbox"
    ? "sandbox"
    : "live") as PayPalEnvironment;

  try {
    await savePayPalCredentials({
      clientId: String(formData.get("paypalClientId") || ""),
      clientSecret: String(formData.get("paypalClientSecret") || ""),
      environment,
      siteId: site.id,
      webhookId: String(formData.get("paypalWebhookId") || "")
    });
    await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.connected", PaymentProvider.PAYPAL, {
      environment
    });
  } catch (error) {
    paymentProviderError(error instanceof Error ? error.message : "Could not save PayPal credentials.");
  }

  paymentProviderSaved();
}

export async function disconnectPaymentProviderAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseConnectablePaymentProvider(formData.get("provider"));
    await disconnectPaymentProvider({ provider, siteId: site.id });
  } catch (error) {
    paymentProviderError(error instanceof Error ? error.message : "Could not disconnect that provider.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.disconnected", provider);
  paymentProviderSaved();
}

export async function reverifyPaymentProviderAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseConnectablePaymentProvider(formData.get("provider"));
    await reverifyPaymentProvider({ provider, siteId: site.id });
  } catch (error) {
    paymentProviderError(error instanceof Error ? error.message : "Could not re-check that provider.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.reverified", provider);
  paymentProviderSaved();
}
