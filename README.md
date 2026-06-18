# Showrunner

Showrunner is a reusable per-client website/admin template for service businesses. It is built for the handoff model: one Railway project, one Postgres database, public pages plus a protected `/admin` area.

## Stack

- Next.js, TypeScript, Prisma, Postgres
- Email/password admin auth with role-based permissions
- Native service appointment scheduling with multi-staff support
- SMTP email outbox with worker processing and dev console fallback
- Repo media by default, Cloudflare R2 uploads when configured
- Stripe Checkout for hosted commerce payments, including per-site Stripe Connect and owner-controlled Stripe payment methods when configured
- Request-resolved site boundary for tenant-owned data
- Theme tokens with client-safe style presets

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Run `npm install`.
4. Run `npm run prisma:migrate`.
5. Run `npm run seed`.
6. Run `npm run dev`.

The admin panel is available at `/admin`. Public booking is available at `/book`.

For quick throwaway previews where you do not want to create a migration, `npx prisma db push` can sync the local database directly. Use migrations for deployable client projects.

## Railway Setup

1. Create a Railway project from this repo.
2. Add a Postgres database.
3. Set the env vars from `.env.example`.
4. Run `npm run prisma:deploy` during deploy before starting the app.
5. Run `npm run seed` once for the first admin user and starter content.

The initial schema migration lives in `prisma/migrations/20260606190000_init/migration.sql`, so fresh Railway databases can be created with `npm run prisma:deploy`.

## Module Shape

Modules live in `modules/` and publish a `module.ts` manifest. The admin shell reads those manifests from `shell/modules.ts` to build sidebar navigation and settings controls.

API endpoint behavior lives in each module's own `modules/<id>/api/` folder. Next.js route files under `app/**/route.ts` should stay thin and re-export handlers from there. Shared API helpers (CSV, request-body parsing, secret checks) live in `lib/api/`, and shared non-HTTP services and utilities live in `lib/`.

The v1 enabled modules are:

- Dashboard
- Appointments
- Analytics
- Automation
- Billing
- Clients
- Communications
- Content
- Forms
- Help
- Media
- Portfolio
- Products
- Scheduling
- Settings
- Testimonials
- Users

Future modules such as contracts and deeper client self-service surfaces can be added by registering a manifest, creating a route, and adding the needed Prisma models/actions.

## Current Admin Flow

- Dashboard: mobile-friendly operations overview with snapshot metrics, consistent shortcut cards, upcoming appointments, and hamburger navigation on compact screens.
- Appointments: day-to-day queue, appointment details, statuses, intake answers, and internal appointment notes.
- Analytics: module reporting, server event records, CSV export, client adapters, and retention controls.
- Automation: rule matching, queued webhooks, non-webhook executors, replay, and dead-letter handling.
- Billing: document admin with server-side totals, public accept/pay, PDFs, and partial payments.
- Clients: long-term client book with profile data, private notes, timeline notes, saved segments, lead pipeline, consent/preferences, audit-logged CSV import/export, audit-logged duplicate merge, and appointment history.
- Communications: transactional outbox, booking template settings, visual template builder, sender/recipient controls, and suppressions.
- Scheduling: setup for services, assigned staff, bookable resources, per-staff/resource availability, blockouts, booking rules, intake prompts, policies, and booking reminders.
- Content: controlled public-site copy and hero image edits.
- Media: repo assets by default, R2/Cloudflare Images uploads when configured, folders/tags/focal points, archive lifecycle, signed delivery, and signed Sharp/R2 image variants.
- Portfolio: gallery admin, access-link delivery, proofing favorites/comments/approvals, public widgets/lightbox, signed image variants, and ZIP bundles.
- Forms: reusable public forms, intake questions, and a submission inbox.
- Testimonials: review collection, approval workflow, featured quotes, and public proof pages.
- Products: commerce catalog, variants, collections, coupons, storefront cart/order flow, hosted Stripe Checkout with owner-controlled card, wallet, Cash App Pay, Klarna, and Affirm toggles, and order dashboard foundation.
- Settings: business details, theme basics, media mode, enabled modules, tenant/site foundation, role/audit controls, and owner-configurable data-access scope.
- Users: owner-only admin user creation, role assignment, and last-owner protection.
- Help: in-app user guide for day-to-day admin use.

## Theme Tokens

Theme presets and CSS variable generation live in `lib/theme/tokens.ts`.

## Operations

The email outbox is drained by `npm run email:process`. On Railway, create a separate cron service from this repo with that command and a schedule such as `*/5 * * * *`. Railway cron schedules are configured in the service settings, not in this single web-service `railway.json`.

Analytics retention is drained by `npm run analytics:process`. Provision it as a separate scheduled worker as well; the internal HTTP route can use `ANALYTICS_WORKER_SECRET` when configured, otherwise it falls back to `EMAIL_WORKER_SECRET`.

Booking reminders are drained by `npm run booking-reminders:process`. Provision it as a separate scheduled worker as well.

The payments platform is generalized behind `lib/payments/` so gateways can connect per site. The Stripe path supports per-site Stripe Connect credentials plus owner-controlled payment-method toggles for card-backed Apple Pay and Google Pay, Cash App Pay, Klarna, and Affirm. Apple Pay domain registration currently depends on the platform URL; each client's custom domain must be registered for reliable Apple Pay on owner domains.

## Scheduling

The first scheduling engine is native and intentionally small. The adapter contract lives in `lib/scheduling/types.ts`, and the implementation lives in `lib/scheduling/native.ts`. This keeps room for a future Google Calendar or Cal.diy-backed adapter without rewriting the admin shell.

Scheduling owns the rules that create bookable time:

- service duration and location
- optional assigned staff
- optional required resources such as rooms or equipment
- buffer before/after appointments
- minimum notice
- max advance booking window
- slot interval
- intake prompt
- booking policy and required policy acceptance
- weekly availability and blockouts
- per-staff and per-resource availability for assigned services/resources

## Appointments

Appointments are the day-to-day operational queue. Admins can view appointment details, see customer notes/intake answers, confirm/cancel/complete appointments, and store internal appointment notes.

The public booking page uses a guided flow rather than one long form: service, time, details, review, and confirmation. Availability is loaded through `/api/availability`.

Service-specific booking links use stable slugs:

- `/book?service=consultation`
- `/book/consultation`

Prefer `/book/service-slug` for public CTA buttons. Database IDs should not be used in public links.

When an admin adds a service, the service slug is generated from the service name if the slug field is blank. Duplicate slugs receive a numeric suffix, such as `consultation-2`.

## Clients

Clients are the long-term relationship records. Public bookings automatically create or update a client by email address. The client area stores profile details, private notes, manual timeline notes, and appointment history.

CSV imports, CSV exports, and duplicate merges are recorded through the shared audit log with actor, target, and before/after context where applicable.
