import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "dashboard",
  label: "Dashboard",
  href: "/admin",
  icon: "Gauge",
  order: 10,
  description: "Overview, shortcuts, and upcoming work.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Live business counts with platform readiness and operational warnings.",
    primaryGap: "Role-aware queues and incident history are still pending."
  },
  capabilities: [
    { label: "Business snapshot", status: "live" },
    { label: "Module readiness", status: "live" },
    { label: "Incidents and release notes", status: "planned" }
  ],
  adminRoutes: ["/admin"],
  dependencies: ["settings"],
  dataModels: ["SiteSettings", "Booking", "Client", "Service"],
  permissions: ["dashboard.read"],
  settingsSections: ["Modules", "Operations"],
  healthChecks: ["module-readiness", "email-outbox", "booking-setup"]
} satisfies ShellModule;
