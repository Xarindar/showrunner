import { hasAdminPermission, type AdminSessionUser } from "@/lib/auth";
import type { SiteSettingsWithModules } from "@/lib/site";
import { getClientGalleryWorkspace } from "@/modules/portfolio/client-actions";
import { ClientGalleriesCard } from "./client-galleries-card";

export async function ClientGalleriesSection({ clientId, user, settings }: { clientId: string; user: AdminSessionUser; settings: SiteSettingsWithModules }) {
  if (!hasAdminPermission(user, "portfolio:manage") || !settings.enabledModuleIds.includes("portfolio")) return null;
  return <ClientGalleriesCard clientId={clientId} initialWorkspace={await getClientGalleryWorkspace(clientId)} />;
}
