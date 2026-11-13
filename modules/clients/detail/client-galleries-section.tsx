import { hasAdminPermission, type AdminSessionUser } from "@/lib/auth";
import type { SiteSettingsWithModules } from "@/lib/site";
import { getClientGalleryWorkspace } from "@/modules/portfolio/client-actions";
import { ClientSessionsTable } from "./client-sessions-table";

export async function ClientGalleriesSection({ clientId, user, settings }: { clientId: string; user: AdminSessionUser; settings: SiteSettingsWithModules }) {
  if (!hasAdminPermission(user, "portfolio:manage") || !settings.enabledModuleIds.includes("portfolio")) return null;
  return <ClientSessionsTable clientId={clientId} initialWorkspace={await getClientGalleryWorkspace(clientId)} canCreateSession={hasAdminPermission(user, "appointments:manage") && settings.enabledModuleIds.includes("appointments")} />;
}
