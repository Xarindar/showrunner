import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "billing",
  label: "Billing",
  href: "/admin/modules/billing",
  icon: "ReceiptText",
  order: 110,
  description: "Quotes, invoices, contracts, documents, and payment state.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "admin-foundation",
    mode: "admin-only",
    summary: "Quote, invoice, contract, line-item, attachment, totals, and status admin is live.",
    primaryGap: "Public accept/pay links, PDFs, partial payments, hosted checkout, recurring billing, and signing are pending."
  },
  capabilities: [
    { label: "Document admin", status: "foundation" },
    { label: "Server-side totals", status: "live" },
    { label: "Public payment/signing", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/billing"],
  dependencies: ["clients", "communications"],
  dataModels: ["BillingDocument", "BillingLineItem", "BillingAttachment"],
  permissions: ["billing.read", "billing.write"],
  settingsSections: ["Billing", "Payments", "Policies"],
  healthChecks: ["overdue-documents", "finalized-document-mutability"]
} satisfies ShellModule;
