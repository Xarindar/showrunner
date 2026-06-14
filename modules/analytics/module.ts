import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "analytics",
  label: "Analytics",
  href: "/admin/modules/analytics",
  icon: "Gauge",
  order: 130,
  description: "Module metrics, source attribution, standard events, and conversion goals.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Reporting screens, goals, CSV export, server event emission, client adapters, retention controls, and ecommerce mappings are live.",
    primaryGap: "Consent UI and any future server-side ad-network conversion hooks remain pending."
  },
  capabilities: [
    { label: "Module reporting", status: "foundation" },
    { label: "Manual event records", status: "manual" },
    { label: "Server event instrumentation", status: "live" },
    { label: "CSV export", status: "live" },
    { label: "Client adapters and retention", status: "live" }
  ],
  adminRoutes: ["/admin/modules/analytics"],
  dependencies: ["settings"],
  dataModels: ["AnalyticsEvent", "AnalyticsGoal"],
  permissions: ["analytics:read", "analytics:manage"],
  settingsSections: ["Analytics", "Privacy"],
  healthChecks: ["manual-events", "consent-mode"]
} satisfies ShellModule;
