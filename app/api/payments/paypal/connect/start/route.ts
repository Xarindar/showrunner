import { NextResponse } from "next/server";
import { PaymentProvider } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { paymentOnboardingUnavailableMessage } from "@/lib/payments/onboarding-status";
import { createPayPalPartnerReferralUrl } from "@/lib/payments/paypal-connect";
import { getCurrentSiteId } from "@/lib/site";

function settingsRedirect(key: "error" | "saved", value: string) {
  const url = new URL("/admin/modules/settings", publicAppBaseUrl());
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET() {
  await requireAdmin("settings:update");
  const siteId = await getCurrentSiteId();

  try {
    return NextResponse.redirect(await createPayPalPartnerReferralUrl(siteId));
  } catch (error) {
    console.error("[payments:paypal-connect-start-failed]", error);
    return settingsRedirect("error", paymentOnboardingUnavailableMessage(PaymentProvider.PAYPAL));
  }
}
