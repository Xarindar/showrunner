import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { formSubmissionsWidget } from "./form-submissions";

export const formWidgets = [formSubmissionsWidget] satisfies DashboardWidgetDefinition[];
