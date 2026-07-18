import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { analyticsActivityWidget } from "./analytics-activity";

export const analyticsWidgets = [analyticsActivityWidget] satisfies DashboardWidgetDefinition[];
