import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "content",
  label: "Content",
  href: "/admin/modules/content",
  icon: "LayoutTemplate",
  order: 20,
  description: "Public-site copy, canvas hero, and call-to-action presentation.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Homepage copy, canvas hero layout, and JSON delivery are live.",
    primaryGap: "Page models, redirects, sitemap controls, and deeper SEO controls are not installed yet."
  },
  capabilities: [
    { label: "Homepage hero canvas", status: "live" },
    { label: "Hero JSON delivery", status: "live" },
    { label: "SEO/page management", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/content"],
  publicRoutes: ["/"],
  dependencies: ["settings", "media"],
  dataModels: ["SiteSettings", "HeroPresentation", "HeroSlide", "HeroSlideElement"],
  permissions: ["content:manage"],
  settingsSections: ["Content", "SEO"],
  healthChecks: ["homepage-copy", "hero-image"]
} satisfies ShellModule;
