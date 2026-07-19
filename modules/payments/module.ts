import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "payments",
  label: "Payments",
  href: "/admin/modules/payments",
  icon: "Wallet",
  order: 95,
  navigation: { category: "finance" },
  description: "Connect payment accounts, choose how customers pay, and manage checkout coupons and totals.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "live",
    mode: "live",
    summary: "Guided bring-your-own-credentials setup for Stripe, Square, and PayPal, with checkout, coupon, tax, shipping, and payment-method controls.",
    primaryGap: "Cash App Pay and Affirm ride along with Stripe; both unlock once Stripe is connected."
  },
  capabilities: [
    { label: "Guided provider connection", status: "live" },
    { label: "Live credential verification", status: "live" },
    { label: "Payment-method controls", status: "live" },
    { label: "Coupon admin", status: "foundation" },
    { label: "Checkout totals", status: "live" },
    { label: "Checkout provider selection", status: "live" }
  ],
  adminRoutes: ["/admin/modules/payments"],
  dependencies: ["settings"],
  dataModels: ["PaymentGatewayCredential", "SiteSettings", "Coupon"],
  permissions: ["settings:update"],
  settingsSections: ["Payments"],
  healthChecks: ["checkout-adapter"]
} satisfies ShellModule;
