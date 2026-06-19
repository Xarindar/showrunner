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
    level: "partial",
    mode: "mixed",
    summary: "Guided setup checklist, live business counts, and quick access to every enabled module.",
    primaryGap: "User-pinnable module cards and role-aware queues are still pending."
  },
  capabilities: [
    { label: "Setup checklist", status: "live" },
    { label: "Business snapshot", status: "live" },
    { label: "Quick module access", status: "live" },
    { label: "Pinnable widget cards", status: "planned" }
  ],
  adminRoutes: ["/admin"],
  dependencies: ["settings"],
  dataModels: ["SiteSettings", "Booking", "Client", "Service"],
  settingsSections: ["Modules", "Operations"],
  healthChecks: ["module-readiness", "email-outbox", "booking-setup"]
} satisfies ShellModule;
