import { NextResponse } from "next/server";
import { sweepAnalyticsRetention } from "@/lib/analytics/retention";
import { bearerToken, timingSafeSecretMatches } from "@/lib/api/secrets";

export async function POST(request: Request) {
  const secret = process.env.ANALYTICS_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "ANALYTICS_WORKER_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, bearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await sweepAnalyticsRetention();
  return NextResponse.json(result);
}
