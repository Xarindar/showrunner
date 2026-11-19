import type { PaymentProvider } from "@prisma/client";

const hostedCheckoutOrigins: Partial<Record<PaymentProvider, readonly string[]>> = {
  STRIPE: ["https://checkout.stripe.com"],
  SQUARE: ["https://square.link", "https://checkout.square.site"],
  PAYPAL: ["https://www.paypal.com", "https://www.sandbox.paypal.com"]
};

export function bookingHostedCheckoutUrl(value: string, provider: PaymentProvider) {
  const url = new URL(value);
  const configured = (process.env[`BOOKING_${provider}_CHECKOUT_ORIGINS`] || "").split(",").map((origin) => origin.trim());
  if (url.protocol !== "https:" || url.username || url.password ||
    ![...(hostedCheckoutOrigins[provider] || []), ...configured].includes(url.origin)) {
    throw new Error("Checkout link is unavailable.");
  }
  return url.href;
}
