import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "content",
  label: "Content",
  href: "/admin/modules/content",
  icon: "LayoutTemplate",
  order: 20,
  description: "Public-site copy, hero screens, and call-to-action presentation.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Homepage copy, hero layout, and hero slideshow screens are live.",
    primaryGap: "Page models, SEO metadata, redirects, sitemap controls, and structured data are not installed yet."
  },
  capabilities: [
    { label: "Homepage hero studio", status: "live" },
    { label: "Hero slideshow screens", status: "live" },
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
