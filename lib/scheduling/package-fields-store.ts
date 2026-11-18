import "server-only";
import { prisma } from "@/lib/prisma";
import { readPackageFields } from "./package-fields";

export async function getPackageFields(siteId: string) {
  const installation = await prisma.moduleInstallation.findUnique({
    where: { siteId_moduleId: { siteId, moduleId: "scheduling" } },
    select: { settings: true }
  });
  return readPackageFields(installation?.settings);
}
