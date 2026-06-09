import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "scheduling",
  label: "Scheduling",
  href: "/admin/modules/scheduling",
  icon: "CalendarDays",
  order: 50,
  description: "Services, availability, blockouts, and booking rules.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Native public booking is live for single-staff service availability.",
    primaryGap: "External calendars, staff/resources, capacity, reschedule/cancel links, paid booking, and reminders are pending."
  },
  capabilities: [
    { label: "Native availability", status: "live" },
    { label: "Public booking", status: "live" },
    { label: "External calendar adapter", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/scheduling"],
  publicRoutes: ["/book", "/book/[serviceSlug]", "/api/availability"],
  widgetRoutes: [],
  dependencies: ["appointments", "clients", "communications"],
  dataModels: ["Service", "AvailabilityRule", "BlockedTime", "Booking"],
  permissions: ["scheduling.read", "scheduling.write"],
  settingsSections: ["Scheduling", "Notifications"],
  healthChecks: ["active-services", "availability-rules", "booking-window"]
} satisfies ShellModule;
