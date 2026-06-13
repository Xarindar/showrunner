import { PaymentProvider } from "@prisma/client";
import { getPaymentGateway } from "./registry";

export async function constructPaymentWebhookEvent(input: {
  headers?: Headers;
  provider?: PaymentProvider;
  rawBody: string;
  signature: string | null;
}) {
  return await getPaymentGateway(input.provider || PaymentProvider.STRIPE).verifyWebhook({
    headers: input.headers,
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
