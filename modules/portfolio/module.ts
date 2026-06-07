import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "portfolio",
  label: "Portfolio",
  href: "/admin/modules/portfolio",
  icon: "Image",
  order: 120,
  description: "Photography galleries, proofing records, access links, and image delivery settings.",
  layout: "wide",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
