# Payment setup and operational boundaries

Showrunner's payment integration is implemented in `lib/payments/` and `modules/payments/`. Open `/admin/modules/payments` to configure a site. Credentials are stored encrypted in the database; do not put merchant API credentials in frontend code or commit them.

## Required independence and automatic setup

Product decision, 2026-10-25: normal client setup must be sign-in-and-approve, with no copied API keys or webhook secrets. After setup, Showrunner must operate without Admit One Connect. Removing HTTP calls to the broker alone does not establish independence from the provider application's authority.

The deployed flow is not yet proof of that final contract. Stripe OAuth disconnect calls `revokeStripeOAuthProvider`; Square renews directly but still uses the shared OAuth application ID. Stripe's checkout and payment-method helpers also fall back to `STRIPE_SECRET_KEY` when a site credential is absent; the independent design must fail closed for that site instead. Existing credential-entry support is an advanced/manual path, not the accepted normal onboarding experience.

Stripe's [managed API keys preview](https://docs.stripe.com/stripe-apps/api-authentication/managed-api-keys) is a candidate for automatic delivery of merchant-specific keys encrypted to each Showrunner. It requires preview access and explicit `api_key_write` app approval. Stripe documents a merchant choice to [retain managed keys on uninstall](https://docs.stripe.com/keys/managed-api-keys), but automatic removal of the provisioning app's authority and subsequent independent rotation remain unverified. Ordinary Stripe Apps OAuth requires the app developer's key for renewal and does not resolve this requirement. Do not advertise the candidate flow as implemented.

Cottage616 acceptance must include an isolated sandbox run with Connect unreachable and its config removed, a Showrunner restart, payment/refund settlement, renewal or replacement, and disconnect. Removing provisioning authority while retaining functional credentials is a separate required check. Live charges or deleting production apps are not acceptable outage tests.

## Configuration

Set `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` to a strong dedicated value, distinct from `AUTH_SECRET` in production. Preserve it across releases or existing credentials cannot be decrypted. Set `NEXT_PUBLIC_APP_URL` to the canonical application origin.

For Stripe/Square OAuth onboarding, configure `ADMITONE_CONNECT_BASE_URL`, `ADMITONE_CONNECT_CLIENT_ID`, and `ADMITONE_CONNECT_SHARED_SECRET` for the external AdmitOne Connect broker. Without broker configuration, use credential entry. PayPal uses REST-app credentials and a webhook ID entered in admin. The broker handles onboarding; ordinary checkout, webhooks, refunds and Square refresh run through Showrunner's provider integration.

Stripe credentials are handed off from the broker. Showrunner exchanges Square's authorization code directly using its PKCE verifier and refreshes Square credentials directly. A single active location is selected automatically; multiple locations require a choice (a valid previous choice is retained on reconnect).

## Webhooks and payment methods

The application exposes `/api/webhooks/stripe`, `/api/webhooks/square` and `/api/webhooks/paypal`. Stripe onboarding creates its webhook and reconnects reuse the saved endpoint and secret. Square OAuth needs no webhook key: Showrunner reads authenticated payment/refund updates directly every minute and routes only locally owned records through the existing settlement handlers. Payment confirmation can take about a minute. Existing manually configured Square webhooks remain supported; `SQUARE_WEBHOOK_NOTIFICATION_URL` can override their app-origin URL. PayPal requires its configured webhook identity. Never accept a browser return query as proof of payment.

Stripe method settings live in `lib/payments/methods.ts`. Card-backed Apple Pay/Google Pay, Cash App Pay, Klarna and Affirm depend on settings, provider account eligibility and checkout context. Do not promise every method appears for every customer. Connected status alone is not an end-to-end payment test.

## Worker and verification

Each production Node Showrunner starts automatic Square maintenance through `instrumentation.ts`. Railway services must remain awake. A Postgres advisory lock prevents replicas from processing the same site simultaneously. The loop refreshes tokens at the existing seven-day cadence, pages through updated payments/refunds, ignores unrelated POS sales, and advances its checkpoint only after both streams succeed. It re-reads a day of updates for eventual consistency and uses stable event IDs for deduplication. Failed runs retry next minute; Payments shows delayed updates after five minutes. Check logs for `[payments:square] maintenance failed` and monitor that warning.

No separate cron service is required. `npm run payments:refresh-square` remains available for existing deployments/operations; it is safe alongside automatic maintenance because refresh uses its own database lock. The optional worker must share the intended database and `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`. Nonpersistent/serverless hosting needs an external scheduler instead of the in-process loop.

Stripe still returns the merchant OAuth access token used by this integration, but labels that credential model deprecated. Do not replace it by distributing the unrestricted platform key to clients. Validate real OAuth exchange before broad rollout; a future Stripe migration needs a supported per-client credential model.

Verify sandbox checkout, webhook settlement, retries and applicable refund flows before enabling a new provider for a client. Do not create production charges as a release smoke test. Keep secrets out of logs, screenshots and deployment archives.

Billing document administration and manually attached hosted checkout links exist, but `/billing/[token]` and PDF/print routes are absent. Customer document-link emails are unavailable until a real public document route is implemented. Public commerce checkout and client-gallery extra-image checkout are separate implemented flows.

## Source map

- `lib/payments/connect/`: broker handoff, credential exchange and Square refresh.
- `lib/payments/credentials.ts`, `credential-crypto.ts`: site credentials and encryption.
- `lib/payments/checkout.ts`, `refunds.ts`, `webhooks.ts`: provider orchestration.
- `app/api/webhooks/`: provider-facing handlers.
- `modules/payments/page.tsx`, `actions.ts`: setup and management.
- `scripts/refresh-square-tokens.ts`: scheduled refresh entrypoint.
- `lib/payments/square-maintenance.ts`, `instrumentation.ts`: automatic per-deployment Square renewal and reconciliation.
