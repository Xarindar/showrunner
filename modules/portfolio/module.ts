import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "portfolio",
  label: "Portfolio",
  href: "/admin/modules/portfolio",
  icon: "Image",
  order: 120,
  navigation: { category: "website" },
  description: "Photo albums and galleries for showcasing work on the website.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Website albums, photo uploads, gallery layouts, and image previews are available.",
    primaryGap: "Website gallery widgets and lightbox integration are still planned."
  },
  capabilities: [
    { label: "Website photo albums", status: "live" },
    { label: "Photo uploads and previews", status: "live" },
    { label: "Selectable gallery layouts", status: "live" },
    { label: "Gallery widgets and lightbox", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/portfolio"],
  publicRoutes: ["/api/public/v1/galleries", "/api/public/v1/galleries/[slug]"],
  dependencies: ["media"],
  dataModels: ["PortfolioGallery", "PortfolioGalleryItem", "PortfolioGalleryLayout"],
  permissions: ["portfolio:manage"],
  settingsSections: ["Portfolio", "Media"],
  healthChecks: [],
  dataScope: {
    ownerKind: "staff-field",
    ownerField: "photographerId",
    scopableRoles: [AdminRole.PHOTOGRAPHER]
  }
} satisfies ShellModule;
