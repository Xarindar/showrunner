import "server-only";

import { PaymentGatewayConnectionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SiteSettingsWithModules } from "@/lib/site";
import type { ModuleId } from "@/shell/modules";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

export type OnboardingChecklist = {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  allDone: boolean;
};

// SiteSettings ships these as schema defaults (prisma/schema/core.prisma). Matching values mean the
// client has not personalized the public site yet, so the branding step still counts as "to do".
const DEFAULT_BUSINESS_NAME = "Showrunner";
const DEFAULT_HERO_HEADLINE = "Book services without the back-and-forth";

// The dashboard's onboarding card is intentionally client-facing: it surfaces the few concrete things a
// business must do to start taking bookings, not the deploy/ops health checks (those live in Help).
// Each milestone is gated on the module that owns it being enabled, so a slimmed-down install only ever
// sees steps it can actually act on.
export async function getOnboardingChecklist(settings: SiteSettingsWithModules): Promise<OnboardingChecklist> {
  const isEnabled = (moduleId: ModuleId) => settings.enabledModuleIds.includes(moduleId);

  const [activeServices, availabilityRules, bookings, connectedPaymentProviders] = await Promise.all([
    isEnabled("scheduling")
      ? prisma.service.count({ where: { siteId: settings.siteId, isActive: true } })
      : Promise.resolve(0),
    isEnabled("scheduling")
      ? prisma.availabilityRule.count({ where: { siteId: settings.siteId } })
      : Promise.resolve(0),
    isEnabled("appointments")
      ? prisma.booking.count({ where: { siteId: settings.siteId } })
      : Promise.resolve(0),
    isEnabled("payments")
      ? prisma.paymentGatewayCredential
          .count({ where: { siteId: settings.siteId, status: PaymentGatewayConnectionStatus.CONNECTED } })
          .catch(() => 0)
      : Promise.resolve(0)
  ]);

  const steps: OnboardingStep[] = [];

  if (isEnabled("content")) {
    steps.push({
      id: "branding",
      title: "Personalize your homepage",
      description: "Swap our placeholder headline, hero image, and intro copy for your own so visitors see your brand.",
      done: settings.heroHeadline !== DEFAULT_HERO_HEADLINE || settings.businessName !== DEFAULT_BUSINESS_NAME,
      href: "/admin/modules/content",
      cta: "Edit content"
    });
  }

  if (isEnabled("scheduling")) {
    steps.push({
      id: "services",
      title: "Add a bookable service",
      description: "Create at least one active service with a name, length, category, and tags. Nothing can be booked until you do.",
      done: activeServices > 0,
      href: "/admin/modules/services",
      cta: "Add a service"
    });
    steps.push({
      id: "availability",
      title: "Set your weekly hours",
      description: "Tell us the days and times you take appointments so customers only ever see real openings.",
      done: availabilityRules > 0,
      href: "/admin/modules/appointments?panel=rules&tab=availability",
      cta: "Set hours"
    });
  }

  if (isEnabled("payments")) {
    steps.push({
      id: "payments",
      title: "Connect a way to get paid",
      description: "Link Stripe, Square, or PayPal to take deposits and payments at checkout with your own account.",
      done: connectedPaymentProviders > 0,
      href: "/admin/modules/payments",
      cta: "Connect payments"
    });
  }

  if (isEnabled("appointments")) {
    steps.push({
      id: "first-booking",
      title: "Take your first booking",
      description: "Share your booking link or place a test booking to see the whole flow end to end.",
      done: bookings > 0,
      href: "/book",
      cta: "Open booking page"
    });
  }

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    allDone: steps.length > 0 && completed === steps.length
  };
}
