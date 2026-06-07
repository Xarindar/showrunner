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
  enabledByDefault: true
} satisfies ShellModule;
