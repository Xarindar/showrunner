import { NextResponse } from "next/server";
import { bearerToken, timingSafeSecretMatches } from "@/lib/api/secrets";
import { sweepAbandonedCarts } from "@/lib/commerce/abandoned-carts";

export async function POST(request: Request) {
  const secret = process.env.ABANDONED_CART_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "ABANDONED_CART_WORKER_SECRET is not configured." }, { status: 503 });
  }

  if (!timingSafeSecretMatches(secret, bearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await sweepAbandonedCarts();
  return NextResponse.json(result);
}
