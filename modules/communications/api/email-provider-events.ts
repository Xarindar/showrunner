import { EmailProviderEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { recordProviderEvent } from "@/lib/email";
import { recordFromUnknown } from "@/lib/objects";
import { headerOrBearerSecret, timingSafeSecretMatches } from "@/lib/api/secrets";

function isProviderEventType(value: unknown): value is EmailProviderEventType {
  return typeof value === "string" && Object.values(EmailProviderEventType).includes(value as EmailProviderEventType);
}

function bodyString(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function normalizeProviderEventType(value: unknown) {
  if (isProviderEventType(value)) return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toUpperCase().replace(/[\s.-]+/g, "_");
  const aliases: Record<string, EmailProviderEventType> = {
    BOUNCE: EmailProviderEventType.BOUNCED,
    BOUNCED: EmailProviderEventType.BOUNCED,
    CLICK: EmailProviderEventType.CLICKED,
    CLICKED: EmailProviderEventType.CLICKED,
    COMPLAINT: EmailProviderEventType.COMPLAINED,
    COMPLAINED: EmailProviderEventType.COMPLAINED,
    DEFERRED: EmailProviderEventType.DELIVERY_DELAYED,
    DELAYED: EmailProviderEventType.DELIVERY_DELAYED,
    DELIVERED: EmailProviderEventType.DELIVERED,
    DELIVERY_DELAY: EmailProviderEventType.DELIVERY_DELAYED,
    DELIVERY_DELAYED: EmailProviderEventType.DELIVERY_DELAYED,
    OPEN: EmailProviderEventType.OPENED,
    OPENED: EmailProviderEventType.OPENED,
    PROCESSED: EmailProviderEventType.ACCEPTED,
    SENT: EmailProviderEventType.ACCEPTED,
    UNSUBSCRIBE: EmailProviderEventType.UNSUBSCRIBED,
    UNSUBSCRIBED: EmailProviderEventType.UNSUBSCRIBED
  };

  return aliases[normalized];
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_PROVIDER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "EMAIL_PROVIDER_WEBHOOK_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, headerOrBearerSecret(request, "x-email-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = recordFromUnknown(await request.json().catch(() => ({})));
  const providerMessageId = bodyString(body, ["providerMessageId", "messageId", "message_id", "provider_message_id", "sg_message_id"]);
  const eventType = normalizeProviderEventType(body.eventType || body.event || body.type || body.event_type);

  if (!providerMessageId || !eventType) {
    return NextResponse.json({ error: "providerMessageId and eventType are required." }, { status: 400 });
  }

  await recordProviderEvent({
    providerMessageId,
    eventType,
    eventKey: bodyString(body, ["eventId", "event_id", "eventKey", "event_key"]) || undefined,
    payload: body.payload || body
  });

  return NextResponse.json({ ok: true });
}
