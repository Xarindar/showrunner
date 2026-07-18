import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { recentClientsWidget } from "./recent-clients";

export const clientWidgets = [recentClientsWidget] satisfies DashboardWidgetDefinition[];
