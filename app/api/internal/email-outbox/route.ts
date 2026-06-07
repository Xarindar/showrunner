import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processEmailOutbox } from "@/lib/email";

export const dynamic = "force-dynamic";

function secretMatches(expected: string, provided: string) {
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WORKER_SECRET;
  const limit = Number(process.env.EMAIL_WORKER_LIMIT || 50);

  if (!secret) {
    return NextResponse.json({ error: "EMAIL_WORKER_SECRET is not configured." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || !secretMatches(secret, provided)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await processEmailOutbox({ limit });
  return NextResponse.json(result);
}
