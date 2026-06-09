import type { ModulePageComponent } from "@/shell/module-types";
import { getModule } from "@/shell/modules";

// Server-only loader. Imported solely by app/admin/(protected)/modules/[moduleId]/page.tsx, never by a
// client component, so the lazy page chunks below stay out of the client bundle (RSC boundary).
//
// The page path is derived from the module id by convention: every module owns modules/<id>/page.tsx.
// There is no hand-maintained id->loader list to drift from the registry. The id is validated against
// the registry before import, so the dynamic path cannot be used for traversal or to load arbitrary files.
export async function loadModulePage(moduleId: string) {
  if (!getModule(moduleId)) return null;

  try {
    const page = (await import(`../modules/${moduleId}/page`)) as { default: ModulePageComponent };
    return page.default ?? null;
  } catch {
    return null;
  }
}
