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
  enabledByDefault: true
} satisfies ShellModule;
