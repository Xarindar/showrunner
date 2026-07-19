import type { ReactNode } from "react";
import type { DashboardCardSize } from "@/shell/dashboard-layout";
import type { ModuleId } from "@/shell/modules";

export type DashboardWidgetRenderContext = {
  preview?: boolean;
  settings: DashboardWidgetSettings;
  siteId: string;
  size: DashboardCardSize;
  timezone: string;
};

export type DashboardWidgetDateRangeValue = {
  end: string;
  start: string;
};

export type DashboardWidgetSettingValue = boolean | DashboardWidgetDateRangeValue;
export type DashboardWidgetSettings = Record<string, DashboardWidgetSettingValue>;

export type DashboardWidgetToggleSettingDefinition = {
  defaultValue: boolean;
  description?: string;
  id: string;
  label: string;
  type?: "toggle";
};

export type DashboardWidgetDateRangeSettingDefinition = {
  defaultValue: DashboardWidgetDateRangeValue;
  description?: string;
  id: string;
  label: string;
  type: "date-range";
};

export type DashboardWidgetSettingDefinition =
  | DashboardWidgetToggleSettingDefinition
  | DashboardWidgetDateRangeSettingDefinition;

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
