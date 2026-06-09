import type { ReactNode } from "react";
import type { ModuleIconName } from "@/shell/module-icons";

export type { ModuleIconName };
export type ModuleLayout = "standard" | "wide" | "workspace" | "fullscreen";
export type ModuleStatus = "active" | "future";
export type ModuleReadinessLevel = "live" | "partial" | "admin-foundation" | "manual" | "planned";
export type ModuleOperatingMode = "live" | "mixed" | "manual" | "admin-only" | "planned";
export type ModuleCapabilityStatus = "live" | "manual" | "foundation" | "planned" | "missing";
export type ModulePageComponent = (props: { searchParams: Promise<Record<string, string | undefined>> }) => ReactNode | Promise<ReactNode>;

export type ModuleCapability = {
  label: string;
  status: ModuleCapabilityStatus;
  note?: string;
};

export type ModuleReadiness = {
  level: ModuleReadinessLevel;
  mode: ModuleOperatingMode;
  summary: string;
  primaryGap?: string;
};

export type ShellModule = {
  id: string;
  label: string;
  href: string;
  icon: ModuleIconName;
  order: number;
  description: string;
  layout: ModuleLayout;
  status: ModuleStatus;
  enabledByDefault: boolean;
  required?: boolean;
  readiness: ModuleReadiness;
  capabilities?: ModuleCapability[];
  adminRoutes?: string[];
  publicRoutes?: string[];
  widgetRoutes?: string[];
  dependencies?: string[];
  dataModels?: string[];
  permissions?: string[];
  settingsSections?: string[];
  healthChecks?: string[];
};
