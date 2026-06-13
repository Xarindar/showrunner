import { NextResponse } from "next/server";
import { bearerToken, timingSafeSecretMatches } from "@/lib/api/secrets";
import { sweepBookingReminders } from "@/lib/scheduling/booking-reminders";

export async function POST(request: Request) {
  const secret = process.env.BOOKING_REMINDER_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "BOOKING_REMINDER_WORKER_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, bearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await sweepBookingReminders();
  return NextResponse.json(result);
}
