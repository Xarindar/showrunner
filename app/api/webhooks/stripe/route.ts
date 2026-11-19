import { PaymentProvider } from "@prisma/client";
import { receivePaymentWebhook } from "@/lib/payments/webhooks";

export function POST(request: Request) {
  return receivePaymentWebhook(request, PaymentProvider.STRIPE);
}
