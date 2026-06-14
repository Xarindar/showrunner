import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "users",
  label: "Users",
  href: "/admin/modules/users",
  icon: "Users",
  order: 72,
  description: "Admin users, roles, and access control.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "partial",
    mode: "admin-only",
    summary: "Owner-only admin user creation and role assignment are live.",
    primaryGap: "Record ownership rules and complete per-action permission coverage remain in progress."
  },
  capabilities: [
    { label: "Admin user creation", status: "live" },
    { label: "Role assignment", status: "live" },
    { label: "Last-owner protection", status: "live" },
    { label: "Record ownership rules", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/users"],
  dependencies: ["settings"],
  dataModels: ["AdminUser", "AdminRole", "AuditLog"],
  permissions: ["users:manage"],
  settingsSections: ["Security", "Roles"],
  healthChecks: ["owner-account"]
} satisfies ShellModule;
