import "server-only";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { getModule } from "@/shell/modules";

export async function requireUploadAdmin() {
  await requireAdmin("uploads:manage");
  const settings = await getSiteSettings();
  if (!getModule("uploads") || !settings.enabledModuleIds.includes("uploads")) throw new Error("Client uploads are not enabled.");
  return settings;
}
