import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "help",
  label: "Help",
  href: "/admin/modules/help",
  icon: "BookOpen",
  order: 80,
  navigation: { category: "more" },
  description: "Plain-language admin operating guide.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Admin guide plus setup/readiness context for enabled modules.",
    primaryGap: "Release notes, client-facing docs, and module-specific troubleshooting are still expanding."
  },
  capabilities: [
    { label: "Admin guide", status: "live" },
    { label: "Setup checklist", status: "live" },
    { label: "Release notes", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/help"],
  dependencies: ["dashboard", "settings"],
  dataModels: ["SiteSettings"],
  settingsSections: ["Support"],
  healthChecks: ["module-readiness"]
} satisfies ShellModule;
