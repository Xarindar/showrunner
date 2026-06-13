import { PaymentProvider, Prisma } from "@prisma/client";
import { getPaymentGateway, resolvePaymentProviderForSite } from "./registry";

type OrderCheckoutResult = Prisma.OrderGetPayload<{ include: { payments: true } }>;

export async function createPaymentCheckoutSessionForOrder(input: {
  orderId: string;
  provider?: PaymentProvider;
  siteId?: string;
}): Promise<OrderCheckoutResult> {
  const provider = input.siteId ? await resolvePaymentProviderForSite(input.siteId, input.provider) : input.provider || PaymentProvider.STRIPE;
  const gateway = getPaymentGateway(provider);
  const session = await gateway.createCheckoutSession({
    kind: "order",
    orderId: input.orderId,
    siteId: input.siteId
  });

  if (!session.order) throw new Error(`${gateway.provider} did not return an order checkout result.`);
  return session.order as OrderCheckoutResult;
}

export async function createPaymentCheckoutSessionForBillingDocument(input: {
  amountCents: number;
  billingDocumentId: string;
  provider?: PaymentProvider;
  siteId?: string;
}) {
  const provider = input.siteId ? await resolvePaymentProviderForSite(input.siteId, input.provider) : input.provider || PaymentProvider.STRIPE;
  const gateway = getPaymentGateway(provider);
  const session = await gateway.createCheckoutSession({
    amountCents: input.amountCents,
    billingDocumentId: input.billingDocumentId,
    kind: "billing_document",
    siteId: input.siteId
  });

  return {
    checkoutUrl: session.checkoutUrl,
    paymentId: session.paymentId || ""
  };
}
