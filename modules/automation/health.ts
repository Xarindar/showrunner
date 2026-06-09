import "server-only";

import { AutomationStatus, WebhookDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { envLooksDefault, warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ now }) => {
  const warnings = [];
  const [activeAutomationCount, manualAutomationRunCount, pendingWebhookDeliveryCount, failedWebhookDeliveryCount] = await Promise.all([
    prisma.automation.count({ where: { status: AutomationStatus.ACTIVE } }),
    prisma.automationRun.count(),
    prisma.webhookDelivery.count({ where: { status: WebhookDeliveryStatus.PENDING, nextAttemptAt: { lte: now } } }),
    prisma.webhookDelivery.count({ where: { status: WebhookDeliveryStatus.FAILED } })
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

  if (activeAutomationCount > 0 || manualAutomationRunCount > 0) {
    warnings.push(
      warning(
        "Automation is mixed",
        "Module events now match active rules and queue signed SEND_WEBHOOK deliveries; non-webhook action executors and replay/dead-letter UI are still pending.",
        "info",
        "automation",
        "/admin/modules/automation"
      )
    );
  }

  return warnings;
};
