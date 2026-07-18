"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import { z } from "zod";
import { couponFormSchema, formObject, optionalMoneyCents, requiredText, zeroableMoneyCents } from "@/lib/admin-validation";
import { recordAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { completeSquareLocationSelection } from "@/lib/payments/connect/flow";
import { updateStripePaymentMethodSettings } from "@/lib/payments/methods";
import {
  disconnectPaymentProvider,
  reverifyPaymentProvider,
  savePayPalCredentials,
  saveSquareCredentials,
  saveSquareWebhookSignatureKey,
  saveStripeCredentials,
  type PayPalEnvironment,
  type SquareEnvironment
} from "@/lib/payments/provider-onboarding";
import { prisma } from "@/lib/prisma";
import { normalizeModules } from "@/shell/modules";
import { resolveCurrentSite } from "@/lib/site";
import type { PaymentActionState } from "./state";

// All payment actions return a small serializable state so the guided modals can show inline success
// and errors with useActionState — no full-page redirects that would tear down the wizard mid-flow.
function errorState(error: unknown, fallback: string): PaymentActionState {
  return { status: "error", message: error instanceof Error ? error.message : fallback };
}

function validationErrorMessage(error: { issues: Array<{ message: string; path: PropertyKey[] }> }) {
  const issue = error.issues[0];
  const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${field}${issue?.message || "Check the values and try again."}`;
}

const percentRateBps = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "Use a percentage such as 8.25.")
  .transform((value) => (value === "" ? 0 : Math.round(Number(value) * 100)))
  .refine((value) => value >= 0 && value <= 10_000, "Use a percentage from 0 to 100.");

const checkoutTotalsSchema = z
  .object({
    commerceFreeShippingThreshold: optionalMoneyCents,
    commerceShippingEnabled: z.literal("on").optional(),
    commerceShippingFlat: zeroableMoneyCents,
    commerceShippingLabel: requiredText,
    commerceTaxAppliesToShipping: z.literal("on").optional(),
    commerceTaxEnabled: z.literal("on").optional(),
    commerceTaxLabel: requiredText,
    commerceTaxRate: percentRateBps
  })
  .transform((value) => ({
    ...value,
    commerceShippingEnabled: value.commerceShippingEnabled === "on",
    commerceTaxAppliesToShipping: value.commerceTaxAppliesToShipping === "on",
    commerceTaxEnabled: value.commerceTaxEnabled === "on"
  }));

// Audit logging never records the pasted secret values themselves — only that a provider changed.
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

export async function connectStripeAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
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
    return errorState(error, "Could not save Stripe credentials.");
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function createCouponAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const parsed = couponFormSchema.safeParse(formObject(formData));

  if (!parsed.success) {
    return { status: "error", message: validationErrorMessage(parsed.error) };
  }

  const input = parsed.data;

  try {
    await prisma.coupon.create({
      data: {
        siteId: site.id,
        code: input.code,
        type: input.type,
        amountCents: input.amount,
        percentOff: input.percentOff,
        maxRedemptions: input.maxRedemptions,
        isActive: input.isActive
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: `Coupon ${input.code} already exists.` };
    }

    return errorState(error, "Could not create coupon.");
  }

  await recordAuditLog({
    action: "settings.coupon.created",
    actor: user,
    metadata: {
      code: input.code,
      type: input.type
    },
    siteId: site.id,
    targetId: site.id,
    targetLabel: input.code,
    targetType: "coupon"
  });

  revalidatePath("/admin/modules/payments");
  revalidatePath("/cart");
  return { status: "success", message: `Coupon ${input.code} created.` };
}

export async function updateCheckoutTotalsAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const parsed = checkoutTotalsSchema.safeParse(formObject(formData));

  if (!parsed.success) {
    return { status: "error", message: validationErrorMessage(parsed.error) };
  }

  const input = parsed.data;
  const before = await prisma.siteSettings.findUnique({
    where: { siteId: site.id },
    select: {
      commerceFreeShippingThresholdCents: true,
      commerceShippingEnabled: true,
      commerceShippingFlatCents: true,
      commerceShippingLabel: true,
      commerceTaxAppliesToShipping: true,
      commerceTaxEnabled: true,
      commerceTaxLabel: true,
      commerceTaxRateBps: true,
      id: true
    }
  });

  if (!before) {
    return { status: "error", message: "Site settings not found." };
  }

  const after = await prisma.siteSettings.update({
    where: { siteId: site.id },
    data: {
      commerceFreeShippingThresholdCents: input.commerceFreeShippingThreshold,
      commerceShippingEnabled: input.commerceShippingEnabled,
      commerceShippingFlatCents: input.commerceShippingFlat,
      commerceShippingLabel: input.commerceShippingLabel,
      commerceTaxAppliesToShipping: input.commerceTaxAppliesToShipping,
      commerceTaxEnabled: input.commerceTaxEnabled,
      commerceTaxLabel: input.commerceTaxLabel,
      commerceTaxRateBps: input.commerceTaxRate
    },
    select: {
      commerceFreeShippingThresholdCents: true,
      commerceShippingEnabled: true,
      commerceShippingFlatCents: true,
      commerceShippingLabel: true,
      commerceTaxAppliesToShipping: true,
      commerceTaxEnabled: true,
      commerceTaxLabel: true,
      commerceTaxRateBps: true,
      id: true
    }
  });

  await recordAuditLog({
    action: "settings.checkout_totals.updated",
    actor: user,
    metadata: { after, before },
    siteId: site.id,
    targetId: after.id,
    targetLabel: "Checkout totals",
    targetType: "site_settings"
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/modules/payments");
  revalidatePath("/cart");
  revalidatePath("/shop");
  return { status: "success", message: "Checkout totals saved." };
}

export async function connectSquareAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
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
    return errorState(error, "Could not save Square credentials.");
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

// Companion to one-click Square connect: OAuth stores the tokens, but the webhook signature key
// still has to be pasted once (Square webhook subscriptions cannot be created with merchant tokens).
export async function saveSquareWebhookKeyAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  try {
    await saveSquareWebhookSignatureKey({
      siteId: site.id,
      webhookSignatureKey: String(formData.get("squareWebhookSignatureKey") || "")
    });
    await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.webhook_key_updated", PaymentProvider.SQUARE);
  } catch (error) {
    return errorState(error, "Could not save the Square webhook signature key.");
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Square webhook signature key saved." };
}

export async function connectPayPalAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
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
    return errorState(error, "Could not save PayPal credentials.");
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function savePaymentMethodsAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const enabledMethods = formData.getAll("stripePaymentMethods").map(String);

  try {
    await updateStripePaymentMethodSettings({ enabledKeys: enabledMethods, siteId: site.id });
  } catch (error) {
    return errorState(error, "Could not update the ways customers pay.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.payment_methods.updated", PaymentProvider.STRIPE, {
    enabledMethods
  });
  revalidatePath("/", "layout");
  return { status: "success" };
}

function parseConnectableProvider(value: FormDataEntryValue | null) {
  const provider = String(value || "").trim().toUpperCase();
  if (provider === PaymentProvider.STRIPE || provider === PaymentProvider.SQUARE || provider === PaymentProvider.PAYPAL) {
    return provider as PaymentProvider;
  }
  throw new Error("Choose a supported payment provider.");
}

function providerLabel(provider: PaymentProvider) {
  return provider === PaymentProvider.STRIPE ? "Stripe" : provider === PaymentProvider.SQUARE ? "Square" : "PayPal";
}

export async function setCheckoutProviderAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseConnectableProvider(formData.get("checkoutProvider"));
    const credential = await getConnectedGatewayCredential(site.id, provider);
    const connected =
      credential?.status === PaymentGatewayConnectionStatus.CONNECTED &&
      (provider === PaymentProvider.STRIPE ? Boolean(credential.externalAccountId.trim()) : Boolean(credential.merchantId.trim()));
    if (!connected) {
      throw new Error(`Connect ${providerLabel(provider)} before making it the checkout provider.`);
    }

    await prisma.siteSettings.upsert({
      where: { siteId: site.id },
      update: { checkoutProvider: provider },
      create: { checkoutProvider: provider, enabledModules: normalizeModules([]), siteId: site.id }
    });
  } catch (error) {
    return errorState(error, "Could not update the checkout account.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.checkout_provider.updated", provider);
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function disconnectProviderAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseConnectableProvider(formData.get("provider"));
    await disconnectPaymentProvider({ provider, siteId: site.id });
  } catch (error) {
    return errorState(error, "Could not disconnect that provider.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.disconnected", provider);
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function selectSquareOAuthLocationAction(formData: FormData): Promise<never> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();
  const locationId = String(formData.get("locationId") || "").trim();
  let errorMessage = "";
  try {
    const result = await completeSquareLocationSelection({ siteId: site.id, locationId });
    await recordAuditLog({
      action: "settings.payment_provider.square_location_selected",
      actor: user,
      metadata: { locationId },
      siteId: site.id,
      targetId: site.id,
      targetLabel: `${site.name}: ${result.displayName}`,
      targetType: "payment_gateway"
    });
    revalidatePath("/", "layout");
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Could not select that Square location.";
  }
  redirect(
    errorMessage
      ? `/admin/modules/payments?connectError=${encodeURIComponent(errorMessage)}`
      : "/admin/modules/payments?connected=square"
  );
}

export async function reverifyProviderAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const user = await requireAdmin("settings:update");
  const site = await resolveCurrentSite();

  let provider: PaymentProvider;
  try {
    provider = parseConnectableProvider(formData.get("provider"));
    await reverifyPaymentProvider({ provider, siteId: site.id });
  } catch (error) {
    return errorState(error, "Could not re-check that provider.");
  }

  await auditPaymentProvider(user, site.id, site.name, "settings.payment_provider.reverified", provider);
  revalidatePath("/", "layout");
  return { status: "success" };
}
