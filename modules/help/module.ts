import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "help",
  label: "Help",
  href: "/admin/modules/help",
  icon: "BookOpen",
  order: 80,
  description: "Plain-language admin operating guide.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
