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
import { manifest as usersModule } from "@/modules/users/module";

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
  usersModule,
  helpModule,
  productsModule,
  communicationsModule,
  billingModule,
  automationModule,
  analyticsModule
] as const satisfies readonly ShellModule[];

export type ModuleId = (typeof registeredModules)[number]["id"];

// Build-time module selection. Set NEXT_PUBLIC_SHOWRUNNER_DISABLED_MODULES to a comma-separated list of
// module ids at build to exclude them from a client deployment. Excluded modules drop out of the registry
// entirely: no sidebar entry, no route (getModule returns undefined, then 404), no enablement, so a per-client
// build ships only the modules that client bought. Required platform modules can never be build-excluded.
// NEXT_PUBLIC_ is used so the same value is inlined on both server and client and the two never disagree.
const buildDisabledModuleIds = new Set(
  (process.env.NEXT_PUBLIC_SHOWRUNNER_DISABLED_MODULES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function isBuildEnabled(module: ShellModule) {
  return Boolean(module.required) || !buildDisabledModuleIds.has(module.id);
}

const shellModules: readonly ShellModule[] = registeredModules.filter(isBuildEnabled);

export const moduleRegistry = [...shellModules].sort((left, right) => left.order - right.order);

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
