"use server";

import { randomBytes } from "crypto";
import {
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
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
import { prisma } from "@/lib/prisma";

const automationEvents = [
  "automation.manual",
  "booking.created",
  "booking.canceled",
  "order.paid",
  "form.submitted",
  "gallery.approved",
  "client.tagged",
  "invoice.overdue"
] as const;

const automationEvent = z.enum(automationEvents);

const automationSchema = z
  .object({
    name: requiredText,
    status: z.enum(AutomationStatus).catch(AutomationStatus.DRAFT),
    trigger: z.enum(AutomationTrigger).catch(AutomationTrigger.MANUAL),
    action: z.enum(AutomationAction).catch(AutomationAction.NOTIFY_ADMIN),
    targetEmail: optionalEmail,
    webhookUrl: optionalSafeExternalHttpsUrl,
    subjectTemplate: optionalStoredText,
    bodyTemplate: optionalStoredText,
    conditionKey: optionalStoredText,
    conditionValue: optionalStoredText
  })
  .transform((value) => ({
    ...value,
    conditions: value.conditionKey ? { [value.conditionKey]: value.conditionValue } : {}
  }))
  .refine((value) => value.action !== AutomationAction.SEND_EMAIL || value.targetEmail, {
    message: "Email automations need a target email.",
    path: ["targetEmail"]
  })
  .refine((value) => value.action !== AutomationAction.SEND_WEBHOOK || value.webhookUrl, {
    message: "Webhook automations need a webhook URL.",
    path: ["webhookUrl"]
  });

const automationUpdateSchema = automationSchema.and(z.object({ id: requiredText }));

const automationStatusSchema = z.object({
  id: requiredText,
  status: z.enum(AutomationStatus)
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
    message: `Use known event names: ${automationEvents.join(", ")}.`,
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
  status: z.enum(WebhookDeliveryStatus).catch(WebhookDeliveryStatus.PENDING),
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

export async function createAutomationAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(automationSchema, formData, "/admin/modules/automation");

  await prisma.automation.create({
    data: {
      name: input.name,
      status: input.status,
      trigger: input.trigger,
      action: input.action,
      targetEmail: input.targetEmail,
      webhookUrl: input.webhookUrl,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      conditions: input.conditions
    }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=automation");
}

export async function updateAutomationStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(automationStatusSchema, formData, "/admin/modules/automation");

  await prisma.automation.update({
    where: { id: input.id },
    data: { status: input.status }
  });

  refreshAutomation();
}

export async function updateAutomationAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(automationUpdateSchema, formData, "/admin/modules/automation");

  await prisma.automation.update({
    where: { id: input.id },
    data: {
      name: input.name,
      status: input.status,
      trigger: input.trigger,
      action: input.action,
      targetEmail: input.targetEmail,
      webhookUrl: input.webhookUrl,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      conditions: input.conditions
    }
  });

  refreshAutomation();
  redirect(`/admin/modules/automation?saved=automation&automation=${input.id}`);
}

export async function deleteAutomationAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(deleteAutomationSchema, formData, "/admin/modules/automation");

  await prisma.automation.delete({
    where: { id: input.id }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=automation-delete");
}

export async function recordAutomationRunAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(automationRunSchema, formData, "/admin/modules/automation");

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
  await requireAdmin();
  const input = await parseForm(webhookEndpointSchema, formData, "/admin/modules/automation");

  await prisma.webhookEndpoint.create({
    data: {
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
  await requireAdmin();
  const input = await parseForm(webhookEndpointUpdateSchema, formData, "/admin/modules/automation");
  const current = await prisma.webhookEndpoint.findUnique({
    where: { id: input.id },
    select: { signingSecret: true }
  });

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
  await requireAdmin();
  const input = await parseForm(deleteWebhookEndpointSchema, formData, "/admin/modules/automation");

  await prisma.webhookEndpoint.delete({
    where: { id: input.id }
  });

  refreshAutomation();
  redirect("/admin/modules/automation?saved=webhook-delete");
}

export async function recordWebhookDeliveryAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(webhookDeliverySchema, formData, "/admin/modules/automation");

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
