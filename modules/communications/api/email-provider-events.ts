import { EmailProviderEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { recordProviderEvent } from "@/lib/email";
import { recordFromUnknown } from "@/lib/objects";
import { headerOrBearerSecret, timingSafeSecretMatches } from "@/lib/api/secrets";

function isProviderEventType(value: unknown): value is EmailProviderEventType {
  return typeof value === "string" && Object.values(EmailProviderEventType).includes(value as EmailProviderEventType);
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
  const providerMessageId = typeof body.providerMessageId === "string" ? body.providerMessageId.trim() : "";
  const eventType = body.eventType;

  if (!providerMessageId || !isProviderEventType(eventType)) {
    return NextResponse.json({ error: "providerMessageId and eventType are required." }, { status: 400 });
  }

  await recordProviderEvent({
    providerMessageId,
    eventType,
    eventKey: typeof body.eventId === "string" ? body.eventId : typeof body.eventKey === "string" ? body.eventKey : undefined,
    payload: body.payload || body
  });

  return NextResponse.json({ ok: true });
}
