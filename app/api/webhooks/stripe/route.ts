import { NextRequest } from "next/server";
import { constructPaymentWebhookEvent, handlePaymentWebhookEvent } from "@/lib/payments/webhooks";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const event = await constructPaymentWebhookEvent({ rawBody, signature });
    await handlePaymentWebhookEvent({ event });
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
