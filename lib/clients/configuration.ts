import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeClientStatusSettings } from "./status-settings";

export async function getClientStatusSettings(siteId: string) {
  const setting = await prisma.moduleSetting.findUnique({ where: { siteId_moduleId_key: { siteId, moduleId: "clients", key: "statuses" } } });
  return normalizeClientStatusSettings(setting?.value);
}
