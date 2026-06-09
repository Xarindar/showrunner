import { NextResponse } from "next/server";
import { positiveIntegerEnv } from "@/lib/env";
import { processWebhookDeliveries } from "@/lib/events/webhook-delivery";
import { bearerToken, timingSafeSecretMatches } from "@/lib/api/secrets";

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "WEBHOOK_WORKER_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, bearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await processWebhookDeliveries({ limit: positiveIntegerEnv("WEBHOOK_WORKER_LIMIT", 25) });
  return NextResponse.json(result);
}
