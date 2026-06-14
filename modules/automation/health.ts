import "server-only";

import { AutomationRunStatus, AutomationStatus, WebhookDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { envLooksDefault, warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings, now }) => {
  const warnings = [];
  const [
    activeAutomationCount,
    automationRunCount,
    queuedAutomationRunCount,
    deadLetterRunCount,
    pendingWebhookDeliveryCount,
    failedWebhookDeliveryCount
  ] = await Promise.all([
    prisma.automation.count({ where: { siteId: settings.siteId, status: AutomationStatus.ACTIVE } }),
    prisma.automationRun.count({ where: { automation: { siteId: settings.siteId } } }),
    prisma.automationRun.count({
      where: { automation: { siteId: settings.siteId }, status: AutomationRunStatus.QUEUED, nextAttemptAt: { lte: now } }
    }),
    prisma.automationRun.count({ where: { automation: { siteId: settings.siteId }, status: AutomationRunStatus.DEAD_LETTER } }),
    prisma.webhookDelivery.count({
      where: {
        status: WebhookDeliveryStatus.PENDING,
        nextAttemptAt: { lte: now },
        OR: [{ automation: { siteId: settings.siteId } }, { webhookEndpoint: { siteId: settings.siteId } }]
      }
    }),
    prisma.webhookDelivery.count({
      where: {
        status: WebhookDeliveryStatus.FAILED,
        OR: [{ automation: { siteId: settings.siteId } }, { webhookEndpoint: { siteId: settings.siteId } }]
      }
    })
  ]);

  if (envLooksDefault(process.env.WEBHOOK_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET)) {
    warnings.push(
      warning(
        "Webhook worker secret needs setup",
        "Set WEBHOOK_WORKER_SECRET and provision the scheduled webhook delivery worker before relying on queued outbound webhooks.",
        "warning",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  if (failedWebhookDeliveryCount > 0) {
    warnings.push(
      warning(
        "Failed webhook deliveries",
        `${failedWebhookDeliveryCount} webhook deliver${failedWebhookDeliveryCount === 1 ? "y has" : "ies have"} failed and need review.`,
        "warning",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  if (deadLetterRunCount > 0) {
    warnings.push(
      warning(
        "Automation runs need replay",
        `${deadLetterRunCount} automation run${deadLetterRunCount === 1 ? " has" : "s have"} dead-lettered and can be replayed from run history.`,
        "warning",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  if (queuedAutomationRunCount > 0) {
    warnings.push(
      warning(
        "Automation runs waiting",
        `${queuedAutomationRunCount} automation run${queuedAutomationRunCount === 1 ? " is" : "s are"} ready for the worker to process.`,
        "info",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  if (pendingWebhookDeliveryCount > 0) {
    warnings.push(
      warning(
        "Webhook deliveries waiting",
        `${pendingWebhookDeliveryCount} webhook deliver${pendingWebhookDeliveryCount === 1 ? "y is" : "ies are"} ready for the worker to process.`,
        "info",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  if (activeAutomationCount > 0 || automationRunCount > 0) {
    warnings.push(
      warning(
        "Automation is mixed",
        "Module events match active rules, execute non-webhook actions, queue signed SEND_WEBHOOK deliveries, and still depend on production worker scheduling for retries.",
        "info",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  return warnings;
};
