import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "billing",
  label: "Billing",
  href: "/admin/modules/billing",
  icon: "ReceiptText",
  order: 110,
  navigation: { category: "finance" },
  description: "Quotes, invoices, contracts, documents, and payment state.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Document administration, line items, attachments, totals, status, hosted checkout-link handoff, payment records and refunds are available.",
    primaryGap: "Public document pages, PDF routes, customer document emails, recurring billing and contract signing/versioning are unavailable."
  },
  capabilities: [
    { label: "Document admin", status: "foundation" },
    { label: "Server-side totals", status: "live" },
    { label: "Public document accept/pay", status: "planned" },
    { label: "PDF document rendering", status: "planned" },
    { label: "Contract signing", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/billing"],
  dependencies: ["clients", "communications"],
  dataModels: ["BillingDocument", "BillingLineItem", "BillingAttachment", "BillingPayment"],
  permissions: ["billing:manage"],
  settingsSections: ["Billing", "Payments", "Policies"],
  healthChecks: ["overdue-documents", "finalized-document-mutability"]
} satisfies ShellModule;
