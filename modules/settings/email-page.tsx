import { Mail } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Notification } from "@/components/ui/notifications";
import { SettingsNav } from "./settings-nav";
import { EmailConnectionPanel } from "./email-connection-panel";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const [params, connection] = await Promise.all([
    searchParams,
    prisma.emailProviderConnection.findUnique({ where: { siteId: settings.siteId }, select: {
      kind: true, fromName: true, fromEmail: true, replyToEmail: true, smtpHost: true, smtpPort: true,
      smtpUser: true, connectionError: true, revision: true
    } })
  ]);
  const savedMessages: Record<string, string> = {
    connected: "Email provider connected. Your test email was sent; check your inbox.",
    test: "Test email sent. Check your inbox.", disconnected: "Email provider disconnected."
  };
  return <div className="stack">
    <header className="page-header"><h1><Mail size={22} aria-hidden="true" /> Email</h1></header>
    <div className="admin-settings-layout"><SettingsNav active="email" /><div className="stack">
      {params.saved && savedMessages[params.saved] ? <Notification tone="success" queryKey="saved">{savedMessages[params.saved]}</Notification> : null}
      {params.error ? <Notification tone="danger" queryKey="error">{params.error}</Notification> : null}
      <EmailConnectionPanel key={connection?.revision || 0} connection={connection} businessName={settings.businessName} contactEmail={settings.contactEmail} />
    </div></div>
  </div>;
}
