import { AdminRole } from "@prisma/client";
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
    summary: "Public galleries, selectable gallery layouts, access-token proofing, signed image variants, downloads, ZIP delivery bundles, favorite capture, widget/API embeds, and lightbox viewing are live.",
    primaryGap: "Print/lab workflows, batch upload tooling, and watermark controls remain pending."
  },
  capabilities: [
    { label: "Gallery admin", status: "foundation" },
    { label: "Access-token delivery", status: "live" },
    { label: "Proofing favorites", status: "live" },
    { label: "Comments and approvals", status: "live" },
    { label: "Gallery widgets and lightbox", status: "live" },
    { label: "Selectable gallery layouts", status: "live" },
    { label: "Signed image variants", status: "live" },
    { label: "ZIP delivery bundles", status: "live" }
  ],
  adminRoutes: ["/admin/modules/portfolio"],
  publicRoutes: ["/galleries/[slug]", "/galleries/access/[token]", "/api/public/v1/galleries", "/api/public/v1/galleries/[slug]"],
  widgetRoutes: ["/galleries/[slug]#gallery-grid", "/embed/v1/gallery.js"],
  dependencies: ["media", "clients"],
  dataModels: ["PortfolioGallery", "PortfolioGalleryItem", "PortfolioGalleryAccess", "PortfolioGalleryFavorite", "PortfolioGalleryLayout"],
  permissions: ["portfolio:manage"],
  settingsSections: ["Portfolio", "Media"],
  healthChecks: ["published-galleries", "private-access-records"],
  dataScope: {
    ownerKind: "staff-field",
    ownerField: "photographerId",
    scopableRoles: [AdminRole.PHOTOGRAPHER]
  }
} satisfies ShellModule;
