import { AdminSidebar } from "@/shell/admin-sidebar";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <div className="admin-root" style={themeToCssVars(settings)}>
      <AdminSidebar businessName={settings.businessName} enabledModules={settings.enabledModuleIds} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
