import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "automation",
  label: "Automation",
  href: "/admin/modules/automation",
  icon: "Workflow",
  order: 120,
  description: "Trigger rules, run history, and outbound webhook setup.",
  layout: "wide",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Module events match active rules, queue signed webhook deliveries, and keep manual run/delivery records clearly labeled.",
    primaryGap: "Non-webhook action executors, replay/dead-letter UI, and production worker scheduling are still pending."
  },
  capabilities: [
    { label: "Rule registry", status: "foundation" },
    { label: "Event rule matching", status: "live" },
    { label: "Queued webhook dispatch", status: "live" },
    { label: "Manual run records", status: "manual" },
    { label: "Non-webhook executors", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/automation"],
  dependencies: ["communications", "analytics"],
  dataModels: ["Automation", "AutomationRun", "WebhookEndpoint", "WebhookDelivery"],
  permissions: ["automation.read", "automation.write"],
  settingsSections: ["Automation", "Webhooks"],
  healthChecks: ["manual-runs", "webhook-secrets", "event-engine"]
} satisfies ShellModule;
