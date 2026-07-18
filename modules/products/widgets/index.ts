import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { commerceOrdersWidget } from "./commerce-orders";

export const productWidgets = [commerceOrdersWidget] satisfies DashboardWidgetDefinition[];
