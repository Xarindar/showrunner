import { EmailCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

type ResolveSenderInput = {
  category: EmailCategory;
  senderIdentityId?: string;
  templateSenderIdentityId?: string | null;
};

function parseAddress(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  const match = raw.match(/^(?:"?([^"<]*)"?)?\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || "",
      email: match[2].trim().toLowerCase()
    };
  }

  return { name: "", email: raw.toLowerCase() };
}

export async function resolveSender(input: ResolveSenderInput) {
  const settings = await getSiteSettings();
  const requestedId = input.senderIdentityId || input.templateSenderIdentityId || undefined;
  const sender = requestedId
    ? await prisma.emailSenderIdentity.findFirst({ where: { id: requestedId, siteId: settings.siteId } })
    : await prisma.emailSenderIdentity.findFirst({
        where: { siteId: settings.siteId, isDefault: true },
        orderBy: { createdAt: "asc" }
      });

  if (sender) {
    if (input.category === EmailCategory.MARKETING && !sender.isVerified) {
      throw new Error(`Sender ${sender.fromEmail} is not verified for marketing email.`);
    }

    return {
      senderIdentityId: sender.id,
      fromName: sender.name,
      fromEmail: sender.fromEmail.toLowerCase(),
      replyToEmail: (sender.replyToEmail || sender.fromEmail).toLowerCase()
    };
  }

  const envSender = parseAddress(process.env.SMTP_FROM);
  const fromEmail = envSender?.email || settings.contactEmail;

  if (input.category === EmailCategory.MARKETING && !envSender) {
    throw new Error("Marketing email requires a verified sender identity.");
  }

  return {
    senderIdentityId: undefined,
    fromName: envSender?.name || settings.businessName,
    fromEmail,
    replyToEmail: settings.contactEmail
  };
}
