import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "deployments",
  label: "Client Deployments",
  href: "/admin/modules/deployments",
  icon: "Rocket",
  order: 74,
  navigation: { category: "more" },
  description: "Internal deployment builder for client GitHub repo handoffs.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "admin-foundation",
    mode: "admin-only",
    summary: "Owner-only invite creation, module selection, expiring links, and GitHub OAuth handoff are wired.",
    primaryGap: "Production GitHub OAuth credentials and template repository access must be configured before live handoffs."
  },
  capabilities: [
    { label: "Module selection", status: "live" },
    { label: "Expiring invite links", status: "live" },
    { label: "GitHub OAuth handoff", status: "foundation" },
    { label: "Template repo generation", status: "foundation" },
    { label: "Hosting provider deployment", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/deployments"],
  dependencies: ["dashboard", "settings", "users"],
  dataModels: ["ClientDeployment", "AuditLog"],
  permissions: ["deployments:manage"],
  settingsSections: ["Internal deployments"],
  healthChecks: ["github-oauth-config", "template-repository"]
} satisfies ShellModule;
