import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { automationQueueWidget } from "./automation-queue";

export const automationWidgets = [automationQueueWidget] satisfies DashboardWidgetDefinition[];
