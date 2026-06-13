import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "forms",
  label: "Forms",
  href: "/admin/modules/forms",
  icon: "ClipboardList",
  order: 62,
  description: "Reusable public forms, intake questions, and submission inbox.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Public forms, builder CRUD, template cloning, submission storage, client/inquiry linking, honeypot, and rate limits are live.",
    primaryGap: "File uploads, conditional logic, field versioning, exports, and booking/order/gallery attachments are pending."
  },
  capabilities: [
    { label: "Public form route", status: "live" },
    { label: "Builder CRUD", status: "live" },
    { label: "Starter template catalog", status: "live" },
    { label: "Advanced workflow attachment", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/forms"],
  publicRoutes: ["/forms/[slug]"],
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
