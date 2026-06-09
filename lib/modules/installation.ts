import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
import { moduleRegistry, normalizeModules, requiredModuleIds, type ModuleId } from "@/shell/modules";

export type ModuleInstallationState = {
  moduleId: ModuleId;
  installed: boolean;
  enabled: boolean;
  visibleToPublic: boolean;
  beta: boolean;
};

function enabledSeedSet(seedEnabled: ModuleId[]) {
  return new Set<string>([...requiredModuleIds, ...seedEnabled]);
}

// Ensure one ModuleInstallation row per registered module. `enabled` is seeded from the provided set
// only when a row is first created (create-side); existing rows are left untouched so an admin's
// later choices are never overwritten by a sync.
export async function ensureModuleInstallations(seedEnabled: ModuleId[], siteId = DEFAULT_SITE_ID): Promise<void> {
  const seed = enabledSeedSet(seedEnabled);
  await prisma.$transaction(
    moduleRegistry.map((module) =>
      prisma.moduleInstallation.upsert({
        where: { siteId_moduleId: { siteId, moduleId: module.id } },
        update: { installed: true },
        create: { siteId, moduleId: module.id, installed: true, enabled: seed.has(module.id) }
      })
    )
  );
}

// Persist the enabled set across installation rows (used by the settings form). Required modules are
// always forced enabled. Upserts so a freshly added module is recorded even if never synced before.
export async function setModuleEnablement(enabledIds: ModuleId[], siteId = DEFAULT_SITE_ID): Promise<void> {
  const enabled = enabledSeedSet(enabledIds);
  await prisma.$transaction(
    moduleRegistry.map((module) =>
      prisma.moduleInstallation.upsert({
        where: { siteId_moduleId: { siteId, moduleId: module.id } },
        update: { enabled: enabled.has(module.id) },
        create: { siteId, moduleId: module.id, installed: true, enabled: enabled.has(module.id) }
      })
    )
  );
}

// Resolve the enabled module ids from installation records, falling back to the legacy
// SiteSettings.enabledModules set when the table is unavailable (migration not applied) or not yet
// seeded. The result is always normalized: required modules forced in, build-excluded modules filtered
// out (normalizeModules only keeps ids known to the current build's registry).
export async function resolveEnabledModuleIds(legacyEnabled: ModuleId[], siteId = DEFAULT_SITE_ID): Promise<ModuleId[]> {
  let rows: { moduleId: string }[];

  try {
    rows = await prisma.moduleInstallation.findMany({ where: { siteId, enabled: true }, select: { moduleId: true } });
  } catch {
    return normalizeModules(legacyEnabled);
  }

  if (rows.length === 0) {
    // First run: seed installation rows from the legacy/default set, then use that set this pass.
    await ensureModuleInstallations(legacyEnabled, siteId).catch(() => {});
    return normalizeModules(legacyEnabled);
  }

  return normalizeModules(rows.map((row) => row.moduleId));
}
