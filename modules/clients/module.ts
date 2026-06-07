import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "clients",
  label: "Clients",
  href: "/admin/modules/clients",
  icon: "Users",
  order: 40,
  description: "Client profiles, private notes, and appointment history.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
