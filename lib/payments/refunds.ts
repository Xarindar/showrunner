import { PaymentProvider } from "@prisma/client";
import { getPaymentGateway } from "./registry";

export async function refundPaymentGatewayPayment(input: {
  amountCents?: number;
  paymentId: string;
  provider?: PaymentProvider;
  siteId: string;
}) {
  const gateway = getPaymentGateway(input.provider || PaymentProvider.STRIPE);
  return gateway.refund({
    amountCents: input.amountCents,
    paymentId: input.paymentId,
    siteId: input.siteId
  });
}
