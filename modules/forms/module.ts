import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "forms",
  label: "Forms",
  href: "/admin/modules/forms",
  icon: "ClipboardList",
  order: 62,
  description: "Reusable public forms, intake questions, and submission inbox.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
