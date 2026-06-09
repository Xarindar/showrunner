import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";
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

export async function getAdminRecipients(groupKey: string, overrideEmail?: string | null) {
  if (overrideEmail?.trim()) {
    return dedupeRecipients([{ email: overrideEmail }]);
  }

  const group = await prisma.emailRecipientGroup.findUnique({
    where: { siteId_key: { siteId: DEFAULT_SITE_ID, key: groupKey } },
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

  const settings = await getSiteSettings();
  return dedupeRecipients([{ email: settings.contactEmail, name: settings.businessName }]);
}
