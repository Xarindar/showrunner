import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "scheduling",
  label: "Services",
  href: "/admin/modules/services",
  icon: "CalendarDays",
  order: 50,
  description: "Base services, service builder, packages, and booking catalog organization.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Service administration, packages, catalog metadata, availability, and booking operations are live.",
    primaryGap: "The public booking experience is being rebuilt in the new clients surface."
  },
  capabilities: [
    { label: "Base services", status: "live" },
    { label: "Service builder", status: "live" },
    { label: "Service packages", status: "foundation" },
    { label: "Public booking", status: "planned" },
    { label: "Client self-service", status: "planned" },
    { label: "Cal.com calendar sync", status: "planned" }
  ],
  adminRoutes: [
    "/admin/modules/services",
    "/admin/modules/services/[serviceId]",
    "/admin/modules/scheduling",
    "/api/scheduling/google-calendar/connect/start",
    "/api/scheduling/google-calendar/connect/callback"
  ],
  publicRoutes: ["/api/public/v1/services", "/api/public/v1/availability", "/api/public/v1/bookings"],
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
