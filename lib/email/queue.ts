import { EmailCategory, EmailOutboxStatus, EmailSuppressionScope, MessageChannel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { getAdminRecipients } from "./recipients";
import { renderEmailTemplate } from "./render";
import { resolveSender } from "./sender";
import { cleanError, cleanHeaders, normalizeEmail } from "./shared";
import type { QueueAdminEmailInput, QueueEmailInput } from "./types";

type QueueFailureInput = {
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

  return {
    ...cleanHeaders(input.headers),
    "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

async function suppressionReason(email: string, category: EmailCategory) {
  const entry = await prisma.suppressionListEntry.findUnique({ where: { email } });
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
  const settings = await getSiteSettings();
  const reason = input.reason.slice(0, 1000);

  await createOutboxRow({
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

  try {
  const template = await prisma.messageTemplate.findFirst({
    where: {
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
    senderIdentityId: input.senderIdentityId,
    templateSenderIdentityId: template.senderIdentityId
  });
  const rendered = renderEmailTemplate(template, input.tokens);
  const reason = await suppressionReason(recipientEmail, input.category);
  const status = reason ? EmailOutboxStatus.SUPPRESSED : EmailOutboxStatus.QUEUED;

  await createOutboxRow({
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
  const recipients = await getAdminRecipients(input.groupKey, input.overrideEmail);

  if (!recipients.length) {
    await recordQueueFailure({
      templateKey: input.templateKey,
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
