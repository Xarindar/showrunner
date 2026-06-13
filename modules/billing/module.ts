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
    level: "partial",
    mode: "mixed",
    summary: "Quote, invoice, contract, line-item, attachment, totals, status admin, public accept/pay, PDFs, and partial payments are live.",
    primaryGap: "Recurring billing, refunds, and contract signing/versioning are pending."
  },
  capabilities: [
    { label: "Document admin", status: "foundation" },
    { label: "Server-side totals", status: "live" },
    { label: "Public accept/pay", status: "live" },
    { label: "PDF document rendering", status: "live" },
    { label: "Contract signing", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/billing"],
  dependencies: ["clients", "communications"],
  dataModels: ["BillingDocument", "BillingLineItem", "BillingAttachment", "BillingPayment"],
  permissions: ["billing:manage"],
  settingsSections: ["Billing", "Payments", "Policies"],
  healthChecks: ["overdue-documents", "finalized-document-mutability"]
} satisfies ShellModule;
