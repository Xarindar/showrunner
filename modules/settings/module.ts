import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "settings",
  label: "Settings",
  href: "/admin/modules/settings",
  icon: "Settings",
  order: 70,
  navigation: { category: "hidden" },
  description: "Business settings, theme basics, and module toggles.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Single-site business, theme, media, and module toggles are live.",
    primaryGap: "Tenant/site boundary, audit logs, and role-management foundation are in place; policies and full permission coverage remain pending."
  },
  capabilities: [
    { label: "Business identity", status: "live" },
    { label: "Theme and media settings", status: "live" },
    { label: "Module toggles", status: "live" },
    { label: "Tenant/site boundary", status: "foundation" },
    { label: "Policy controls", status: "planned" },
    { label: "Role and audit controls", status: "foundation" }
  ],
  adminRoutes: ["/admin/modules/settings", "/admin/modules/settings/modules"],
  dependencies: ["dashboard"],
  dataModels: ["SiteSettings"],
  permissions: ["settings:update"],
  settingsSections: ["Business", "Module enablement", "Module settings", "Theme", "Media", "Security", "Data"],
  healthChecks: ["module-enabled-state", "required-module-state"]
} satisfies ShellModule;
