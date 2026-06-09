import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "settings",
  label: "Settings",
  href: "/admin/modules/settings",
  icon: "Settings",
  order: 70,
  description: "Business settings, theme basics, and module toggles.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Single-site business, theme, media, and module toggles are live.",
    primaryGap: "Tenant/site tables, module installation records, policies, roles, and audit logs are still pending."
  },
  capabilities: [
    { label: "Business identity", status: "live" },
    { label: "Theme and media settings", status: "live" },
    { label: "Module toggles", status: "live" },
    { label: "Tenant and policy settings", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/settings"],
  dependencies: ["dashboard"],
  dataModels: ["SiteSettings"],
  permissions: ["settings.read", "settings.write", "modules.configure"],
  settingsSections: ["Business", "Modules", "Theme", "Media", "Security", "Data"],
  healthChecks: ["module-enabled-state", "required-module-state"]
} satisfies ShellModule;
