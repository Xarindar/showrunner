"use server";

import { EmailSuppressionScope, MessageChannel, MessageLogStatus, MessageTemplatePurpose, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { csvList, optionalEmailStored, optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { queueTemplateTestEmail } from "@/lib/email";
import { extractEmailTemplateTokens } from "@/lib/email/render";
import { stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { bookingTemplateKeySet } from "./booking-templates";

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

const bookingTemplateSettingsSchema = z.object({
  id: requiredText,
  subject: requiredText,
  previewText: optionalStoredText,
  textBody: requiredText,
  htmlBody: optionalStoredText,
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

export async function createMessageTemplateAction(formData: FormData) {
  await requireAdmin();
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
      tokens: input.tokens,
      isActive: input.isActive
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=template");
}

export async function updateMessageTemplateStatusAction(formData: FormData) {
  await requireAdmin();
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

export async function updateBookingTemplateSettingsAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(bookingTemplateSettingsSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  const template = await prisma.messageTemplate.findFirst({
    where: {
      id: input.id,
      siteId: settings.siteId,
      channel: MessageChannel.EMAIL
    },
    select: {
      id: true,
      key: true,
      requiredTokens: true,
      optionalTokens: true,
      tokens: true
    }
  });

  if (!template || !template.key || !bookingTemplateKeySet.has(template.key)) {
    communicationsError("Booking template not found.");
  }

  if (input.senderIdentityId) {
    const sender = await prisma.emailSenderIdentity.findFirst({
      where: { id: input.senderIdentityId, siteId: settings.siteId },
      select: { id: true }
    });

    if (!sender) {
      communicationsError("Sender identity not found.");
    }
  }

  const allowedTokens = new Set([
    ...stringArrayFromUnknown(template.tokens),
    ...stringArrayFromUnknown(template.requiredTokens),
    ...stringArrayFromUnknown(template.optionalTokens)
  ]);
  const usedTokens = new Set(
    [input.subject, input.previewText, input.textBody, input.htmlBody].flatMap((value) => extractEmailTemplateTokens(value))
  );
  const unsupportedTokens = Array.from(usedTokens).filter((token) => !allowedTokens.has(token));

  if (unsupportedTokens.length) {
    communicationsError(`Unsupported token${unsupportedTokens.length === 1 ? "" : "s"}: ${unsupportedTokens.join(", ")}.`);
  }

  await prisma.messageTemplate.update({
    where: { id: template.id },
    data: {
      subject: input.subject,
      previewText: input.previewText,
      body: input.textBody,
      textBody: input.textBody,
      htmlBody: input.htmlBody,
      senderIdentityId: input.senderIdentityId || null
    }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=booking-template");
}

export async function recordMessageLogAction(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const input = await parseForm(suppressionDeleteSchema, formData, "/admin/modules/communications");
  const settings = await getSiteSettings();

  await prisma.suppressionListEntry.deleteMany({
    where: { id: input.id, siteId: settings.siteId }
  });

  refreshCommunications();
  redirect("/admin/modules/communications?saved=unsuppressed");
}

export async function sendTemplateTestEmailAction(formData: FormData) {
  await requireAdmin();
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
