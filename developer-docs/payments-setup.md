# Payment setup and operational boundaries

Showrunner's payment integration is implemented in `lib/payments/` and `modules/payments/`. Open `/admin/modules/payments` to configure a site. Credentials are stored encrypted in the database; do not put merchant API credentials in frontend code or commit them.

## Configuration

Set `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` to a strong dedicated value, distinct from `AUTH_SECRET` in production. Preserve it across releases or existing credentials cannot be decrypted. Set `NEXT_PUBLIC_APP_URL` to the canonical application origin.

For Stripe/Square OAuth onboarding, configure `ADMITONE_CONNECT_BASE_URL`, `ADMITONE_CONNECT_CLIENT_ID`, and `ADMITONE_CONNECT_SHARED_SECRET` for the external AdmitOne Connect broker. Without broker configuration, use credential entry. PayPal uses REST-app credentials and a webhook ID entered in admin. The broker handles onboarding; ordinary checkout, webhooks, refunds and Square refresh run through Showrunner's provider integration.

Stripe credentials are handed off from the broker. Showrunner exchanges Square's authorization code directly using its PKCE verifier and refreshes Square credentials directly. Pick the intended site-bound Square location after connecting.

## Webhooks and payment methods

The application exposes `/api/webhooks/stripe`, `/api/webhooks/square` and `/api/webhooks/paypal`. Stripe onboarding creates its webhook. Square requires its signature key and a subscription matching the notification URL; `SQUARE_WEBHOOK_NOTIFICATION_URL` can override the default app-origin URL. PayPal requires its configured webhook identity. Inspect provider handlers and onboarding code when changing event handling; never accept a browser return query as proof of payment.

Stripe method settings live in `lib/payments/methods.ts`. Card-backed Apple Pay/Google Pay, Cash App Pay, Klarna and Affirm depend on settings, provider account eligibility and checkout context. Do not promise every method appears for every customer. Connected status alone is not an end-to-end payment test.

## Worker and verification

Schedule `npm run payments:refresh-square` daily against the relevant database. It refreshes eligible OAuth credentials at a seven-day cadence and exits unsuccessfully for failed/reconnect-required or eight-day-stale connections. One deployment's worker does not cover unrelated databases automatically.

Verify sandbox checkout, webhook settlement, retries and applicable refund flows before enabling a new provider for a client. Do not create production charges as a release smoke test. Keep secrets out of logs, screenshots and deployment archives.

Billing document administration and manually attached hosted checkout links exist, but `/billing/[token]` and PDF/print routes are absent. Customer document-link emails are unavailable until a real public document route is implemented. Public commerce checkout and client-gallery extra-image checkout are separate implemented flows.

## Source map

- `lib/payments/connect/`: broker handoff, credential exchange and Square refresh.
- `lib/payments/credentials.ts`, `credential-crypto.ts`: site credentials and encryption.
- `lib/payments/checkout.ts`, `refunds.ts`, `webhooks.ts`: provider orchestration.
- `app/api/webhooks/`: provider-facing handlers.
- `modules/payments/page.tsx`, `actions.ts`: setup and management.
- `scripts/refresh-square-tokens.ts`: scheduled refresh entrypoint.
