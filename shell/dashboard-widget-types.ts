import type { ReactNode } from "react";
import type { DashboardCardSize } from "@/shell/dashboard-layout";
import type { ModuleId } from "@/shell/modules";

export type DashboardWidgetRenderContext = {
  preview?: boolean;
  settings: Record<string, boolean>;
  siteId: string;
  size: DashboardCardSize;
  timezone: string;
};

export type DashboardWidgetSettingDefinition = {
  defaultValue: boolean;
  description?: string;
  id: string;
  label: string;
};

export type DashboardWidgetDefinition = {
  defaultSize: DashboardCardSize;
  description: string;
  id: string;
  moduleId: ModuleId;
  render: (context: DashboardWidgetRenderContext) => Promise<ReactNode>;
  settings?: DashboardWidgetSettingDefinition[];
  sizes: DashboardCardSize[];
  title: string;
};
