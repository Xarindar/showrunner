import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { quickUploadWidget } from "./quick-upload";
import { recentMediaWidget } from "./recent-media";

export const mediaWidgets = [recentMediaWidget, quickUploadWidget] satisfies DashboardWidgetDefinition[];
