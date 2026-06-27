"use server";

import { revalidatePath } from "next/cache";
import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import { couponFormSchema, formObject } from "@/lib/admin-validation";
import { recordAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
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
import { prisma } from "@/lib/prisma";
import { normalizeModules } from "@/shell/modules";
import { resolveCurrentSite } from "@/lib/site";

// All payment actions return a small serializable state so the guided modals can show inline success
// and errors with useActionState — no full-page redirects that would tear down the wizard mid-flow.
export type PaymentActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

export const initialPaymentActionState: PaymentActionState = { status: "idle" };

function errorState(error: unknown, fallback: string): PaymentActionState {
  return { status: "error", message: error instanceof Error ? error.message : fallback };
}

function validationErrorMessage(error: { issues: Array<{ message: string; path: PropertyKey[] }> }) {
  const issue = error.issues[0];
  const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${field}${issue?.message || "Check the coupon and try again."}`;
}

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
