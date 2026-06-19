import type { PaymentProvider } from "@prisma/client";

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

export type PaymentGatewayRefundInput = {
  amountCents?: number;
  paymentId: string;
  siteId: string;
};

export type PaymentGateway = {
  provider: PaymentProvider;
  createCheckoutSession(input: PaymentGatewayCheckoutInput): Promise<PaymentGatewayCheckoutSession>;
  handleWebhookEvent(event: unknown): Promise<unknown>;
  refund(input: PaymentGatewayRefundInput): Promise<unknown>;
  supportedWallets(siteId?: string): Promise<PaymentWallet[]>;
  verifyWebhook(input: PaymentGatewayWebhookInput): Promise<unknown> | unknown;
};
