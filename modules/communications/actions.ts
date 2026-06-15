"use server";

import {
  EmailOutboxStatus,
  EmailSendingDomainStatus,
  EmailSuppressionScope,
  MessageChannel,
  MessageLogStatus,
  MessageTemplatePurpose,
  Prisma
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { csvList, optionalEmailStored, optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { extractEmailBuilderTokens, normalizeEmailBuilderDocument } from "@/lib/email-builder/document";
import { renderEmailBuilderHtml } from "@/lib/email-builder/render";
import { queueTemplateTestEmail } from "@/lib/email";
import { extractEmailTemplateTokens, hasBuilderJson } from "@/lib/email/render";
import { stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

const messageTemplateSchema = z
  .object({
    name: requiredText,
    purpose: z.enum(MessageTemplatePurpose).catch(MessageTemplatePurpose.GENERAL),
    channel: z.enum(MessageChannel).catch(MessageChannel.EMAIL),
    subject: optionalStoredText,
    body: requiredText,
    tokens: optionalStoredText,
    isActive: z.literal("on").optional()
  })
  .transform((value) => ({
    ...value,
    tokens: csvList(value.tokens),
    isActive: value.isActive === "on"
  }));

const templateStatusSchema = z
  .object({
    id: requiredText,
    isActive: z.enum(["true", "false"])
  })
  .transform((value) => ({
    id: value.id,
    isActive: value.isActive === "true"
  }));

const builderTemplateSettingsSchema = z.object({
  id: requiredText,
  subject: requiredText,
  previewText: optionalStoredText,
  textBody: requiredText,
  builderJson: requiredText,
  senderIdentityId: optionalStoredText
});

const messageLogSchema = z
  .object({
    templateId: optionalStoredText,
    channel: z.enum(MessageChannel).catch(MessageChannel.EMAIL),
    purpose: optionalStoredText,
    recipientEmail: optionalEmailStored,
    recipientPhone: optionalStoredText,
    subject: optionalStoredText,
    bodyPreview: optionalStoredText,
    status: z.enum(MessageLogStatus).catch(MessageLogStatus.SENT),
    errorMessage: optionalStoredText,
    relatedType: optionalStoredText,
    relatedId: optionalStoredText
  })
  .refine((value) => value.recipientEmail || value.recipientPhone, {
    message: "Add an email address or phone number.",
    path: ["recipientEmail"]
  });

const suppressionSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  reason: optionalStoredText,
  source: optionalStoredText,
  scope: z.enum(EmailSuppressionScope).catch(EmailSuppressionScope.MARKETING)
});

const suppressionDeleteSchema = z.object({
  id: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm removal before unsuppressing this email." })
});

const templateTestSendSchema = z.object({
  templateId: requiredText,
  recipientEmail: z.email().transform((value) => value.trim().toLowerCase()),
  tokensJson: optionalStoredText
});

const outboxResendSchema = z.object({
  id: requiredText
});

const cloneTemplateSchema = z.object({
  sourceTemplateId: requiredText,
  name: optionalStoredText
});

const restoreTemplateVersionSchema = z.object({
  templateId: requiredText,
  versionId: requiredText,
  confirmRestore: z.literal("on", { error: "Confirm restore before replacing this template." })
});

function refreshCommunications() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/communications");
}

function communicationsError(message: string): never {
  redirect(`/admin/modules/communications?error=${encodeURIComponent(message)}`);
}

function parseTokenJson(value: string) {
  if (!value.trim()) return {};

  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Token JSON must be an object.");
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string | number | null] => {
      const value = entry[1];
      return (
        typeof entry[0] === "string" &&
        (typeof value === "string" || typeof value === "number" || value === null)
      );
    })
  );
}

async function requireVerifiedSender(senderIdentityId: string, siteId: string) {
  if (!senderIdentityId) return;
  const sender = await prisma.emailSenderIdentity.findFirst({
    where: { id: senderIdentityId, siteId },
    select: {
      id: true,
      isVerified: true,
      sendingDomain: {
        select: { status: true }
      }
    }
  });

  if (!sender) {
    communicationsError("Sender identity not found.");
  }

  if (!sender.isVerified || (sender.sendingDomain && sender.sendingDomain.status !== EmailSendingDomainStatus.VERIFIED)) {
    communicationsError("Choose a verified sender identity before assigning it to a template.");
  }
}

function templateAllowedTokens(template: { optionalTokens: unknown; requiredTokens: unknown; tokens: unknown }) {
  const requiredTokens = stringArrayFromUnknown(template.requiredTokens);
  const allowedTokens = new Set([
    ...stringArrayFromUnknown(template.tokens),
    ...requiredTokens,
    ...stringArrayFromUnknown(template.optionalTokens)
  ]);

  return { allowedTokens, requiredTokens };
}

function assertTemplateTokens(input: {
  allowedTokens: Set<string>;
  requiredTokens: string[];
  usedTokens: Set<string>;
}) {
  const unsupportedTokens = Array.from(input.usedTokens).filter((token) => !input.allowedTokens.has(token));

  if (unsupportedTokens.length) {
    communicationsError(`Unsupported token${unsupportedTokens.length === 1 ? "" : "s"}: ${unsupportedTokens.join(", ")}.`);
  }

  const missingRequiredTokens = input.requiredTokens.filter((token) => !input.usedTokens.has(token));
  if (missingRequiredTokens.length) {
    communicationsError(
      `Required token${missingRequiredTokens.length === 1 ? "" : "s"} missing from the template: ${missingRequiredTokens.join(", ")}.`
    );
  }
}

function jsonInput(value: Prisma.JsonValue) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

async function outboxSuppressionReason(input: { category: string; email: string; siteId: string }) {
  const entry = await prisma.suppressionListEntry.findUnique({ where: { siteId_email: { siteId: input.siteId, email: input.email } } });
  if (!entry) return "";

  const blocks =
    entry.scope === EmailSuppressionScope.ALL ||
    (entry.scope === EmailSuppressionScope.MARKETING && input.category === "MARKETING") ||
    (entry.scope === EmailSuppressionScope.TRANSACTIONAL && input.category === "TRANSACTIONAL");

  return blocks ? entry.reason || `Suppressed by ${entry.source || "admin"}.` : "";
}

type MessageTemplateSnapshot = {
  id: string;
  siteId: string;
  version: number;
  name: string;
  subject: string;
  previewText: string;
  body: string;
  htmlBody: string;
  textBody: string;
  builderJson: Prisma.JsonValue;
  builderRenderer: string;
  tokens: Prisma.JsonValue;
  requiredTokens: Prisma.JsonValue;
  optionalTokens: Prisma.JsonValue;
  senderIdentityId: string | null;
  isMarketing: boolean;
  isActive: boolean;
};

async function snapshotMessageTemplate(template: MessageTemplateSnapshot, note: string) {
  await prisma.messageTemplateVersion.upsert({
    where: {
      templateId_version: {
        templateId: template.id,
        version: template.version
      }
    },
    update: {},
    create: {
      siteId: template.siteId,
      templateId: template.id,
      version: template.version,
      name: template.name,
      subject: template.subject,
      previewText: template.previewText,
      body: template.body,
      htmlBody: template.htmlBody,
      textBody: template.textBody,
      builderJson: jsonInput(template.builderJson),
      builderRenderer: template.builderRenderer,
      tokens: jsonInput(template.tokens),
      requiredTokens: jsonInput(template.requiredTokens),
      optionalTokens: jsonInput(template.optionalTokens),
      senderIdentityId: template.senderIdentityId,
      isMarketing: template.isMarketing,
      isActive: template.isActive,
      note
    }
  });
}

export async function createMessageTemplateAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(messageTemplateSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  await prisma.messageTemplate.create({
    data: {
      siteId: settings.siteId,
      name: input.name,
      purpose: input.purpose,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      textBody: input.body,
      tokens: input.tokens,
      isActive: input.isActive
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=template");
}

export async function updateMessageTemplateStatusAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(templateStatusSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  const template = await prisma.messageTemplate.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    select: { key: true }
  });

  if (!template) {
    redirect(`/admin/modules/communications?error=${encodeURIComponent("Template not found.")}`);
  }

  if (template?.key) {
    redirect(`/admin/modules/communications?error=${encodeURIComponent("System templates are read-only from this catalog.")}`);
  }

  await prisma.messageTemplate.update({
    where: { id: input.id },
    data: { isActive: input.isActive }
  });

  refreshCommunications();
}

export async function updateMessageTemplateBuilderAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(builderTemplateSettingsSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();
  const template = await prisma.messageTemplate.findFirst({
    where: {
      id: input.id,
      siteId: settings.siteId,
      channel: MessageChannel.EMAIL
    },
    select: {
      id: true,
      siteId: true,
      version: true,
      name: true,
      subject: true,
      previewText: true,
      body: true,
      htmlBody: true,
      textBody: true,
      builderJson: true,
      builderRenderer: true,
      optionalTokens: true,
      requiredTokens: true,
      tokens: true,
      senderIdentityId: true,
      isMarketing: true,
      isActive: true
    }
  });

  if (!template) {
    communicationsError("Template not found.");
  }

  await requireVerifiedSender(input.senderIdentityId, settings.siteId);

  let builderDocument;
  try {
    builderDocument = normalizeEmailBuilderDocument(input.builderJson);
  } catch {
    communicationsError("Builder JSON is invalid.");
  }

  const renderedBuilderHtml = await renderEmailBuilderHtml(builderDocument);
  if (!renderedBuilderHtml) {
    communicationsError("The visual builder must contain at least one renderable block.");
  }

  const { allowedTokens, requiredTokens } = templateAllowedTokens(template);
  const usedTokens = new Set([
    ...extractEmailTemplateTokens(input.subject),
    ...extractEmailTemplateTokens(input.previewText),
    ...extractEmailTemplateTokens(input.textBody),
    ...extractEmailBuilderTokens(builderDocument)
  ]);
  assertTemplateTokens({ allowedTokens, requiredTokens, usedTokens });

  await snapshotMessageTemplate(template, "Before visual builder save");

  await prisma.messageTemplate.update({
    where: { id: template.id },
    data: {
      subject: input.subject,
      previewText: input.previewText,
      textBody: input.textBody,
      htmlBody: renderedBuilderHtml,
      builderJson: builderDocument,
      builderRenderer: "first_party_v1",
      senderIdentityId: input.senderIdentityId || null,
      version: { increment: 1 }
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=builder-template");
}

export async function cloneMessageTemplateAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(cloneTemplateSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();
  const source = await prisma.messageTemplate.findFirst({
    where: { id: input.sourceTemplateId, siteId: settings.siteId },
    select: {
      id: true,
      siteId: true,
      name: true,
      description: true,
      purpose: true,
      channel: true,
      subject: true,
      previewText: true,
      body: true,
      htmlBody: true,
      textBody: true,
      builderJson: true,
      builderRenderer: true,
      tokens: true,
      requiredTokens: true,
      optionalTokens: true,
      senderIdentityId: true,
      isMarketing: true
    }
  });

  if (!source) {
    communicationsError("Template not found.");
  }

  const cloneName = input.name || `Copy of ${source.name}`;
  const cloned = await prisma.messageTemplate.create({
    data: {
      siteId: source.siteId,
      sourceTemplateId: source.id,
      name: cloneName,
      description: source.description ? `Cloned from ${source.name}: ${source.description}` : `Cloned from ${source.name}`,
      purpose: source.purpose,
      channel: source.channel,
      subject: source.subject,
      previewText: source.previewText,
      body: source.body,
      htmlBody: source.htmlBody,
      textBody: source.textBody,
      builderJson: jsonInput(source.builderJson),
      builderRenderer: source.builderRenderer,
      tokens: jsonInput(source.tokens),
      requiredTokens: jsonInput(source.requiredTokens),
      optionalTokens: jsonInput(source.optionalTokens),
      senderIdentityId: source.senderIdentityId,
      isMarketing: source.isMarketing,
      isActive: false
    }
  });

  await snapshotMessageTemplate(cloned, "Initial cloned version");

  refreshCommunications();
  redirect(`/admin/modules/communications?saved=template-cloned&previewTemplate=${cloned.id}`);
}

export async function restoreMessageTemplateVersionAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(restoreTemplateVersionSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();
  const [template, version] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: input.templateId, siteId: settings.siteId },
      select: {
        id: true,
        siteId: true,
        version: true,
        name: true,
        subject: true,
        previewText: true,
        body: true,
        htmlBody: true,
        textBody: true,
        builderJson: true,
        builderRenderer: true,
        tokens: true,
        requiredTokens: true,
        optionalTokens: true,
        senderIdentityId: true,
        isMarketing: true,
        isActive: true
      }
    }),
    prisma.messageTemplateVersion.findFirst({
      where: {
        id: input.versionId,
        templateId: input.templateId,
        siteId: settings.siteId
      }
    })
  ]);

  if (!template || !version) {
    communicationsError("Template version not found.");
  }

  // Re-validate the restored content against the version's own token metadata before
  // it goes live — a snapshot taken under an older allowlist shouldn't bypass token checks.
  const restoredUsedTokens = new Set([
    ...extractEmailTemplateTokens(version.subject),
    ...extractEmailTemplateTokens(version.previewText),
    ...extractEmailTemplateTokens(version.textBody)
  ]);
  if (hasBuilderJson(version.builderJson)) {
    for (const token of extractEmailBuilderTokens(normalizeEmailBuilderDocument(version.builderJson))) {
      restoredUsedTokens.add(token);
    }
  } else {
    for (const token of extractEmailTemplateTokens(version.htmlBody)) {
      restoredUsedTokens.add(token);
    }
  }
  const restoredTokenScope = templateAllowedTokens(version);
  assertTemplateTokens({
    allowedTokens: restoredTokenScope.allowedTokens,
    requiredTokens: restoredTokenScope.requiredTokens,
    usedTokens: restoredUsedTokens
  });

  await snapshotMessageTemplate(template, "Before restore");

  await prisma.messageTemplate.update({
    where: { id: template.id },
    data: {
      name: version.name,
      subject: version.subject,
      previewText: version.previewText,
      body: version.body,
      htmlBody: version.htmlBody,
      textBody: version.textBody,
      builderJson: jsonInput(version.builderJson),
      builderRenderer: version.builderRenderer,
      tokens: jsonInput(version.tokens),
      requiredTokens: jsonInput(version.requiredTokens),
      optionalTokens: jsonInput(version.optionalTokens),
      senderIdentityId: version.senderIdentityId,
      isMarketing: version.isMarketing,
      isActive: version.isActive,
      version: { increment: 1 }
    }
  });

  refreshCommunications();
  redirect(`/admin/modules/communications?saved=template-restored&previewTemplate=${template.id}`);
}

export async function recordMessageLogAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(messageLogSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();
  const sentAt = input.status === MessageLogStatus.SENT ? new Date() : undefined;

  await prisma.messageLog.create({
    data: {
      siteId: settings.siteId,
      templateId: input.templateId || undefined,
      channel: input.channel,
      purpose: input.purpose || "general",
      recipientEmail: input.recipientEmail,
      recipientPhone: input.recipientPhone,
      subject: input.subject,
      bodyPreview: input.bodyPreview.slice(0, 500),
      status: input.status,
      errorMessage: input.errorMessage,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      sentAt
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=log");
}

export async function createSuppressionEntryAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(suppressionSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  try {
    await prisma.suppressionListEntry.create({
      data: {
        siteId: settings.siteId,
        email: input.email,
        reason: input.reason,
        source: input.source || "admin",
        scope: input.scope
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/communications?error=${encodeURIComponent(`${input.email} is already suppressed.`)}`);
    }

    throw error;
  }

  refreshCommunications();
  redirect("/admin/modules/communications?saved=suppression");
}

export async function deleteSuppressionEntryAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(suppressionDeleteSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  await prisma.suppressionListEntry.deleteMany({
    where: { id: input.id, siteId: settings.siteId }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=unsuppressed");
}

export async function sendTemplateTestEmailAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(templateTestSendSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  try {
    await queueTemplateTestEmail({
      siteId: settings.siteId,
      templateId: input.templateId,
      recipientEmail: input.recipientEmail,
      tokens: parseTokenJson(input.tokensJson),
      idempotencyKey: `template-test:${input.templateId}:${input.recipientEmail}:${Date.now()}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue that test email.";
    redirect(`/admin/modules/communications?error=${encodeURIComponent(message)}`);
  }

  refreshCommunications();
  redirect("/admin/modules/communications?saved=test-email");
}

export async function resendEmailOutboxAction(formData: FormData) {
  await requireAdmin("communications:manage");
  const input = await parseForm(outboxResendSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();
  const row = await prisma.emailOutbox.findFirst({
    where: { id: input.id, siteId: settings.siteId }
  });

  if (!row) {
    communicationsError("Outbox row not found.");
  }

  if (row.status === EmailOutboxStatus.QUEUED || row.status === EmailOutboxStatus.SENDING) {
    communicationsError("That email is already queued or sending.");
  }

  const suppressionReason = await outboxSuppressionReason({
    category: row.category,
    email: row.recipientEmail,
    siteId: row.siteId
  });
  const now = new Date();

  await prisma.emailOutbox.create({
    data: {
      siteId: row.siteId,
      idempotencyKey: `${row.idempotencyKey}:resend:${now.getTime()}`,
      templateId: row.templateId,
      templateKey: row.templateKey,
      senderIdentityId: row.senderIdentityId,
      campaignId: row.campaignId,
      subscriberId: row.subscriberId,
      recipientEmail: row.recipientEmail,
      recipientName: row.recipientName,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      replyToEmail: row.replyToEmail,
      subject: row.subject,
      previewText: row.previewText,
      htmlBody: row.htmlBody,
      textBody: row.textBody,
      headers: jsonInput(row.headers),
      purpose: row.purpose,
      category: row.category,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      status: suppressionReason ? EmailOutboxStatus.SUPPRESSED : EmailOutboxStatus.QUEUED,
      nextAttemptAt: now,
      lastError: suppressionReason
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=resend");
}
