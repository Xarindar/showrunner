import type { ReactNode } from "react";
import type { DashboardCardSize } from "@/shell/dashboard-layout";
import type { ModuleId } from "@/shell/modules";

export type DashboardWidgetRenderContext = {
  siteId: string;
  size: DashboardCardSize;
  timezone: string;
};

export type DashboardWidgetDefinition = {
  defaultSize: DashboardCardSize;
  description: string;
  id: string;
  moduleId: ModuleId;
  render: (context: DashboardWidgetRenderContext) => Promise<ReactNode>;
  sizes: DashboardCardSize[];
  title: string;
};
