import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "automation",
  label: "Automation",
  href: "/admin/modules/automation",
  icon: "Workflow",
  order: 120,
  description: "Trigger rules, live action executors, run history, tasks, and outbound webhook setup.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Module events match active rules, queue signed webhook deliveries, execute non-webhook actions, and preserve replayable run records.",
    primaryGap: "Production scheduler provisioning, Zapier/Make connector support, and richer condition logic are still pending."
  },
  capabilities: [
    { label: "Rule registry", status: "foundation" },
    { label: "Event rule matching", status: "live" },
    { label: "Queued webhook dispatch", status: "live" },
    { label: "Non-webhook executors", status: "live" },
    { label: "Replay and dead letters", status: "live" },
    { label: "Manual run records", status: "manual" }
  ],
  adminRoutes: ["/admin/modules/automation"],
  dependencies: ["communications", "analytics"],
  dataModels: ["Automation", "AutomationRun", "AutomationTask", "WebhookEndpoint", "WebhookDelivery"],
  permissions: ["automation:manage"],
  settingsSections: ["Automation", "Webhooks"],
  healthChecks: ["manual-runs", "webhook-secrets", "event-engine"]
} satisfies ShellModule;
