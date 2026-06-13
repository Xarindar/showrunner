import { PaymentProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { constructPaymentWebhookEvent, handlePaymentWebhookEvent } from "@/lib/payments/webhooks";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  try {
    const event = constructPaymentWebhookEvent({ provider: PaymentProvider.SQUARE, rawBody, signature });
    await handlePaymentWebhookEvent({ event, provider: PaymentProvider.SQUARE });
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Square webhook failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
