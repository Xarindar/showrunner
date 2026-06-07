import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "analytics",
  label: "Analytics",
  href: "/admin/modules/analytics",
  icon: "Gauge",
  order: 130,
  description: "Module metrics, source attribution, standard events, and conversion goals.",
  layout: "wide",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
