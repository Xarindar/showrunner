import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { recentMediaWidget } from "./recent-media";

export const mediaWidgets = [recentMediaWidget] satisfies DashboardWidgetDefinition[];
