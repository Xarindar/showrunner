import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "payments",
  label: "Payments",
  href: "/admin/modules/payments",
  icon: "Wallet",
  order: 95,
  description: "Connect your own payment accounts and choose how customers pay.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "live",
    mode: "live",
    summary: "Guided bring-your-own-credentials setup for Stripe, Square, and PayPal, with checkout and payment-method controls.",
    primaryGap: "Cash App Pay and Affirm ride along with Stripe; both unlock once Stripe is connected."
  },
  capabilities: [
    { label: "Guided provider connection", status: "live" },
    { label: "Live credential verification", status: "live" },
    { label: "Payment-method controls", status: "live" },
    { label: "Checkout provider selection", status: "live" }
  ],
  adminRoutes: ["/admin/modules/payments"],
  dependencies: ["settings"],
  dataModels: ["PaymentGatewayCredential", "SiteSettings"],
  permissions: ["settings:update"],
  settingsSections: ["Payments"],
  healthChecks: ["checkout-adapter"]
} satisfies ShellModule;
