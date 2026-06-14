import "server-only";

import crypto from "node:crypto";
import {
  AnalyticsEventType,
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  Prisma,
  WebhookDeliveryStatus
} from "@prisma/client";
import { cookies, headers } from "next/headers";
import { moduleEventCatalog, type ModuleEventName } from "@/lib/events/catalog";
import { queueWebhookDelivery } from "@/lib/events/webhook-delivery";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { queueCommunicationsEventEmails } from "@/modules/communications/auto-send";

type SearchParams = Record<string, string | string[] | undefined>;

export type EventAttribution = {
  campaign?: string;
  landingPage?: string;
  medium?: string;
  pathname?: string;
  referrer?: string;
  sessionId?: string;
  source?: string;
  trackingConsent?: string;
  visitorId?: string;
};

export type EmitModuleEventInput = EventAttribution & {
  actorEmail?: string;
  currency?: string;
  dedupeWindowMinutes?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  relatedId?: string;
  relatedType?: string;
  valueCents?: number;
};

export type EmitAnalyticsEventInput = EmitModuleEventInput & {
  eventName: string;
  eventType: AnalyticsEventType;
};

type EventEnvelope = Required<Pick<EmitModuleEventInput, "metadata">> &
  EventAttribution & {
    actorEmail: string;
    currency: string;
    eventId: string;
    name: string;
    occurredAt: string;
    relatedId: string;
    relatedType: string;
    siteId: string;
    valueCents?: number;
  };

type AnalyticsEventDefinition = {
  analyticsEventName: string;
  analyticsEventType: AnalyticsEventType;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return String(value);
  }
}

function firstParam(searchParams: SearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function compactMetadata(metadata?: Record<string, unknown>) {
  const json: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(metadata || {})) {
    if (value === undefined || value === "") continue;
    const jsonValue = toJsonValue(value);
    if (jsonValue !== undefined) json[key] = jsonValue;
  }

  return json as Prisma.InputJsonObject;
}

function sourceFromReferrer(referrer: string) {
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function requestAttribution(searchParams?: SearchParams, pathname = ""): Promise<EventAttribution> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const referrer = headerStore.get("referer") || "";
  const trackingConsent = headerStore.get("x-showrunner-consent") || cookieStore.get("sr_tracking_consent")?.value || "unset";

  if (trackingConsent === "denied") {
    return {
      landingPage: pathname,
      pathname,
      trackingConsent
    };
  }

  const visitorId = firstParam(searchParams, "sr_visitor") || headerStore.get("x-showrunner-visitor") || cookieStore.get("sr_visitor")?.value || "";
  const sessionId = firstParam(searchParams, "sr_session") || headerStore.get("x-showrunner-session") || cookieStore.get("sr_session")?.value || "";
  const source =
    firstParam(searchParams, "utm_source") ||
    headerStore.get("x-showrunner-source") ||
    cookieStore.get("sr_last_source")?.value ||
    cookieStore.get("sr_first_source")?.value ||
    sourceFromReferrer(referrer);
  const medium =
    firstParam(searchParams, "utm_medium") ||
    headerStore.get("x-showrunner-medium") ||
    cookieStore.get("sr_last_medium")?.value ||
    cookieStore.get("sr_first_medium")?.value ||
    (source ? "referral" : "");

  return {
    campaign:
      firstParam(searchParams, "utm_campaign") ||
      headerStore.get("x-showrunner-campaign") ||
      cookieStore.get("sr_last_campaign")?.value ||
      cookieStore.get("sr_first_campaign")?.value ||
      "",
    landingPage:
      firstParam(searchParams, "utm_landing") ||
      headerStore.get("x-showrunner-landing") ||
      cookieStore.get("sr_landing_page")?.value ||
      pathname,
    medium,
    pathname,
    referrer,
    sessionId,
    source,
    trackingConsent,
    visitorId
  };
}

function conditionValue(envelope: EventEnvelope, key: string) {
  if (key in envelope) return String(envelope[key as keyof EventEnvelope] || "");
  const metadataValue = envelope.metadata[key];
  return metadataValue === undefined || metadataValue === null ? "" : String(metadataValue);
}

function matchesConditions(conditions: Prisma.JsonValue, envelope: EventEnvelope) {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return true;

  for (const [key, expected] of Object.entries(conditions)) {
    if (!key) continue;
    if (conditionValue(envelope, key) !== String(expected || "")) return false;
  }

  return true;
}

async function recordAnalyticsEvent(envelope: EventEnvelope, definition: AnalyticsEventDefinition, dedupeWindowMinutes = 0) {
  if (dedupeWindowMinutes > 0) {
    const occurredAfter = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000);
    const identityWhere = envelope.visitorId
      ? { visitorId: envelope.visitorId }
      : envelope.sessionId
        ? { sessionId: envelope.sessionId }
        : envelope.actorEmail
          ? { clientEmail: envelope.actorEmail }
          : undefined;

    if (identityWhere) {
      const existing = await prisma.analyticsEvent.findFirst({
        where: {
          siteId: envelope.siteId,
          ...identityWhere,
          eventName: definition.analyticsEventName,
          eventType: definition.analyticsEventType,
          occurredAt: { gte: occurredAfter },
          pathname: envelope.pathname || "",
          relatedId: envelope.relatedId,
          relatedType: envelope.relatedType
        },
        select: { id: true }
      });

      if (existing) return;
    }
  }

  await prisma.analyticsEvent.create({
    data: {
      siteId: envelope.siteId,
      eventType: definition.analyticsEventType,
      eventName: definition.analyticsEventName,
      source: envelope.source || "",
      medium: envelope.medium || "",
      campaign: envelope.campaign || "",
      landingPage: envelope.landingPage || "",
      referrer: envelope.referrer || "",
      pathname: envelope.pathname || "",
      sessionId: envelope.sessionId || "",
      visitorId: envelope.visitorId || "",
      clientEmail: envelope.actorEmail,
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      valueCents: envelope.valueCents,
      currency: envelope.currency,
      metadata: {
        ...envelope.metadata,
        consentMode: envelope.trackingConsent === "denied" ? "denied_server_event" : "server_event",
        trackingConsent: envelope.trackingConsent || "unset"
      }
    }
  });
}

function automationRunSummary(action: AutomationAction, eventName: ModuleEventName, queued = false) {
  if (action === AutomationAction.SEND_WEBHOOK) {
    return queued
      ? `Matched ${eventName}. Signed webhook delivery was queued for this automation rule.`
      : `Matched ${eventName}. No webhook URL is configured, so no delivery was queued.`;
  }

  return queued
    ? `Matched ${eventName}. ${action.toLowerCase()} action was queued for execution.`
    : `Matched ${eventName}. ${action.toLowerCase()} action was not queued.`;
}

async function ensureAutomationWebhookSecret(automation: { id: string; webhookSigningSecret: string }) {
  if (automation.webhookSigningSecret) return automation.webhookSigningSecret;

  const webhookSigningSecret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  await prisma.automation.update({
    where: { id: automation.id },
    data: { webhookSigningSecret }
  });

  return webhookSigningSecret;
}

async function recordMatchedAutomationRuns(eventName: ModuleEventName, envelope: EventEnvelope) {
  const definition = moduleEventCatalog[eventName];
  const automations = await prisma.automation.findMany({
    where: {
      siteId: envelope.siteId,
      status: AutomationStatus.ACTIVE,
      trigger: definition.automationTrigger
    }
  });
  for (const automation of automations) {
    if (!matchesConditions(automation.conditions, envelope)) continue;

    const webhookUrl = automation.webhookUrl || "";

    if (automation.action === AutomationAction.SEND_WEBHOOK && webhookUrl) {
      await ensureAutomationWebhookSecret({
        id: automation.id,
        webhookSigningSecret: automation.webhookSigningSecret
      });
      const body = JSON.stringify(envelope);
      const payload = JSON.parse(body) as Prisma.InputJsonObject;

      await prisma.$transaction(async (tx) => {
        await tx.automationRun.create({
          data: {
            automationId: automation.id,
            status: AutomationRunStatus.QUEUED,
            triggerKey: eventName,
            relatedType: envelope.relatedType,
            relatedId: envelope.relatedId,
            summary: automationRunSummary(automation.action, eventName, true)
          }
        });
        await tx.webhookDelivery.create({
          data: {
            automationId: automation.id,
            event: eventName,
            payload,
            status: WebhookDeliveryStatus.PENDING,
            targetUrl: webhookUrl
          }
        });
        await tx.automation.update({
          where: { id: automation.id },
          data: { lastRunAt: new Date() }
        });
      });
      continue;
    }

    const payload = JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonObject;
    await prisma.$transaction(async (tx) => {
      await tx.automationRun.create({
        data: {
          automationId: automation.id,
          status: AutomationRunStatus.QUEUED,
          triggerKey: eventName,
          relatedType: envelope.relatedType,
          relatedId: envelope.relatedId,
          summary: automationRunSummary(automation.action, eventName, true),
          payload,
          nextAttemptAt: new Date()
        }
      });
      await tx.automation.update({
        where: { id: automation.id },
        data: { lastRunAt: new Date() }
      });
    });
  }
}

function endpointEvents(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function queueSubscribedWebhookEndpoints(envelope: EventEnvelope) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { siteId: envelope.siteId, status: AutomationStatus.ACTIVE }
  });
  const subscribed = endpoints.filter((endpoint) => endpointEvents(endpoint.events).includes(envelope.name));
  const body = JSON.stringify(envelope);
  const payload = JSON.parse(body) as Prisma.InputJsonObject;

  await Promise.all(
    subscribed.map((endpoint) =>
      queueWebhookDelivery({
        event: envelope.name,
        targetUrl: endpoint.url,
        payload,
        webhookEndpointId: endpoint.id
      })
    )
  );
}

export async function emitModuleEvent(name: ModuleEventName, input: EmitModuleEventInput = {}) {
  const definition = moduleEventCatalog[name];
  const siteId = await getCurrentSiteId();
  const envelope: EventEnvelope = {
    actorEmail: input.actorEmail || "",
    campaign: input.campaign || "",
    currency: input.currency || "USD",
    eventId: input.idempotencyKey || crypto.randomUUID(),
    landingPage: input.landingPage || "",
    medium: input.medium || "",
    metadata: compactMetadata(input.metadata),
    name,
    occurredAt: new Date().toISOString(),
    pathname: input.pathname || "",
    referrer: input.referrer || "",
    relatedId: input.relatedId || "",
    relatedType: input.relatedType || definition.relatedType,
    siteId,
    sessionId: input.sessionId || "",
    source: input.source || "",
    trackingConsent: input.trackingConsent || "unset",
    valueCents: input.valueCents,
    visitorId: input.visitorId || ""
  };

  const results = await Promise.allSettled([
    recordAnalyticsEvent(envelope, definition, input.dedupeWindowMinutes),
    queueCommunicationsEventEmails(name, envelope),
    recordMatchedAutomationRuns(name, envelope),
    queueSubscribedWebhookEndpoints(envelope)
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[events:emit-failed]", name, result.reason);
    }
  }
}

export async function emitAnalyticsEvent(input: EmitAnalyticsEventInput) {
  const siteId = await getCurrentSiteId();
  const envelope: EventEnvelope = {
    actorEmail: input.actorEmail || "",
    campaign: input.campaign || "",
    currency: input.currency || "USD",
    eventId: input.idempotencyKey || crypto.randomUUID(),
    landingPage: input.landingPage || "",
    medium: input.medium || "",
    metadata: compactMetadata(input.metadata),
    name: input.eventName,
    occurredAt: new Date().toISOString(),
    pathname: input.pathname || "",
    referrer: input.referrer || "",
    relatedId: input.relatedId || "",
    relatedType: input.relatedType || "",
    siteId,
    sessionId: input.sessionId || "",
    source: input.source || "",
    trackingConsent: input.trackingConsent || "unset",
    valueCents: input.valueCents,
    visitorId: input.visitorId || ""
  };

  await recordAnalyticsEvent(
    envelope,
    {
      analyticsEventName: input.eventName,
      analyticsEventType: input.eventType
    },
    input.dedupeWindowMinutes
  );
}
