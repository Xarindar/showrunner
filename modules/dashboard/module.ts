import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "dashboard",
  label: "Dashboard",
  href: "/admin",
  icon: "Gauge",
  order: 10,
  description: "Overview, shortcuts, and upcoming work.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
