import type { ReactNode } from "react";

export type ModuleIconName =
  | "BookOpen"
  | "CalendarCheck"
  | "CalendarDays"
  | "ClipboardList"
  | "Gauge"
  | "Image"
  | "LayoutTemplate"
  | "Mail"
  | "ReceiptText"
  | "Settings"
  | "ShoppingBag"
  | "Star"
  | "Users"
  | "Workflow";
export type ModuleLayout = "standard" | "wide" | "workspace" | "fullscreen";
export type ModuleStatus = "active" | "future";
export type ModulePageComponent = (props: { searchParams: Promise<Record<string, string | undefined>> }) => ReactNode | Promise<ReactNode>;

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
};
