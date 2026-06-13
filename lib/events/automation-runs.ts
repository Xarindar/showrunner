import {
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  BillingDocumentStatus,
  BookingStatus,
  EmailCategory,
  EmailOutboxStatus,
  FormStatus,
  MessageChannel,
  OrderStatus,
  PortfolioGalleryStatus,
  Prisma,
  TestimonialStatus
} from "@prisma/client";
import { updateBillingDocumentStatus, createAutomationInvoice } from "@/lib/billing/status";
import { updateBookingStatus } from "@/lib/bookings/status";
import { updateOrderStatus } from "@/lib/commerce/orders";
import { queueAdminEmail, queueEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const defaultMaxAttempts = 3;

type AutomationEnvelope = {
  actorEmail?: string;
  currency?: string;
  eventId?: string;
  landingPage?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  occurredAt?: string;
  pathname?: string;
  relatedId?: string;
  relatedType?: string;
  valueCents?: number;
};

type ProcessAutomationRunsOptions = {
  limit?: number;
  maxAttempts?: number;
  runIds?: string[];
  siteId?: string;
};

type ExecutionResult = {
  status?: AutomationRunStatus;
  summary: string;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonPrimitiveText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}

function numberConfig(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function centsConfig(value: unknown) {
  const parsed = numberConfig(value);
  if (parsed === undefined) return undefined;
  return Number.isInteger(parsed) ? parsed : Math.round(parsed * 100);
}

function nextAttemptAt(attemptCount: number) {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function assertEnumValue<T extends Record<string, string>>(values: T, value: string, label: string) {
  if (!Object.values(values).includes(value)) throw new Error(`Unsupported ${label}: ${value}.`);
  return value as T[keyof T];
}

function automationTokens(envelope: AutomationEnvelope, automationName: string) {
  const metadata = jsonObject(envelope.metadata);
  const tokens: Record<string, string | number | Date | null | undefined> = {
    actorEmail: envelope.actorEmail || "",
    automationName,
    currency: envelope.currency || "USD",
    eventId: envelope.eventId || "",
    eventName: envelope.name || "",
    landingPage: envelope.landingPage || "",
    occurredAt: envelope.occurredAt || "",
    pathname: envelope.pathname || "",
    relatedId: envelope.relatedId || "",
    relatedType: envelope.relatedType || "",
    valueCents: envelope.valueCents
  };

  for (const [key, value] of Object.entries(metadata)) {
    if (!tokens[key]) tokens[key] = jsonPrimitiveText(value);
  }

  return tokens;
}

function renderConfigTemplate(template: string, envelope: AutomationEnvelope, automationName: string) {
  const tokens = automationTokens(envelope, automationName);
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, key: string) => String(tokens[key] || ""));
}

function templateKey(automation: { messageTemplate: { key: string | null; channel: MessageChannel; isActive: boolean } | null }) {
  if (!automation.messageTemplate || automation.messageTemplate.channel !== MessageChannel.EMAIL || !automation.messageTemplate.isActive) {
    throw new Error("Choose an active email MessageTemplate for this automation action.");
  }
  if (!automation.messageTemplate.key) {
    throw new Error("Selected MessageTemplate needs a key before it can be used by automation.");
  }

  return automation.messageTemplate.key;
}

async function queuedEmailOutcome(idempotencyKey: string, siteId: string) {
  return prisma.emailOutbox.findFirst({
    where: {
      siteId,
      OR: [{ idempotencyKey }, { idempotencyKey: `${idempotencyKey}:queue-failure` }]
    },
    orderBy: { createdAt: "desc" }
  });
}

async function executeSendEmail(
  automation: AutomationForRun,
  envelope: AutomationEnvelope,
  runId: string,
  category = EmailCategory.TRANSACTIONAL
) {
  const config = jsonObject(automation.actionConfig);
  const recipientEmail = cleanString(config.recipientEmail) || automation.targetEmail || envelope.actorEmail || "";
  if (!recipientEmail) throw new Error("Email automation needs a target email or event actor email.");

  const idempotencyKey = `automation:${runId}:email:${recipientEmail}`;
  await queueEmail({
    templateKey: templateKey(automation),
    siteId: automation.siteId,
    recipientEmail,
    category,
    relatedType: envelope.relatedType || "",
    relatedId: envelope.relatedId || "",
    tokens: automationTokens(envelope, automation.name),
    idempotencyKey
  });

  const outbox = await queuedEmailOutcome(idempotencyKey, automation.siteId);
  if (!outbox) throw new Error("Email queue did not produce an EmailOutbox record.");
  if (outbox.status === EmailOutboxStatus.FAILED) throw new Error(outbox.lastError || "Email queue failed.");
  if (outbox.status === EmailOutboxStatus.SUPPRESSED) {
    return { status: AutomationRunStatus.SKIPPED, summary: `Email suppressed for ${recipientEmail}.` };
  }

  return { summary: `Queued email ${outbox.templateKey} to ${recipientEmail}.` };
}

async function executeNotifyAdmin(automation: AutomationForRun, envelope: AutomationEnvelope, runId: string) {
  const config = jsonObject(automation.actionConfig);
  const groupKey = cleanString(config.groupKey) || "system";
  const idempotencyKeyBase = `automation:${runId}:admin`;

  await queueAdminEmail({
    templateKey: templateKey(automation),
    siteId: automation.siteId,
    groupKey,
    overrideEmail: automation.targetEmail,
    relatedType: envelope.relatedType || "",
    relatedId: envelope.relatedId || "",
    tokens: automationTokens(envelope, automation.name),
    idempotencyKeyBase
  });

  const outboxRows = await prisma.emailOutbox.findMany({
    where: { siteId: automation.siteId, idempotencyKey: { startsWith: idempotencyKeyBase } },
    orderBy: { createdAt: "desc" }
  });
  if (!outboxRows.length) throw new Error("Admin email queue did not produce an EmailOutbox record.");
  if (outboxRows.every((row) => row.status === EmailOutboxStatus.FAILED)) {
    throw new Error(outboxRows[0]?.lastError || "Admin email queue failed.");
  }

  const queuedCount = outboxRows.filter((row) => row.status === EmailOutboxStatus.QUEUED).length;
  const suppressedCount = outboxRows.filter((row) => row.status === EmailOutboxStatus.SUPPRESSED).length;
  return { summary: `Queued ${queuedCount} admin email${queuedCount === 1 ? "" : "s"}; ${suppressedCount} suppressed.` };
}

async function resolveClientId(envelope: AutomationEnvelope, siteId: string) {
  const metadata = jsonObject(envelope.metadata);
  const metadataClientId = cleanString(metadata.clientId);
  if (metadataClientId) {
    const client = await prisma.client.findFirst({ where: { id: metadataClientId, siteId }, select: { id: true } });
    if (client) return client.id;
  }

  if (envelope.relatedType === "client" && envelope.relatedId) {
    const client = await prisma.client.findFirst({ where: { id: envelope.relatedId, siteId }, select: { id: true } });
    if (client) return client.id;
  }

  if (envelope.relatedType === "booking" && envelope.relatedId) {
    const booking = await prisma.booking.findFirst({
      where: { id: envelope.relatedId, siteId },
      select: { clientId: true, customerEmail: true }
    });
    if (booking?.clientId) return booking.clientId;
    if (booking?.customerEmail) return resolveClientByEmail(booking.customerEmail, siteId);
  }

  if (envelope.relatedType === "form_submission" && envelope.relatedId) {
    const submission = await prisma.formSubmission.findFirst({
      where: { id: envelope.relatedId, form: { siteId } },
      select: { clientId: true, submitterEmail: true }
    });
    if (submission?.clientId) return submission.clientId;
    if (submission?.submitterEmail) return resolveClientByEmail(submission.submitterEmail, siteId);
  }

  if (envelope.relatedType === "order" && envelope.relatedId) {
    const order = await prisma.order.findFirst({
      where: { id: envelope.relatedId, siteId },
      select: { clientId: true, customerEmail: true }
    });
    if (order?.clientId) return order.clientId;
    if (order?.customerEmail) return resolveClientByEmail(order.customerEmail, siteId);
  }

  if (envelope.relatedType === "billing_document" && envelope.relatedId) {
    const document = await prisma.billingDocument.findFirst({
      where: { id: envelope.relatedId, siteId },
      select: { clientId: true, customerEmail: true }
    });
    if (document?.clientId) return document.clientId;
    if (document?.customerEmail) return resolveClientByEmail(document.customerEmail, siteId);
  }

  return envelope.actorEmail ? resolveClientByEmail(envelope.actorEmail, siteId) : "";
}

async function resolveClientByEmail(email: string, siteId: string) {
  const client = await prisma.client.findUnique({
    where: { siteId_email: { siteId, email: email.toLowerCase() } },
    select: { id: true }
  });
  return client?.id || "";
}

async function executeAddTag(automation: AutomationForRun, envelope: AutomationEnvelope) {
  const config = jsonObject(automation.actionConfig);
  const label = cleanString(config.tag) || cleanString(config.label);
  if (!label) throw new Error("Add tag automation needs actionConfig.tag.");

  const clientId = await resolveClientId(envelope, automation.siteId);
  if (!clientId) throw new Error("Add tag automation could not resolve a client target.");

  await prisma.clientTag.upsert({
    where: { clientId_label: { clientId, label } },
    update: {
      relatedType: envelope.relatedType || "",
      relatedId: envelope.relatedId || ""
    },
    create: {
      siteId: automation.siteId,
      clientId,
      label,
      source: "automation",
      relatedType: envelope.relatedType || "",
      relatedId: envelope.relatedId || ""
    }
  });

  return { summary: `Added client tag "${label}".` };
}

async function executeCreateTask(automation: AutomationForRun, envelope: AutomationEnvelope, runId: string, fallbackTitle?: string) {
  const config = jsonObject(automation.actionConfig);
  const configuredTitle = cleanString(config.title);
  const title = renderConfigTemplate(configuredTitle || fallbackTitle || `Review ${envelope.name || "automation event"}`, envelope, automation.name);
  const description = renderConfigTemplate(cleanString(config.description), envelope, automation.name);
  const assignedToEmail = cleanString(config.assignedToEmail) || automation.targetEmail || "";
  const dueInDays = Number(config.dueInDays || 0);
  const dueAt = Number.isFinite(dueInDays) && dueInDays > 0 ? new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000) : undefined;

  await prisma.automationTask.create({
    data: {
      siteId: automation.siteId,
      automationRunId: runId,
      title,
      description,
      actorEmail: envelope.actorEmail || "",
      assignedToEmail,
      relatedType: envelope.relatedType || "",
      relatedId: envelope.relatedId || "",
      dueAt
    }
  });

  return { summary: `Created task "${title}".` };
}

async function executeRequestReview(automation: AutomationForRun, envelope: AutomationEnvelope, runId: string) {
  const emailResult = await executeSendEmail(automation, envelope, runId, EmailCategory.TRANSACTIONAL);
  await executeCreateTask(automation, envelope, runId, `Follow up on review request for {{actorEmail}}`);
  return { status: emailResult.status, summary: `${emailResult.summary} Created review follow-up task.` };
}

async function executeUpdateStatus(automation: AutomationForRun, envelope: AutomationEnvelope) {
  const config = jsonObject(automation.actionConfig);
  const targetType = cleanString(config.targetType) || envelope.relatedType || "";
  const targetId = cleanString(config.targetId) || envelope.relatedId || "";
  const targetStatus = cleanString(config.targetStatus);

  if (!targetType || !targetId || !targetStatus) {
    throw new Error("Update status automation needs targetType, targetId/relatedId, and targetStatus.");
  }

  if (targetType === "booking") {
    const nextStatus = assertEnumValue(BookingStatus, targetStatus, "booking status");
    await updateBookingStatus({ bookingId: targetId, status: nextStatus, siteId: automation.siteId });
    return { summary: `Updated booking status to ${nextStatus}.` };
  }

  if (targetType === "client") {
    const allowed = new Set(["active", "lead", "vip", "inactive"]);
    if (!allowed.has(targetStatus)) throw new Error(`Unsupported client status: ${targetStatus}.`);
    const result = await prisma.client.updateMany({
      where: { id: targetId, siteId: automation.siteId },
      data: { status: targetStatus }
    });
    if (!result.count) throw new Error("Client target not found.");
    return { summary: `Updated client status to ${targetStatus}.` };
  }

  if (targetType === "form") {
    const nextStatus = assertEnumValue(FormStatus, targetStatus, "form status");
    const result = await prisma.form.updateMany({
      where: { id: targetId, siteId: automation.siteId },
      data: { status: nextStatus }
    });
    if (!result.count) throw new Error("Form target not found.");
    return { summary: `Updated form status to ${nextStatus}.` };
  }

  if (targetType === "testimonial") {
    const nextStatus = assertEnumValue(TestimonialStatus, targetStatus, "testimonial status");
    const result = await prisma.testimonial.updateMany({
      where: { id: targetId, siteId: automation.siteId },
      data: { status: nextStatus }
    });
    if (!result.count) throw new Error("Testimonial target not found.");
    return { summary: `Updated testimonial status to ${nextStatus}.` };
  }

  if (targetType === "portfolio_gallery") {
    const nextStatus = assertEnumValue(PortfolioGalleryStatus, targetStatus, "gallery status");
    const result = await prisma.portfolioGallery.updateMany({
      where: { id: targetId, siteId: automation.siteId },
      data: { status: nextStatus, publishedAt: nextStatus === PortfolioGalleryStatus.PUBLISHED ? new Date() : undefined }
    });
    if (!result.count) throw new Error("Portfolio gallery target not found.");
    return { summary: `Updated gallery status to ${nextStatus}.` };
  }

  if (targetType === "billing_document") {
    const nextStatus = assertEnumValue(BillingDocumentStatus, targetStatus, "billing status");
    await updateBillingDocumentStatus({ billingDocumentId: targetId, status: nextStatus, siteId: automation.siteId });
    return { summary: `Updated billing document status to ${nextStatus}.` };
  }

  if (targetType === "order") {
    const nextStatus = assertEnumValue(OrderStatus, targetStatus, "order status");
    await updateOrderStatus({ orderId: targetId, status: nextStatus, siteId: automation.siteId });
    return { summary: `Updated order status to ${nextStatus}.` };
  }

  throw new Error(`Unsupported update status target type: ${targetType}.`);
}

async function executeCreateInvoice(automation: AutomationForRun, envelope: AutomationEnvelope) {
  const config = jsonObject(automation.actionConfig);
  const metadata = jsonObject(envelope.metadata);
  const clientId = await resolveClientId(envelope, automation.siteId);
  const customerEmail = cleanString(config.customerEmail) || envelope.actorEmail || "";
  const customerName = cleanString(config.customerName) || cleanString(metadata.customerName) || customerEmail;
  const unitPriceCents = centsConfig(config.unitPriceCents ?? config.unitPrice ?? config.amountCents ?? config.amount);
  const dueInDays = numberConfig(config.dueInDays);

  if (!customerEmail) throw new Error("Create invoice automation needs customerEmail or event actorEmail.");
  if (!unitPriceCents || unitPriceCents <= 0) {
    throw new Error("Create invoice automation needs actionConfig.unitPriceCents or actionConfig.amountCents.");
  }

  const document = await createAutomationInvoice({
    clientId: clientId || undefined,
    customerName: customerName || customerEmail,
    customerEmail,
    currency: cleanString(config.currency) || envelope.currency || "USD",
    dueAt: dueInDays ? new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000) : undefined,
    lineDescription: renderConfigTemplate(
      cleanString(config.lineDescription) || cleanString(config.description) || `Automation invoice for {{eventName}}`,
      envelope,
      automation.name
    ),
    quantity: Math.trunc(numberConfig(config.quantity) || 1),
    unitPriceCents,
    discountCents: centsConfig(config.discountCents ?? config.discount),
    taxCents: centsConfig(config.taxCents ?? config.tax),
    notes: renderConfigTemplate(cleanString(config.notes), envelope, automation.name),
    publicMemo: renderConfigTemplate(cleanString(config.publicMemo), envelope, automation.name),
    siteId: automation.siteId
  });

  return { summary: `Created draft invoice ${document.documentNumber}.` };
}

async function executeAutomationRun(run: AutomationRunForExecution): Promise<ExecutionResult> {
  const automation = run.automation;
  const envelope = jsonObject(run.payload) as AutomationEnvelope;

  if (automation.status !== AutomationStatus.ACTIVE) {
    return { status: AutomationRunStatus.SKIPPED, summary: "Automation rule is not active." };
  }

  switch (automation.action) {
    case AutomationAction.SEND_EMAIL:
      return executeSendEmail(automation, envelope, run.id);
    case AutomationAction.NOTIFY_ADMIN:
      return executeNotifyAdmin(automation, envelope, run.id);
    case AutomationAction.UPDATE_STATUS:
      return executeUpdateStatus(automation, envelope);
    case AutomationAction.ADD_TAG:
      return executeAddTag(automation, envelope);
    case AutomationAction.CREATE_TASK:
      return executeCreateTask(automation, envelope, run.id);
    case AutomationAction.REQUEST_REVIEW:
      return executeRequestReview(automation, envelope, run.id);
    case AutomationAction.CREATE_INVOICE:
      return executeCreateInvoice(automation, envelope);
    case AutomationAction.SEND_WEBHOOK:
      return { status: AutomationRunStatus.SKIPPED, summary: "Webhook deliveries are processed by the webhook worker." };
  }
}

async function failRun(id: string, message: string, attemptCount: number, maxAttempts: number) {
  const finalFailure = attemptCount >= maxAttempts;

  await prisma.automationRun.update({
    where: { id },
    data: {
      attemptCount,
      lastAttemptAt: new Date(),
      nextAttemptAt: finalFailure ? new Date() : nextAttemptAt(attemptCount),
      status: finalFailure ? AutomationRunStatus.DEAD_LETTER : AutomationRunStatus.QUEUED,
      summary: message.slice(0, 1000)
    }
  });

  return finalFailure ? "deadLettered" : "retried";
}

type AutomationForRun = Prisma.AutomationGetPayload<{ include: { messageTemplate: true } }>;
type AutomationRunForExecution = Prisma.AutomationRunGetPayload<{ include: { automation: { include: { messageTemplate: true } } } }>;

async function claimAutomationRun(run: AutomationRunForExecution, attemptCount: number) {
  const claimed = await prisma.automationRun.updateMany({
    where: {
      id: run.id,
      status: AutomationRunStatus.QUEUED,
      attemptCount: run.attemptCount
    },
    data: {
      attemptCount,
      lastAttemptAt: new Date(),
      status: AutomationRunStatus.PROCESSING
    }
  });

  return claimed.count === 1;
}

export async function processAutomationRuns(options: ProcessAutomationRunsOptions = {}) {
  const limit = options.limit ?? 25;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const now = new Date();
  const runs = await prisma.automationRun.findMany({
    where: {
      ...(options.runIds?.length ? { id: { in: options.runIds } } : {}),
      status: AutomationRunStatus.QUEUED,
      nextAttemptAt: { lte: now },
      automation: {
        ...(options.siteId ? { siteId: options.siteId } : {}),
        action: { not: AutomationAction.SEND_WEBHOOK }
      }
    },
    include: { automation: { include: { messageTemplate: true } } },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  const result = {
    deadLettered: 0,
    failed: 0,
    processed: runs.length,
    retried: 0,
    skipped: 0,
    succeeded: 0
  };

  for (const run of runs) {
    const attemptCount = run.attemptCount + 1;
    const claimed = await claimAutomationRun(run, attemptCount);
    if (!claimed) {
      result.processed -= 1;
      continue;
    }

    try {
      const execution = await executeAutomationRun(run);
      const status = execution.status || AutomationRunStatus.SUCCEEDED;

      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status,
          summary: execution.summary.slice(0, 1000)
        }
      });
      if (status === AutomationRunStatus.SKIPPED) result.skipped += 1;
      else result.succeeded += 1;
    } catch (error) {
      const outcome = await failRun(run.id, error instanceof Error ? error.message : "Automation action failed.", attemptCount, maxAttempts);
      if (outcome === "deadLettered") {
        result.deadLettered += 1;
        result.failed += 1;
      } else {
        result.retried += 1;
      }
    }
  }

  return result;
}

export async function replayAutomationRun(runId: string, siteId: string) {
  const run = await prisma.automationRun.findFirst({
    where: {
      id: runId,
      automation: { siteId },
      status: AutomationRunStatus.DEAD_LETTER
    },
    select: {
      automationId: true,
      payload: true,
      relatedId: true,
      relatedType: true,
      triggerKey: true
    }
  });

  if (!run) throw new Error("Replayable automation run not found.");

  const replay = await prisma.automationRun.create({
    data: {
      automationId: run.automationId,
      triggerKey: run.triggerKey,
      relatedType: run.relatedType,
      relatedId: run.relatedId,
      payload: run.payload as Prisma.InputJsonValue,
      replayOfRunId: runId,
      status: AutomationRunStatus.QUEUED,
      summary: "Replay queued."
    }
  });

  return processAutomationRuns({ runIds: [replay.id], siteId });
}
