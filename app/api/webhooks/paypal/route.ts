import { PaymentProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { constructPaymentWebhookEvent, handlePaymentWebhookEvent } from "@/lib/payments/webhooks";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    const event = await constructPaymentWebhookEvent({
      headers: request.headers,
      provider: PaymentProvider.PAYPAL,
      rawBody,
      signature: request.headers.get("paypal-transmission-sig")
    });
    await handlePaymentWebhookEvent({ event, provider: PaymentProvider.PAYPAL });
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PayPal webhook failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
