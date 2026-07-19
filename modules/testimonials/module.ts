import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "testimonials",
  label: "Testimonials",
  href: "/admin/modules/testimonials",
  icon: "Star",
  order: 64,
  navigation: { category: "website" },
  description: "Review collection, moderation, featured quotes, and proof content.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Testimonial moderation, featured display management, moderation audit trail, honeypot, and rate limits are live.",
    primaryGap: "The public testimonial collection page is being rebuilt in the new clients surface."
  },
  capabilities: [
    { label: "Public collection", status: "planned" },
    { label: "Moderation", status: "live" },
    { label: "Moderation audit trail", status: "live" },
    { label: "Request/import workflows", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/testimonials"],
  dependencies: ["clients", "content"],
  dataModels: ["Testimonial", "Client", "PublicRateLimit"],
  permissions: ["testimonials:manage"],
  settingsSections: ["Content", "Compliance"],
  healthChecks: ["pending-testimonials", "public-rate-limits"],
  dataScope: {
    ownerKind: "client-link",
    ownerField: "clientId",
    ownerRelationField: "client",
    scopableRoles: [AdminRole.STAFF]
  }
} satisfies ShellModule;
