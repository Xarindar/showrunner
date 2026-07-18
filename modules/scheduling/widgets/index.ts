import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { servicesSetupWidget } from "./services-setup";

export const schedulingWidgets = [servicesSetupWidget] satisfies DashboardWidgetDefinition[];
