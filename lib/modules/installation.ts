import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultEnabledModules, moduleRegistry, normalizeModules, type ModuleId } from "@/shell/modules";

function installationRows(enabledIds: ModuleId[], siteId: string) {
  const enabled = new Set(normalizeModules(enabledIds));
  return moduleRegistry.map(({ id }) => ({ siteId, moduleId: id, installed: true, enabled: enabled.has(id) }));
}

// Settings and module choices must commit together; use the caller's transaction.
export async function setModuleEnablement(tx: Prisma.TransactionClient, enabledIds: ModuleId[], siteId: string): Promise<void> {
  const rows = installationRows(enabledIds, siteId);
  await tx.moduleInstallation.createMany({ data: rows, skipDuplicates: true });
  await tx.moduleInstallation.updateMany({
    where: { siteId, moduleId: { in: rows.filter((row) => !row.enabled).map((row) => row.moduleId) } },
    data: { enabled: false }
  });
  await tx.moduleInstallation.updateMany({
    where: { siteId, moduleId: { in: rows.filter((row) => row.enabled).map((row) => row.moduleId) } },
    data: { enabled: true }
  });
}

export async function resolveEnabledModuleIds(initialEnabled: ModuleId[], siteId: string): Promise<ModuleId[]> {
  const query = { where: { siteId }, select: { enabled: true, moduleId: true } };
  let rows = await prisma.moduleInstallation.findMany(query);
  const installedIds = new Set(rows.map((row) => row.moduleId));
  const missing = installationRows(rows.length ? defaultEnabledModules : initialEnabled, siteId)
    .filter((row) => !installedIds.has(row.moduleId));

  if (missing.length) {
    // Import initial site choices once; existing rows remain authoritative, even during concurrent setup.
    await prisma.moduleInstallation.createMany({ data: missing, skipDuplicates: true });
    rows = await prisma.moduleInstallation.findMany(query);
  }

  return normalizeModules(rows.filter((row) => row.enabled).map((row) => row.moduleId));
}
