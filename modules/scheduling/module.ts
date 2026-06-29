import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "scheduling",
  label: "Services",
  href: "/admin/modules/services",
  icon: "CalendarDays",
  order: 50,
  description: "Base services, service builder, packages, and public booking catalog organization.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Native public booking is live with base services, service packages, catalog metadata, client self-service, and booking-facing service copy.",
    primaryGap: "Cal.com calendar sync, capacity groups, and paid booking are pending."
  },
  capabilities: [
    { label: "Base services", status: "live" },
    { label: "Service builder", status: "live" },
    { label: "Service packages", status: "foundation" },
    { label: "Public booking", status: "live" },
    { label: "Client self-service", status: "live" },
    { label: "Cal.com calendar sync", status: "planned" }
  ],
  adminRoutes: [
    "/admin/modules/services",
    "/admin/modules/services/[serviceId]",
    "/admin/modules/scheduling",
    "/api/scheduling/google-calendar/connect/start",
    "/api/scheduling/google-calendar/connect/callback"
  ],
  publicRoutes: [
    "/book",
    "/book/[serviceSlug]",
    "/bookings/[id]",
    "/api/availability",
    "/bookings/[id]/availability",
    "/api/public/v1/services",
    "/api/public/v1/availability",
    "/api/public/v1/bookings",
    "/api/calendar/feed.ics",
    "/api/calendar/booking.ics"
  ],
  widgetRoutes: ["/embed/v1/booking.js", "/embed/v1/booking"],
  dependencies: ["appointments", "clients", "communications"],
  dataModels: [
    "Service",
    "ServicePackage",
    "ServicePackageItem",
    "StaffMember",
    "Resource",
    "ServiceStaff",
    "ServiceResource",
    "AvailabilityRule",
    "BlockedTime",
    "Booking",
    "BookingResource",
    "BookingReminder",
    "SchedulingCalendarConnection",
    "SchedulingSettings"
  ],
  permissions: ["scheduling:manage"],
  settingsSections: ["Services"],
  healthChecks: ["active-services", "availability-rules", "booking-window", "booking-reminder-worker"]
} satisfies ShellModule;
