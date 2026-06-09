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
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Public galleries, access-token proofing, downloads, and favorite capture are live on top of the gallery admin records.",
    primaryGap: "Comments, approvals, gallery widgets, generated variants, and fully signed storage delivery are still pending."
  },
  capabilities: [
    { label: "Gallery admin", status: "foundation" },
    { label: "Access-token delivery", status: "live" },
    { label: "Proofing favorites", status: "live" },
    { label: "Comments and approvals", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/portfolio"],
  publicRoutes: ["/galleries/[slug]", "/galleries/access/[token]"],
  widgetRoutes: [],
  dependencies: ["media", "clients"],
  dataModels: ["PortfolioGallery", "PortfolioGalleryItem", "PortfolioGalleryAccess", "PortfolioGalleryFavorite"],
  permissions: ["portfolio.read", "portfolio.write"],
  settingsSections: ["Portfolio", "Media"],
  healthChecks: ["published-galleries", "private-access-records"]
} satisfies ShellModule;
