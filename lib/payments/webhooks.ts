import { PaymentProvider } from "@prisma/client";
import { getPaymentGateway } from "./registry";

export function constructPaymentWebhookEvent(input: {
  provider?: PaymentProvider;
  rawBody: string;
  signature: string | null;
}) {
  return getPaymentGateway(input.provider || PaymentProvider.STRIPE).verifyWebhook({
    rawBody: input.rawBody,
    signature: input.signature
  });
}

export async function handlePaymentWebhookEvent(input: {
  event: unknown;
  provider?: PaymentProvider;
}) {
  return getPaymentGateway(input.provider || PaymentProvider.STRIPE).handleWebhookEvent(input.event);
}
