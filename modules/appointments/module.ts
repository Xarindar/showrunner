import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "appointments",
  label: "Appointments",
  href: "/admin/modules/appointments",
  icon: "CalendarCheck",
  order: 30,
  description: "Booking queue, status changes, and appointment notes.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Live booking queue, status changes, notes, and status emails.",
    primaryGap: "Calendar views, rescheduling, no-show workflows, staff/resource assignment, and audit trail are pending."
  },
  capabilities: [
    { label: "Queue and filters", status: "live" },
    { label: "Status email hooks", status: "live" },
    { label: "Calendar/reschedule UI", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/appointments", "/admin/appointments/[id]"],
  dependencies: ["scheduling", "clients", "communications"],
  dataModels: ["Booking", "Client", "Service", "EmailOutbox"],
  permissions: ["appointments.read", "appointments.write"],
  settingsSections: ["Notifications"],
  healthChecks: ["pending-bookings", "status-email-queue"]
} satisfies ShellModule;
