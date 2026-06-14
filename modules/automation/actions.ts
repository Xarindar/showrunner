"use server";

import { randomBytes } from "crypto";
import {
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
  MessageChannel,
  WebhookDeliveryStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  csvList,
  optionalEmail,
  optionalNonNegativeInt,
  optionalSafeExternalHttpsUrl,
  optionalStoredText,
  parseForm,
  requiredText,
  safeExternalHttpsUrl
} from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { moduleEventNames } from "@/lib/events/catalog";
import { replayAutomationRun } from "@/lib/events/automation-runs";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

const automationEvent = z.enum(moduleEventNames);
const actionConfigText = optionalStoredText.transform((value, context) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      context.addIssue({ code: "custom", message: "Action config must be a JSON object." });
      return z.NEVER;
    }
    return parsed;
  } catch {
    context.addIssue({ code: "custom", message: "Action config must be valid JSON." });
    return z.NEVER;
  }
});

function configText(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === "string"
    ? ((value as Record<string, unknown>)[key] as string).trim()
    : "";
}

function configNumberish(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return typeof raw === "string" ? raw.trim() : "";
}

function actionNeedsTemplate(action: AutomationAction) {
  return action === AutomationAction.SEND_EMAIL || action === AutomationAction.NOTIFY_ADMIN || action === AutomationAction.REQUEST_REVIEW;
}

const automationSchema = z
  .object({
    name: requiredText,
    status: z.enum(AutomationStatus).catch(AutomationStatus.DRAFT),
    trigger: z.enum(AutomationTrigger).catch(AutomationTrigger.MANUAL),
    action: z.enum(AutomationAction).catch(AutomationAction.NOTIFY_ADMIN),
    targetEmail: optionalEmail,
    messageTemplateId: optionalStoredText,
    webhookUrl: optionalSafeExternalHttpsUrl,
    subjectTemplate: optionalStoredText,
    bodyTemplate: optionalStoredText,
    actionConfig: actionConfigText,
    conditionKey: optionalStoredText,
    conditionValue: optionalStoredText
  })
  .transform((value) => ({
    ...value,
    conditions: value.conditionKey ? { [value.conditionKey]: value.conditionValue } : {}
  }))
  .refine(
    (value) => !actionNeedsTemplate(value.action) || value.messageTemplateId,
    {
      message: "Email-based automations need a MessageTemplate.",
      path: ["messageTemplateId"]
    }
  )
  .refine((value) => value.action !== AutomationAction.UPDATE_STATUS || configText(value.actionConfig, "targetStatus"), {
    message: "Update status automations need actionConfig.targetStatus.",
    path: ["actionConfig"]
  })
  .refine(
    (value) => value.action !== AutomationAction.ADD_TAG || configText(value.actionConfig, "tag") || configText(value.actionConfig, "label"),
    {
      message: "Add tag automations need actionConfig.tag.",
      path: ["actionConfig"]
    }
  )
  .refine((value) => value.action !== AutomationAction.CREATE_TASK || configText(value.actionConfig, "title"), {
    message: "Create task automations need actionConfig.title.",
    path: ["actionConfig"]
  })
  .refine(
    (value) =>
      value.action !== AutomationAction.CREATE_INVOICE ||
      configNumberish(value.actionConfig, "unitPriceCents") ||
      configNumberish(value.actionConfig, "amountCents") ||
      configNumberish(value.actionConfig, "unitPrice") ||
      configNumberish(value.actionConfig, "amount"),
    {
      message: "Create invoice automations need actionConfig.unitPriceCents or actionConfig.amountCents.",
      path: ["actionConfig"]
    }
  )
  .refine((value) => value.action !== AutomationAction.SEND_WEBHOOK || value.webhookUrl, {
    message: "Webhook automations need a webhook URL.",
    path: ["webhookUrl"]
  });

const automationUpdateSchema = automationSchema.and(z.object({ id: requiredText }));

const automationStatusSchema = z.object({
  id: requiredText,
  status: z.enum(AutomationStatus)
});

const replayRunSchema = z.object({
  id: requiredText
});

const deleteAutomationSchema = z.object({
  id: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the automation." })
});

const automationRunSchema = z.object({
  automationId: requiredText,
  status: z.enum(AutomationRunStatus).catch(AutomationRunStatus.SUCCEEDED),
  triggerKey: optionalStoredText,
  relatedType: optionalStoredText,
  relatedId: optionalStoredText,
  summary: optionalStoredText
});

const webhookEndpointSchema = z
  .object({
    name: requiredText,
    url: safeExternalHttpsUrl,
    signingSecret: optionalStoredText,
    status: z.enum(AutomationStatus).catch(AutomationStatus.DRAFT),
    events: optionalStoredText
  })
  .transform((value) => ({
    ...value,
    events: csvList(value.events)
  }))
  .refine((value) => value.events.every((event) => automationEvent.safeParse(event).success), {
    message: `Use known event names: ${moduleEventNames.join(", ")}.`,
    path: ["events"]
  });

const webhookEndpointUpdateSchema = webhookEndpointSchema.and(z.object({ id: requiredText }));

const deleteWebhookEndpointSchema = z.object({
  id: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the webhook endpoint." })
});

const webhookDeliverySchema = z.object({
  webhookEndpointId: requiredText,
  event: automationEvent,
  status: z.enum([WebhookDeliveryStatus.DELIVERED, WebhookDeliveryStatus.FAILED]).catch(WebhookDeliveryStatus.DELIVERED),
  statusCode: optionalNonNegativeInt,
  errorMessage: optionalStoredText
});

function refreshAutomation() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/automation");
}

function generateSigningSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

function missingSigningSecret(value?: string | null) {
  return !value || value === "replace-before-production";
}

function automationWebhookSecret(action: AutomationAction, currentSecret?: string | null) {
  if (action !== AutomationAction.SEND_WEBHOOK) return undefined;
  return missingSigningSecret(currentSecret) ? generateSigningSecret() : currentSecret || undefined;
}

async function requireAutomationTemplate(messageTemplateId: string, siteId: string) {
  if (!messageTemplateId) return undefined;
  const template = await prisma.messageTemplate.findFirst({
    where: {
      id: messageTemplateId,
      siteId,
      channel: MessageChannel.EMAIL,
      isActive: true
    },
    select: { id: true }
  });

  if (!template) {
    redirect(`/admin/modules/automation?error=${encodeURIComponent("Choose an active email template for that automation.")}`);
  }

  return template.id;
}

export async function createAutomationAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(automationSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();
  const messageTemplateId = await requireAutomationTemplate(input.messageTemplateId, settings.siteId);

  await prisma.automation.create({
    data: {
      siteId: settings.siteId,
      name: input.name,
      status: input.status,
      trigger: input.trigger,
      action: input.action,
      targetEmail: input.targetEmail,
      messageTemplateId,
      webhookUrl: input.webhookUrl,
      webhookSigningSecret: automationWebhookSecret(input.action) || "",
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      actionConfig: input.actionConfig,
      conditions: input.conditions
    }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=automation");
}

export async function updateAutomationStatusAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(automationStatusSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();

  await prisma.automation.updateMany({
    where: { id: input.id, siteId: settings.siteId },
    data: { status: input.status }
  });

  refreshAutomation();
}

export async function updateAutomationAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(automationUpdateSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();
  const current = await prisma.automation.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    select: { webhookSigningSecret: true }
  });

  if (!current) {
    redirect(`/admin/modules/automation?error=${encodeURIComponent("Automation not found.")}`);
  }
  const messageTemplateId = await requireAutomationTemplate(input.messageTemplateId, settings.siteId);

  await prisma.automation.update({
    where: { id: input.id },
    data: {
      name: input.name,
      status: input.status,
      trigger: input.trigger,
      action: input.action,
      targetEmail: input.targetEmail,
      messageTemplateId,
      webhookUrl: input.webhookUrl,
      webhookSigningSecret: automationWebhookSecret(input.action, current?.webhookSigningSecret) || "",
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      actionConfig: input.actionConfig,
      conditions: input.conditions
    }
  });

  refreshAutomation();
  redirect(`/admin/modules/automation?saved=automation&automation=${input.id}`);
}

export async function deleteAutomationAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(deleteAutomationSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();

  await prisma.automation.deleteMany({
    where: { id: input.id, siteId: settings.siteId }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=automation-delete");
}

export async function replayAutomationRunAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(replayRunSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();

  try {
    await replayAutomationRun(input.id, settings.siteId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation run could not be replayed.";
    redirect(`/admin/modules/automation?error=${encodeURIComponent(message)}`);
  }

  refreshAutomation();
  redirect("/admin/modules/automation?saved=replay");
}

export async function recordAutomationRunAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(automationRunSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();
  const automation = await prisma.automation.findFirst({
    where: { id: input.automationId, siteId: settings.siteId },
    select: { id: true }
  });

  if (!automation) {
    redirect(`/admin/modules/automation?error=${encodeURIComponent("Automation not found.")}`);
  }

  await prisma.$transaction([
    prisma.automationRun.create({
      data: {
        automationId: input.automationId,
        status: input.status,
        triggerKey: input.triggerKey,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        summary: input.summary
      }
    }),
    prisma.automation.update({
      where: { id: input.automationId },
      data: { lastRunAt: new Date() }
    })
  ]);

  refreshAutomation();
  redirect(`/admin/modules/automation?saved=run&automation=${input.automationId}`);
}

export async function createWebhookEndpointAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(webhookEndpointSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();

  await prisma.webhookEndpoint.create({
    data: {
      siteId: settings.siteId,
      name: input.name,
      url: input.url,
      signingSecret: input.signingSecret || generateSigningSecret(),
      status: input.status,
      events: input.events
    }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=webhook");
}

export async function updateWebhookEndpointAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(webhookEndpointUpdateSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();
  const current = await prisma.webhookEndpoint.findFirst({
    where: { id: input.id, siteId: settings.siteId },
    select: { signingSecret: true }
  });

  if (!current) {
    redirect(`/admin/modules/automation?error=${encodeURIComponent("Webhook endpoint not found.")}`);
  }

  await prisma.webhookEndpoint.update({
    where: { id: input.id },
    data: {
      name: input.name,
      url: input.url,
      signingSecret: input.signingSecret || (missingSigningSecret(current?.signingSecret) ? generateSigningSecret() : undefined),
      status: input.status,
      events: input.events
    }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=webhook");
}

export async function deleteWebhookEndpointAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(deleteWebhookEndpointSchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();

  await prisma.webhookEndpoint.deleteMany({
    where: { id: input.id, siteId: settings.siteId }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=webhook-delete");
}

export async function recordWebhookDeliveryAction(formData: FormData) {
  await requireAdmin("automation:manage");
  const input = await parseForm(webhookDeliverySchema, formData, "/admin/modules/automation");
  const settings = await getSiteSettings();
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: input.webhookEndpointId, siteId: settings.siteId },
    select: { id: true }
  });

  if (!endpoint) {
    redirect(`/admin/modules/automation?error=${encodeURIComponent("Webhook endpoint not found.")}`);
  }

  await prisma.webhookDelivery.create({
    data: {
      webhookEndpointId: input.webhookEndpointId,
      event: input.event,
      status: input.status,
      statusCode: input.statusCode,
      errorMessage: input.errorMessage,
      deliveredAt: input.status === WebhookDeliveryStatus.DELIVERED ? new Date() : undefined
    }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=delivery");
}
