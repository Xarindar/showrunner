import { AdminSidebar } from "@/shell/admin-sidebar";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { mediaAssetDisplayUrl, mediaAssetIdFromUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { MediaVariantType } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuthenticatedAdmin();
  const settings = await getSiteSettings();
  const logoAssetId = mediaAssetIdFromUrl(settings.logoImageUrl);
  const logoAsset = logoAssetId
    ? await prisma.mediaAsset.findFirst({
        where: { id: logoAssetId, siteId: settings.siteId, deletedAt: null, isPrivate: false },
        select: { driver: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
      })
    : null;
  const logoUrl = logoAsset ? mediaAssetDisplayUrl(logoAsset, MediaVariantType.FULL) : settings.logoImageUrl;

  return (
    <div className="admin-root">
      <AdminSidebar businessName={settings.businessName} logoUrl={logoUrl} enabledModules={settings.enabledModuleIds} userEmail={user.email} userRole={user.role} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
