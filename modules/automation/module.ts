import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "automation",
  label: "Automation",
  href: "/admin/modules/automation",
  icon: "Workflow",
  order: 120,
  description: "Trigger rules, run history, and outbound webhook setup.",
  layout: "wide",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
