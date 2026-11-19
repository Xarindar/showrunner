import type { PaymentProvider } from "@prisma/client";
import type { BillingRefundObservation } from "@/lib/billing/refund-ledger";

export type PaymentWallet = "APPLE_PAY" | "GOOGLE_PAY" | "CASH_APP_PAY";

export type PaymentGatewayCheckoutInput =
  | {
      kind: "order";
      orderId: string;
      siteId?: string;
    }
  | {
      amountCents: number;
      billingDocumentId: string;
      kind: "billing_document";
      siteId?: string;
      recoveryOnly?: boolean;
    };

export type PaymentGatewayCheckoutSession = {
  checkoutUrl: string;
  order?: unknown;
  paymentId?: string;
  provider: PaymentProvider;
};

export type PaymentGatewayWebhookInput = {
  headers?: Headers;
  rawBody: string;
  signature: string | null;
  siteId?: string;
};

export type VerifiedPaymentWebhook = {
  event: unknown;
  siteId: string;
  environment: string;
};

export type PaymentGatewayRefundInput = {
  amountCents?: number;
  paymentId: string;
  siteId: string;
};

export type GatewayBillingRefundInput = {
  amountCents: number;
  captureId: string;
  currency: string;
  externalRefundId: string | null;
  requestId: string;
  siteId: string;
};

export type PaymentGateway = {
  provider: PaymentProvider;
  createCheckoutSession(input: PaymentGatewayCheckoutInput): Promise<PaymentGatewayCheckoutSession>;
  handleWebhookEvent(input: VerifiedPaymentWebhook): Promise<unknown>;
  refund(input: PaymentGatewayRefundInput): Promise<unknown>;
  refundBilling(input: GatewayBillingRefundInput): Promise<BillingRefundObservation>;
  supportedWallets(siteId?: string): Promise<PaymentWallet[]>;
  verifyWebhook(input: PaymentGatewayWebhookInput): Promise<VerifiedPaymentWebhook>;
};
