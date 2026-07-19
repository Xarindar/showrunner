import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { commerceOrdersWidget } from "./commerce-orders";
import { revenueTrendsWidget } from "./revenue-trends";

export const productWidgets = [commerceOrdersWidget, revenueTrendsWidget] satisfies DashboardWidgetDefinition[];
