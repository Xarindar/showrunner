import { moduleIcons } from "@/shell/module-icons";
import type { ShellModule } from "@/shell/module-types";
import { manifest as appointmentsModule } from "@/modules/appointments/module";
import { manifest as analyticsModule } from "@/modules/analytics/module";
import { manifest as automationModule } from "@/modules/automation/module";
import { manifest as billingModule } from "@/modules/billing/module";
import { manifest as clientsModule } from "@/modules/clients/module";
import { manifest as communicationsModule } from "@/modules/communications/module";
import { manifest as contentModule } from "@/modules/content/module";
import { manifest as dashboardModule } from "@/modules/dashboard/module";
import { manifest as formsModule } from "@/modules/forms/module";
import { manifest as helpModule } from "@/modules/help/module";
import { manifest as mediaModule } from "@/modules/media/module";
import { manifest as portfolioModule } from "@/modules/portfolio/module";
import { manifest as productsModule } from "@/modules/products/module";
import { manifest as schedulingModule } from "@/modules/scheduling/module";
import { manifest as settingsModule } from "@/modules/settings/module";
import { manifest as testimonialsModule } from "@/modules/testimonials/module";

export { moduleIcons };

const registeredModules = [
  dashboardModule,
  contentModule,
  appointmentsModule,
  clientsModule,
  schedulingModule,
  mediaModule,
  portfolioModule,
  formsModule,
  testimonialsModule,
  settingsModule,
  helpModule,
  productsModule,
  communicationsModule,
  billingModule,
  automationModule,
  analyticsModule
] as const satisfies readonly ShellModule[];

const shellModules: readonly ShellModule[] = registeredModules;

export const moduleRegistry = [...shellModules].sort((left, right) => left.order - right.order);

export type ModuleId = (typeof registeredModules)[number]["id"];

export const requiredModuleIds: ModuleId[] = shellModules
  .filter((item) => item.required && item.status === "active")
  .map((item) => item.id as ModuleId);

export const defaultEnabledModules: ModuleId[] = shellModules
  .filter((item) => (item.enabledByDefault || item.required) && item.status === "active")
  .map((item) => item.id as ModuleId);

export function getModule(moduleId: string) {
  return shellModules.find((item) => item.id === moduleId);
}

export function isRequiredModule(moduleId: string) {
  return requiredModuleIds.includes(moduleId as ModuleId);
}

export function normalizeModules(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return defaultEnabledModules;

  const knownIds = new Set(shellModules.filter((item) => item.status === "active").map((item) => item.id));
  const modules = value.filter((item): item is ModuleId => typeof item === "string" && knownIds.has(item as ModuleId));
  const selectedModules = modules.length ? modules : defaultEnabledModules;

  return Array.from(new Set([...requiredModuleIds, ...selectedModules]));
}
