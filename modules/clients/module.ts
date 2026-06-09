import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "clients",
  label: "Clients",
  href: "/admin/modules/clients",
  icon: "Users",
  order: 40,
  description: "Client profiles, private notes, and appointment history.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Client records, notes, and linked bookings/forms/testimonials are live.",
    primaryGap: "Unified timeline, tasks, consent records, dedupe, import/export, and portal access are pending."
  },
  capabilities: [
    { label: "Client records", status: "live" },
    { label: "Appointment history", status: "live" },
    { label: "Timeline and consent", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/clients", "/admin/clients/[id]"],
  dependencies: ["appointments", "forms"],
  dataModels: ["Client", "ClientNote", "Booking", "FormSubmission"],
  permissions: ["clients.read", "clients.write"],
  settingsSections: ["Data"],
  healthChecks: ["client-count"]
} satisfies ShellModule;
