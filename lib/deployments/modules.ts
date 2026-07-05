import type { ModuleId } from "@/shell/modules";
import { moduleRegistry } from "@/shell/modules";

const deploymentModuleId = "deployments";

export function getDeployableClientModules() {
  return moduleRegistry.filter((module) => module.status === "active" && !module.required && module.id !== deploymentModuleId);
}

export function normalizeDeploymentModules(value: string[]): ModuleId[] {
  const deployableIds = new Set(getDeployableClientModules().map((module) => module.id));
  const selected = value.filter((moduleId): moduleId is ModuleId => deployableIds.has(moduleId));

  return Array.from(new Set(selected));
}

export function moduleIncludeValue(moduleIds: ModuleId[]) {
  return moduleIds.join(",");
}
