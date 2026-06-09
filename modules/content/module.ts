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
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Homepage copy and hero media are live through SiteSettings.",
    primaryGap: "Page models, SEO metadata, redirects, sitemap controls, and structured data are not installed yet."
  },
  capabilities: [
    { label: "Homepage copy", status: "live" },
    { label: "Hero media URL", status: "live" },
    { label: "SEO/page management", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/content"],
  publicRoutes: ["/"],
  dependencies: ["settings", "media"],
  dataModels: ["SiteSettings"],
  permissions: ["content.read", "content.write"],
  settingsSections: ["Content", "SEO"],
  healthChecks: ["homepage-copy", "hero-image"]
} satisfies ShellModule;
