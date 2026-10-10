import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { portfolioGalleriesWidget } from "./portfolio-proofing";

export const portfolioWidgets = [portfolioGalleriesWidget] satisfies DashboardWidgetDefinition[];
