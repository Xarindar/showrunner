import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { pendingAppointmentsWidget } from "./pending-appointments";
import { todaysAppointmentsWidget } from "./todays-appointments";

export const appointmentWidgets = [
  todaysAppointmentsWidget,
  pendingAppointmentsWidget
] satisfies DashboardWidgetDefinition[];
