import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { portfolioProofingWidget } from "./portfolio-proofing";

export const portfolioWidgets = [portfolioProofingWidget] satisfies DashboardWidgetDefinition[];
