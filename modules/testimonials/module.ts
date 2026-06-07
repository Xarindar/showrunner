import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "testimonials",
  label: "Testimonials",
  href: "/admin/modules/testimonials",
  icon: "Star",
  order: 64,
  description: "Review collection, moderation, featured quotes, and public proof blocks.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
