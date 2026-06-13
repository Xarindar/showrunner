import { prisma } from "@/lib/prisma";
import { getSiteSettings, getSiteSettingsForSite } from "@/lib/site";
import { normalizeEmail } from "./shared";

export type EmailRecipientAddress = {
  email: string;
  name?: string;
};

function dedupeRecipients(recipients: EmailRecipientAddress[]) {
  const seen = new Set<string>();
  const output: EmailRecipientAddress[] = [];

  for (const recipient of recipients) {
    const email = normalizeEmail(recipient.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    output.push({ email, name: recipient.name?.trim() || "" });
  }

  return output;
}

export async function getAdminRecipients(groupKey: string, overrideEmail?: string | null, siteId?: string) {
  if (overrideEmail?.trim()) {
    return dedupeRecipients([{ email: overrideEmail }]);
  }

  const settings = siteId ? await getSiteSettingsForSite(siteId) : await getSiteSettings();
  const currentSiteId = settings.siteId;
  const group = await prisma.emailRecipientGroup.findUnique({
    where: { siteId_key: { siteId: currentSiteId, key: groupKey } },
    include: {
      recipients: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  const groupRecipients = group?.isActive
    ? group.recipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name
      }))
    : [];

  if (groupRecipients.length) return dedupeRecipients(groupRecipients);
  if (group && !group.fallbackToContactEmail) return [];

  return dedupeRecipients([{ email: settings.contactEmail, name: settings.businessName }]);
}
