import { EmailCategory, EmailOutboxStatus, EmailSuppressionScope, MessageChannel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteSettings, getSiteSettingsForSite } from "@/lib/site";
import { getAdminRecipients } from "./recipients";
import { renderEmailTemplate } from "./render";
import { resolveSender } from "./sender";
import { cleanError, cleanHeaders, normalizeEmail } from "./shared";
import type { QueueAdminEmailInput, QueueEmailInput } from "./types";

type QueueTemplateTestEmailInput = {
  siteId?: string;
  templateId: string;
  recipientEmail: string;
  tokens: Record<string, string | number | Date | null | undefined>;
  idempotencyKey: string;
};

type QueueFailureInput = {
  siteId?: string;
  templateKey: string;
  recipientEmail?: string;
  recipientName?: string;
  category: EmailCategory;
  relatedType?: string;
  relatedId?: string;
  idempotencyKey: string;
  reason: string;
  status?: EmailOutboxStatus;
};

function marketingHeaders(input: QueueEmailInput) {
  if (input.category !== EmailCategory.MARKETING) return cleanHeaders(input.headers);
  if (!input.unsubscribeUrl) throw new Error("Marketing email requires an unsubscribe URL.");
  const unsubscribeUrl = new URL(input.unsubscribeUrl);
  const localhostDevUrl =
    process.env.NODE_ENV !== "production" &&
    unsubscribeUrl.protocol === "http:" &&
    (unsubscribeUrl.hostname === "localhost" || unsubscribeUrl.hostname === "127.0.0.1");

  if (unsubscribeUrl.protocol !== "https:" && !localhostDevUrl) {
    throw new Error("Marketing unsubscribe URL must be absolute HTTPS.");
  }

  return {
    ...cleanHeaders(input.headers),
    "List-Unsubscribe": `<${unsubscribeUrl.toString()}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

async function suppressionReason(email: string, category: EmailCategory, siteId: string) {
  const entry = await prisma.suppressionListEntry.findUnique({ where: { siteId_email: { siteId, email } } });
  if (!entry) return "";

  const blocks =
    entry.scope === EmailSuppressionScope.ALL ||
    (entry.scope === EmailSuppressionScope.MARKETING && category === EmailCategory.MARKETING) ||
    (entry.scope === EmailSuppressionScope.TRANSACTIONAL && category === EmailCategory.TRANSACTIONAL);

  return blocks ? entry.reason || `Suppressed by ${entry.source || "admin"}.` : "";
}

async function createOutboxRow(input: Prisma.EmailOutboxCreateInput) {
  try {
    await prisma.emailOutbox.create({ data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }

    throw error;
  }
}

export async function recordQueueFailure(input: QueueFailureInput) {
  const settings = input.siteId ? await getSiteSettingsForSite(input.siteId) : await getSiteSettings();
  const siteId = settings.siteId;
  const reason = input.reason.slice(0, 1000);

  await createOutboxRow({
    site: { connect: { id: siteId } },
    idempotencyKey: input.idempotencyKey,
    templateKey: input.templateKey,
    recipientEmail: input.recipientEmail ? normalizeEmail(input.recipientEmail) : "",
    recipientName: input.recipientName?.trim() || "",
    fromName: settings.businessName,
    fromEmail: settings.contactEmail,
    replyToEmail: settings.contactEmail,
    subject: `Email not queued: ${input.templateKey}`,
    previewText: reason,
    htmlBody: reason,
    textBody: reason,
    purpose: "queue_failure",
    category: input.category,
    relatedType: input.relatedType || "",
    relatedId: input.relatedId || "",
    status: input.status || EmailOutboxStatus.FAILED,
    lastError: reason
  });
}

export async function queueEmail(input: QueueEmailInput) {
  const recipientEmail = normalizeEmail(input.recipientEmail);
  if (!recipientEmail) {
    await recordQueueFailure({
      ...input,
      recipientEmail: "",
      idempotencyKey: `${input.idempotencyKey}:queue-failure`,
      reason: "Email recipient is required."
    });
    return;
  }

  const settings = input.siteId ? await getSiteSettingsForSite(input.siteId) : await getSiteSettings();
  const siteId = settings.siteId;

  try {
    const template = await prisma.messageTemplate.findFirst({
      where: {
        siteId,
        key: input.templateKey,
        channel: MessageChannel.EMAIL,
        isActive: true
      }
    });

    if (!template) {
      throw new Error(`Email template not found: ${input.templateKey}`);
    }

    const sender = await resolveSender({
      category: input.category,
      siteId,
      senderIdentityId: input.senderIdentityId,
      templateSenderIdentityId: template.senderIdentityId
    });
    const rendered = await renderEmailTemplate(template, input.tokens);
    const reason = await suppressionReason(recipientEmail, input.category, template.siteId);
    const status = reason ? EmailOutboxStatus.SUPPRESSED : EmailOutboxStatus.QUEUED;

    await createOutboxRow({
      site: { connect: { id: template.siteId } },
      idempotencyKey: input.idempotencyKey,
      template: { connect: { id: template.id } },
      templateKey: template.key || input.templateKey,
      senderIdentity: sender.senderIdentityId ? { connect: { id: sender.senderIdentityId } } : undefined,
      campaign: input.campaignId ? { connect: { id: input.campaignId } } : undefined,
      subscriber: input.subscriberId ? { connect: { id: input.subscriberId } } : undefined,
      recipientEmail,
      recipientName: input.recipientName?.trim() || "",
      fromName: sender.fromName,
      fromEmail: sender.fromEmail,
      replyToEmail: sender.replyToEmail,
      subject: rendered.subject,
      previewText: rendered.previewText,
      htmlBody: rendered.htmlBody,
      textBody: rendered.textBody,
      headers: marketingHeaders(input),
      purpose: template.purpose.toLowerCase(),
      category: input.category,
      relatedType: input.relatedType || "",
      relatedId: input.relatedId || "",
      status,
      lastError: reason
    });
  } catch (error) {
    await recordQueueFailure({
      siteId,
      templateKey: input.templateKey,
      recipientEmail,
      recipientName: input.recipientName,
      category: input.category,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      idempotencyKey: `${input.idempotencyKey}:queue-failure`,
      reason: cleanError(error)
    });
  }
}

export async function queueAdminEmail(input: QueueAdminEmailInput) {
  const settings = input.siteId ? await getSiteSettingsForSite(input.siteId) : await getSiteSettings();
  const siteId = settings.siteId;
  const recipients = await getAdminRecipients(input.groupKey, input.overrideEmail, siteId);

  if (!recipients.length) {
    await recordQueueFailure({
      templateKey: input.templateKey,
      siteId,
      category: EmailCategory.ADMIN,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      idempotencyKey: `${input.idempotencyKeyBase}:admin:no-recipient`,
      reason: "no_recipient",
      status: EmailOutboxStatus.SUPPRESSED
    });
    return;
  }

  await Promise.all(
    recipients.map((recipient) =>
      queueEmail({
        templateKey: input.templateKey,
        siteId,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        category: EmailCategory.ADMIN,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        tokens: input.tokens,
        idempotencyKey: `${input.idempotencyKeyBase}:admin:${recipient.email}`
      })
    )
  );
}

export async function queueTemplateTestEmail(input: QueueTemplateTestEmailInput) {
  const recipientEmail = normalizeEmail(input.recipientEmail);
  if (!recipientEmail) throw new Error("Email recipient is required.");
  const settings = input.siteId ? await getSiteSettingsForSite(input.siteId) : await getSiteSettings();
  const siteId = settings.siteId;

  const template = await prisma.messageTemplate.findFirst({
    where: { id: input.templateId, siteId }
  });

  if (!template || template.channel !== MessageChannel.EMAIL) {
    throw new Error("Email template not found.");
  }

  const sender = await resolveSender({
    category: EmailCategory.ADMIN,
    siteId,
    senderIdentityId: undefined,
    templateSenderIdentityId: template.senderIdentityId
  });
  const rendered = await renderEmailTemplate(template, input.tokens);
  const reason = await suppressionReason(recipientEmail, EmailCategory.ADMIN, siteId);
  const status = reason ? EmailOutboxStatus.SUPPRESSED : EmailOutboxStatus.QUEUED;

  await createOutboxRow({
    site: { connect: { id: template.siteId } },
    idempotencyKey: input.idempotencyKey,
    template: { connect: { id: template.id } },
    templateKey: template.key || "",
    senderIdentity: sender.senderIdentityId ? { connect: { id: sender.senderIdentityId } } : undefined,
    recipientEmail,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyToEmail: sender.replyToEmail,
    subject: rendered.subject,
    previewText: rendered.previewText,
    htmlBody: rendered.htmlBody,
    textBody: rendered.textBody,
    purpose: "template_test",
    category: EmailCategory.ADMIN,
    relatedType: "messageTemplate",
    relatedId: template.id,
    status,
    lastError: reason
  });
}
