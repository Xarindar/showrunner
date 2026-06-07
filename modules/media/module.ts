import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "media",
  label: "Media",
  href: "/admin/modules/media",
  icon: "Image",
  order: 60,
  description: "Repo assets and optional R2 uploads.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
