import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "dashboard",
  label: "Dashboard",
  href: "/admin",
  icon: "Gauge",
  order: 10,
  description: "Setup checklist, business snapshot, and quick access to your modules.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  required: true,
  readiness: {
    level: "live",
    mode: "live",
    summary: "Guided setup checklist plus user-configurable module cards with saved sizing.",
    primaryGap: "Role-aware queue summaries can be expanded as module ownership rules mature."
  },
  capabilities: [
    { label: "Setup checklist", status: "live" },
    { label: "Module card catalog", status: "live" },
    { label: "Per-user dashboard layout", status: "live" },
    { label: "Resizable widget cards", status: "live" }
  ],
  adminRoutes: ["/admin"],
  dependencies: ["settings"],
  dataModels: ["SiteSettings", "ModuleInstallation", "ModuleSetting", "Booking", "Client", "Service"],
  settingsSections: ["Modules", "Operations"],
  healthChecks: ["module-readiness", "email-outbox", "booking-setup"]
} satisfies ShellModule;
