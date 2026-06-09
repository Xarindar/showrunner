import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "communications",
  label: "Communications",
  href: "/admin/modules/communications",
  icon: "Mail",
  order: 100,
  description: "Message templates, delivery logs, and suppression controls.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Transactional outbox is live; template catalog and manual notes are admin-managed.",
    primaryGap: "Template editor, token preview/test send, campaign scheduling, SMS, and delivery-health dashboards are pending."
  },
  capabilities: [
    { label: "Transactional outbox", status: "live" },
    { label: "Manual template catalog", status: "manual" },
    { label: "Campaign send UI", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/communications"],
  publicRoutes: ["/unsubscribe/[token]", "/api/newsletter/subscribe"],
  dependencies: ["settings", "clients"],
  dataModels: ["MessageTemplate", "MessageLog", "EmailOutbox", "EmailSenderIdentity", "SuppressionListEntry"],
  permissions: ["communications.read", "communications.write"],
  settingsSections: ["Email", "Integrations"],
  healthChecks: ["smtp-env", "email-worker", "failed-outbox", "sender-verification"]
} satisfies ShellModule;
