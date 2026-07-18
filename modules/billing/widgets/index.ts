import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { billingDeskWidget } from "./billing-desk";

export const billingWidgets = [billingDeskWidget] satisfies DashboardWidgetDefinition[];
