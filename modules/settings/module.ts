import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "settings",
  label: "Settings",
  href: "/admin/modules/settings",
  icon: "Settings",
  order: 70,
  description: "Business settings, theme basics, and module toggles.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
