import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "communications",
  label: "Communications",
  href: "/admin/modules/communications",
  icon: "Mail",
  order: 100,
  description: "Message templates, delivery logs, and suppression controls.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
