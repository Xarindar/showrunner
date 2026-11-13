# Payment setup and operational boundaries

Showrunner's payment integration is implemented in `lib/payments/` and `modules/payments/`. Open `/admin/modules/payments` to configure a site. Credentials are stored encrypted in the database; do not put merchant API credentials in frontend code or commit them.

## Client-owned setup

Payments opens a shared modal with one step at a time, Back beside progress, and Next in the footer. Each business uses its own Stripe, Square, or PayPal account. The wizard links directly to the provider dashboard, explains which credentials to copy, and keeps inputs empty until the owner types. Required fields block advancement. Saved secrets never return to the browser; Back retains the current draft only until the modal closes.

Stripe needs the merchant's secret or appropriately permissioned restricted key. Showrunner checks the account and creates its payment webhook using that key. Same-account, same-mode key rotation reuses a saved, enabled endpoint at the current deployment URL and retains payment-method preferences. Migration from legacy OAuth creates a new endpoint independent of the provisioning app. PayPal needs a client ID and secret from the owner's REST app; Showrunner obtains its own app token and creates or reuses that app's webhook. Stripe and PayPal require a public HTTPS deployment address. No webhook secret or ID needs to be copied in the normal flow.

Square needs the owner's personal production token or Sandbox token from their own Developer application. The wizard loads active locations and requires a choice if there is more than one. Final save verifies the selected location again; an invalid ID never silently falls back to another location. Payment and refund reconciliation uses the existing automatic maintenance loop, including for client-owned tokens, without a webhook or broker. Only legacy OAuth tokens run the OAuth renewal path.

Review offers Use this account for new checkouts. Credentials and that choice save in one database transaction. No charges are created during setup. Verification or persistence failures preserve saved credentials, and newly created Stripe/PayPal webhooks are removed if persistence fails. Done closes the success screen. Manage / Replace connection repeats this wizard; Disconnect removes local credentials. Finish outstanding payments and refunds before switching merchant accounts: old payments cannot be refunded using credentials from a different account.

This replaces the earlier preference for shared-app sign-in: the owner prioritized independence and accepted guided credentials if one-off authorization retains a dependency. New setup does not call Admit One Connect, use a shared provider app, or fall back to STRIPE_SECRET_KEY for site checkout/payment methods. Existing OAuth credentials, callback routes and renewal remain for compatibility; those connections still depend on their original provider app's authority until replaced. Disconnecting legacy Stripe OAuth still uses its broker revocation flow.

## Verification boundary

Provider setup, failure rollback, same-account rotation, legacy migration and Square maintenance have isolated network/persistence tests. Desktop/mobile browser fixtures exercise required fields, Back, error recovery, location selection and invalidation, checkout choice, and Done. These checks make no real charges and do not prove provider settlement. Complete an isolated sandbox checkout, authenticated notification settlement, retry and refund flow using real sandbox credentials before enabling a new provider. Connected status alone is not an end-to-end payment test.

## Configuration

Set `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` to a strong dedicated value, distinct from `AUTH_SECRET` in production. Preserve it across releases or existing credentials cannot be decrypted. Set `NEXT_PUBLIC_APP_URL` to the canonical application origin.

Normal setup needs no ADMITONE_CONNECT_* configuration. Existing legacy OAuth deployments may retain those settings to finish outstanding authorization or revocation operations. Keep client-specific encryption keys, deployment URLs and databases independent.

## Webhooks and payment methods

The application exposes `/api/webhooks/stripe`, `/api/webhooks/square` and `/api/webhooks/paypal`. Stripe onboarding creates its webhook and same-account key replacement reuses the saved endpoint and secret. Square needs no webhook key: Showrunner reads authenticated payment/refund updates directly every minute and routes only locally owned records through the existing settlement handlers. Payment confirmation can take about a minute. Existing manually configured Square webhooks remain supported; `SQUARE_WEBHOOK_NOTIFICATION_URL` can override their app-origin URL. PayPal setup configures its webhook identity automatically. Never accept a browser return query as proof of payment.

Stripe method settings live in `lib/payments/methods.ts`. Card-backed Apple Pay/Google Pay, Cash App Pay, Klarna and Affirm depend on settings, provider account eligibility and checkout context. Do not promise every method appears for every customer. Connected status alone is not an end-to-end payment test.

## Worker and verification

Each production Node Showrunner starts automatic Square maintenance through `instrumentation.ts`. Railway services must remain awake. A Postgres advisory lock prevents replicas from processing the same site simultaneously. The loop refreshes tokens at the existing seven-day cadence, pages through updated payments/refunds, ignores unrelated POS sales, and advances its checkpoint only after both streams succeed. It re-reads a day of updates for eventual consistency and uses stable event IDs for deduplication. Failed runs retry next minute; Payments shows delayed updates after five minutes. Check logs for `[payments:square] maintenance failed` and monitor that warning.

No separate cron service is required. `npm run payments:refresh-square` remains available for existing deployments/operations; it is safe alongside automatic maintenance because refresh uses its own database lock. The optional worker must share the intended database and `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`. Nonpersistent/serverless hosting needs an external scheduler instead of the in-process loop.

Legacy Stripe OAuth remains supported for existing connections. New connections use keys created in the merchant account; never distribute a platform key to clients.

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
