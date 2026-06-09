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
    summary: "Reporting screens, goals, manual records, CSV export, server event emission, and UTM/session capture are live.",
    primaryGap: "Client analytics adapters, retention controls, consent UI, and full ecommerce event mappings are still pending."
  },
  capabilities: [
    { label: "Module reporting", status: "foundation" },
    { label: "Manual event records", status: "manual" },
    { label: "Server event instrumentation", status: "live" },
    { label: "CSV export", status: "live" },
    { label: "Consent/adapters", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/analytics"],
  dependencies: ["settings"],
  dataModels: ["AnalyticsEvent", "AnalyticsGoal"],
  permissions: ["analytics.read", "analytics.write"],
  settingsSections: ["Analytics", "Privacy"],
  healthChecks: ["manual-events", "consent-mode"]
} satisfies ShellModule;
