import { AdminRole } from "@prisma/client";
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
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Public testimonial collection, moderation, featured display, honeypot, and rate limits are live.",
    primaryGap: "Review requests, third-party imports, consent snapshots, schema output, and moderation audit trail are pending."
  },
  capabilities: [
    { label: "Public collection", status: "live" },
    { label: "Moderation", status: "live" },
    { label: "Request/import workflows", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/testimonials"],
  publicRoutes: ["/testimonials"],
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
