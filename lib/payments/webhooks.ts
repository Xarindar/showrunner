import { PaymentProvider } from "@prisma/client";
import { readBoundedText, RequestBodyTooLarge } from "@/lib/api/bounded-body";
import { getPaymentGateway } from "./registry";
import { PaymentWebhookRejected, paypalTransmissionHeaders } from "./webhook-auth";

const signatureHeader = {
  STRIPE: "stripe-signature",
  SQUARE: "x-square-hmacsha256-signature",
  PAYPAL: "paypal-transmission-sig"
};

export async function receivePaymentWebhook(request: Request, provider: keyof typeof signatureHeader) {
  const signature = request.headers.get(signatureHeader[provider]);
  if (!signature || (provider === PaymentProvider.PAYPAL &&
    Object.values(paypalTransmissionHeaders).some((header) => !request.headers.get(header)))) {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedText(request, 256 * 1024);
  } catch (error) {
    return Response.json({ error: "Invalid webhook body." }, { status: error instanceof RequestBodyTooLarge ? 413 : 400 });
  }

  const gateway = getPaymentGateway(provider);
  let verified;
  try {
    verified = await gateway.verifyWebhook({ rawBody, signature, headers: request.headers });
  } catch (error) {
    if (error instanceof PaymentWebhookRejected || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid webhook." }, { status: 400 });
    }
    console.error("[payments:webhook] verification unavailable", { provider });
    return Response.json({ error: "Webhook temporarily unavailable." }, { status: 503 });
  }
  try {
    await gateway.handleWebhookEvent(verified);
    return Response.json({ received: true });
  } catch {
    console.error("[payments:webhook] processing failed", { provider, siteId: verified.siteId });
    return Response.json({ error: "Webhook temporarily unavailable." }, { status: 503 });
  }
}
