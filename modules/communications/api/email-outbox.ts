import { NextResponse } from "next/server";
import { positiveIntegerEnv } from "@/lib/env";
import { processEmailOutbox } from "@/lib/email";
import { bearerToken, timingSafeSecretMatches } from "@/lib/api/secrets";

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WORKER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "EMAIL_WORKER_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, bearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await processEmailOutbox({ limit: positiveIntegerEnv("EMAIL_WORKER_LIMIT", 50) });
  return NextResponse.json(result);
}
