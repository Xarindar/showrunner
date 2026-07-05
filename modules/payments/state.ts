export type PaymentActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

export const initialPaymentActionState: PaymentActionState = { status: "idle" };
