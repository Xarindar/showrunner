import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "content",
  label: "Content",
  href: "/admin/modules/content",
  icon: "LayoutTemplate",
  order: 20,
  description: "Public-site copy and hero image settings.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
