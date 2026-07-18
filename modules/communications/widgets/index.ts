import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { communicationsOutboxWidget } from "./outbox";

export const communicationWidgets = [communicationsOutboxWidget] satisfies DashboardWidgetDefinition[];
