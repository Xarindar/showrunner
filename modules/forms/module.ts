import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "forms",
  label: "Forms",
  href: "/admin/modules/forms",
  icon: "ClipboardList",
  order: 62,
  description: "Reusable forms, intake questions, and submission inbox.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Form builder CRUD, template cloning, submission storage, client/inquiry linking, honeypot, and rate limits are live.",
    primaryGap: "The public form experience is being rebuilt in the new clients surface."
  },
  capabilities: [
    { label: "Public form route", status: "planned" },
    { label: "Builder CRUD", status: "live" },
    { label: "Starter template catalog", status: "live" },
    { label: "Booking, order, and gallery attachments", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/forms"],
  publicRoutes: ["/api/public/v1/forms/[slug]", "/api/public/v1/forms/[slug]/submissions"],
  dependencies: ["clients", "communications"],
  dataModels: ["Form", "FormField", "FormSubmission", "PublicRateLimit"],
  permissions: ["forms:manage", "forms:export"],
  settingsSections: ["Forms", "Notifications"],
  healthChecks: ["active-forms", "public-rate-limits"],
  dataScope: {
    ownerKind: "client-link",
    ownerField: "clientId",
    ownerRelationField: "client",
    scopableRoles: [AdminRole.STAFF]
  }
} satisfies ShellModule;
