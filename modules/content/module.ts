import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "content",
  label: "Content",
  href: "/admin/modules/content",
  icon: "LayoutTemplate",
  order: 20,
  navigation: { category: "website" },
  description: "Client-specific content studio assembled from reusable editors and deployment configuration.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Manifest-driven content editors, canonical business info, page SEO, and scoped JSON delivery.",
    primaryGap: "Cottage production migration and promotional renderer/integration verification remain pending."
  },
  capabilities: [
    { label: "Configured hero content", status: "live" },
    { label: "Featured booking card builder", status: "live" },
    { label: "Testimonial curation", status: "live" },
    { label: "Contact / Business Info and page SEO", status: "live" }
  ],
  adminRoutes: ["/admin/modules/content"],
  publicRoutes: ["/", "/api/public/v1/content/profile", "/api/public/v1/content/studio"],
  dependencies: ["settings", "media"],
  dataModels: ["SiteSettings.publicContentConfig", "HeroPresentation", "HeroSlide", "HeroSlideElement"],
  permissions: ["content:manage"],
  settingsSections: ["Content", "SEO"],
  healthChecks: ["homepage-copy", "hero-image"]
} satisfies ShellModule;
