import type { ModulePageComponent } from "@/shell/module-types";
import { getModule } from "@/shell/modules";

const modulePageLoaders = {
  analytics: () => import("@/modules/analytics/page"),
  appointments: () => import("@/modules/appointments/page"),
  automation: () => import("@/modules/automation/page"),
  billing: () => import("@/modules/billing/page"),
  clients: () => import("@/modules/clients/page"),
  communications: () => import("@/modules/communications/page"),
  content: () => import("@/modules/content/page"),
  dashboard: () => import("@/modules/dashboard/page"),
  deployments: () => import("@/modules/deployments/page"),
  forms: () => import("@/modules/forms/page"),
  help: () => import("@/modules/help/page"),
  media: () => import("@/modules/media/page"),
  payments: () => import("@/modules/payments/page"),
  portfolio: () => import("@/modules/portfolio/page"),
  products: () => import("@/modules/products/page"),
  scheduling: () => import("@/modules/scheduling/page"),
  settings: () => import("@/modules/settings/page"),
  testimonials: () => import("@/modules/testimonials/page"),
  users: () => import("@/modules/users/page")
};

type ModulePageId = keyof typeof modulePageLoaders;

function hasModulePage(moduleId: string): moduleId is ModulePageId {
  return moduleId in modulePageLoaders;
}

// Server-only loader. Imported solely by app/admin/(protected)/modules/[moduleId]/page.tsx, never by a
// client component, so the lazy page chunks below stay out of the client bundle (RSC boundary).
export async function loadModulePage(moduleId: string) {
  const selectedModule = getModule(moduleId);
  if (!selectedModule) return null;
  if (!hasModulePage(selectedModule.id)) return null;

  try {
    const page = (await modulePageLoaders[selectedModule.id]()) as { default?: ModulePageComponent };
    return page.default ?? null;
  } catch {
    return null;
  }
}
