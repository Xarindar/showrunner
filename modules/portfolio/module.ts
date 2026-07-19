import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "portfolio",
  label: "Portfolio",
  href: "/admin/modules/portfolio",
  icon: "Image",
  order: 120,
  navigation: { category: "website" },
  description: "Photography galleries, proofing records, access links, and image delivery settings.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Gallery administration, access records, proofing data, signed image variants, downloads, and ZIP delivery bundles are live.",
    primaryGap: "The public gallery experience is being rebuilt in the new clients surface."
  },
  capabilities: [
    { label: "Gallery admin", status: "foundation" },
    { label: "Access-token delivery", status: "live" },
    { label: "Proofing favorites", status: "live" },
    { label: "Comments and approvals", status: "live" },
    { label: "Gallery widgets and lightbox", status: "planned" },
    { label: "Selectable gallery layouts", status: "live" },
    { label: "Signed image variants", status: "live" },
    { label: "ZIP delivery bundles", status: "live" }
  ],
  adminRoutes: ["/admin/modules/portfolio"],
  publicRoutes: ["/api/public/v1/galleries", "/api/public/v1/galleries/[slug]"],
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
