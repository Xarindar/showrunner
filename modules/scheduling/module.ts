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
    summary: "Native public booking is live with multi-staff service assignment, resource requirements, scoped availability, reminders, ICS feeds, Google free/busy checks, and staff/resource-aware conflict checks.",
    primaryGap: "Cal.com calendar sync, capacity groups, reschedule/cancel links, and paid booking are pending."
  },
  capabilities: [
    { label: "Native availability", status: "live" },
    { label: "Public booking", status: "live" },
    { label: "Multi-staff scheduling", status: "live" },
    { label: "Bookable resources", status: "live" },
    { label: "Booking reminders", status: "live" },
    { label: "ICS calendar feeds", status: "live" },
    { label: "Google Calendar free/busy", status: "live" },
    { label: "Cal.com calendar sync", status: "planned" }
  ],
  adminRoutes: [
    "/admin/modules/scheduling",
    "/api/scheduling/google-calendar/connect/start",
    "/api/scheduling/google-calendar/connect/callback"
  ],
  publicRoutes: [
    "/book",
    "/book/[serviceSlug]",
    "/api/availability",
    "/api/calendar/feed.ics",
    "/api/calendar/booking.ics"
  ],
  widgetRoutes: [],
  dependencies: ["appointments", "clients", "communications"],
  dataModels: [
    "Service",
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
  settingsSections: ["Scheduling", "Notifications"],
  healthChecks: ["active-services", "availability-rules", "booking-window", "booking-reminder-worker"]
} satisfies ShellModule;
