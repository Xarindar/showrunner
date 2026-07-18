import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { paymentHealthWidget } from "./payment-health";

export const paymentWidgets = [paymentHealthWidget] satisfies DashboardWidgetDefinition[];
