import crypto from "node:crypto";
import { EmailProviderEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { recordProviderEvent } from "@/lib/email";

export const dynamic = "force-dynamic";

function secretMatches(expected: string, provided: string) {
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function headerSecret(request: Request) {
  return request.headers.get("x-email-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

function isProviderEventType(value: unknown): value is EmailProviderEventType {
  return typeof value === "string" && Object.values(EmailProviderEventType).includes(value as EmailProviderEventType);
}

function bodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_PROVIDER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "EMAIL_PROVIDER_WEBHOOK_SECRET is not configured." }, { status: 503 });
  }

  if (!secretMatches(secret, headerSecret(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = bodyObject(await request.json().catch(() => ({})));
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
