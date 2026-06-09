import crypto from "node:crypto";
import { AutomationStatus, Prisma, WebhookDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSafeExternalHttpsUrl } from "@/lib/security/urls";

const defaultMaxAttempts = 5;

export type QueueWebhookDeliveryInput = {
  automationId?: string;
  event: string;
  payload: Prisma.InputJsonObject;
  targetUrl: string;
  webhookEndpointId?: string;
};

export type ProcessWebhookDeliveryOptions = {
  limit?: number;
  maxAttempts?: number;
};

function webhookSignature(secret: string, timestamp: string, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function nextAttemptAt(attemptCount: number) {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function deliveryPayload(value: Prisma.JsonValue) {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

export async function queueWebhookDelivery(input: QueueWebhookDeliveryInput) {
  return prisma.webhookDelivery.create({
    data: {
      automationId: input.automationId,
      event: input.event,
      payload: input.payload,
      targetUrl: input.targetUrl,
      webhookEndpointId: input.webhookEndpointId,
      status: WebhookDeliveryStatus.PENDING,
      nextAttemptAt: new Date()
    }
  });
}

async function failDelivery(id: string, message: string, attemptCount: number, maxAttempts: number, statusCode?: number) {
  const finalFailure = attemptCount >= maxAttempts;

  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      attemptCount,
      errorMessage: message,
      lastAttemptAt: new Date(),
      nextAttemptAt: finalFailure ? new Date() : nextAttemptAt(attemptCount),
      status: finalFailure ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
      statusCode
    }
  });

  return finalFailure ? "failed" : "retry";
}

export async function processWebhookDeliveries(options: ProcessWebhookDeliveryOptions = {}) {
  const limit = options.limit ?? 25;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const now = new Date();
  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PENDING,
      nextAttemptAt: { lte: now }
    },
    include: {
      automation: true,
      webhookEndpoint: true
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  const result = {
    delivered: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    total: deliveries.length
  };

  for (const delivery of deliveries) {
    const attemptCount = delivery.attemptCount + 1;
    const targetUrl = delivery.targetUrl || delivery.webhookEndpoint?.url || delivery.automation?.webhookUrl || "";
    const signingSecret = delivery.webhookEndpoint?.signingSecret || delivery.automation?.webhookSigningSecret || "";

    if (delivery.webhookEndpoint && delivery.webhookEndpoint.status !== AutomationStatus.ACTIVE) {
      await failDelivery(delivery.id, "Webhook endpoint is not active.", attemptCount, maxAttempts);
      result.skipped += 1;
      continue;
    }

    if (delivery.automation && delivery.automation.status !== AutomationStatus.ACTIVE) {
      await failDelivery(delivery.id, "Automation rule is not active.", attemptCount, maxAttempts);
      result.skipped += 1;
      continue;
    }

    if (!signingSecret) {
      await failDelivery(delivery.id, "Missing signing secret.", maxAttempts, maxAttempts);
      result.failed += 1;
      continue;
    }

    if (!isSafeExternalHttpsUrl(targetUrl)) {
      await failDelivery(delivery.id, "Webhook URL is not a public https URL.", maxAttempts, maxAttempts);
      result.failed += 1;
      continue;
    }

    const body = JSON.stringify(deliveryPayload(delivery.payload));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = webhookSignature(signingSecret, timestamp, body);

    try {
      const response = await fetch(targetUrl, {
        body,
        headers: {
          "content-type": "application/json",
          "x-showrunner-delivery": delivery.id,
          "x-showrunner-event": delivery.event,
          "x-showrunner-signature": `t=${timestamp},v1=${signature}`
        },
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attemptCount,
            deliveredAt: new Date(),
            errorMessage: "",
            lastAttemptAt: new Date(),
            status: WebhookDeliveryStatus.DELIVERED,
            statusCode: response.status
          }
        });
        result.delivered += 1;
      } else {
        const outcome = await failDelivery(delivery.id, `HTTP ${response.status}`, attemptCount, maxAttempts, response.status);
        if (outcome === "failed") result.failed += 1;
        else result.retried += 1;
      }
    } catch (error) {
      const outcome = await failDelivery(
        delivery.id,
        error instanceof Error ? error.message : "Webhook dispatch failed.",
        attemptCount,
        maxAttempts
      );
      if (outcome === "failed") result.failed += 1;
      else result.retried += 1;
    }
  }

  return result;
}
