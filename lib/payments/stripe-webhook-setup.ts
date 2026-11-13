import "server-only";
import Stripe from "stripe";
import { publicAppBaseUrl } from "@/lib/env";

const events: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.expired", "payment_intent.payment_failed", "charge.refunded"
];

export async function provisionStripeWebhook(stripe: Stripe, previous: { id: string; secret: string } | null) {
  const url = `${publicAppBaseUrl().replace(/\/$/, "")}/api/webhooks/stripe`;
  if (new URL(url).protocol !== "https:") throw new Error("Stripe needs a public HTTPS Showrunner address for payment updates. Configure the deployment address, then try again.");
  if (previous) {
    try {
      const endpoint = await stripe.webhookEndpoints.retrieve(previous.id);
      if (endpoint.url === url && endpoint.status === "enabled") {
        await stripe.webhookEndpoints.update(previous.id, { enabled_events: events });
        return { ...previous, created: false };
      }
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeError) || error.statusCode !== 404) throw error;
    }
  }
  const endpoint = await stripe.webhookEndpoints.create({ description: "Showrunner payment updates", enabled_events: events, url });
  if (!endpoint.secret) throw new Error("Stripe did not return a webhook signing secret.");
  return { id: endpoint.id, secret: endpoint.secret, created: true };
}
