import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "clients",
  label: "Clients",
  href: "/admin/modules/clients",
  icon: "Users",
  order: 40,
  description: "Client profiles, pipeline stages, saved segments, files, private notes, and unified relationship history.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary:
      "Client records, notes, linked bookings/forms/testimonials, timeline, segments, pipeline stages, preferences, files, CSV import/export, and duplicate merge are live.",
    primaryGap: "Portal access and formal consent document versioning are still pending."
  },
  capabilities: [
    { label: "Client records", status: "live" },
    { label: "Appointment history", status: "live" },
    { label: "Unified timeline", status: "live" },
    { label: "Saved segments", status: "live" },
    { label: "Lead pipeline", status: "live" },
    { label: "Consent and preferences", status: "live" },
    { label: "CSV import/export", status: "live" },
    { label: "Duplicate merge", status: "live" }
  ],
  adminRoutes: ["/admin/modules/clients", "/admin/clients/[id]"],
  dependencies: ["appointments", "forms"],
  dataModels: ["Client", "ClientNote", "ClientTag", "ClientFile", "ClientSegment", "Booking", "FormSubmission"],
  permissions: ["clients:manage"],
  settingsSections: ["Data"],
  healthChecks: ["client-count"],
  dataScope: {
    ownerKind: "client-link",
    ownerField: "id",
    scopableRoles: [AdminRole.STAFF, AdminRole.PHOTOGRAPHER]
  }
} satisfies ShellModule;
