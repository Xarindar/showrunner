# Showrunner

Showrunner is a reusable per-client website/admin template for service businesses. It is built for the handoff model: one Railway project, one Postgres database, public pages plus a protected `/admin` area.

## Stack

- Next.js, TypeScript, Prisma, Postgres
- Simple email/password admin auth
- Native service appointment scheduling
- SMTP email notifications with dev console fallback
- Repo media by default, Cloudflare R2 uploads when configured
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

Modules live in `modules/` and publish a `module.ts` manifest. The admin shell reads those manifests from `shell/modules.ts` to build sidebar navigation and settings controls. Use `docs/module-dev-guide.md` when building a module, and `docs/module-system.md` for the short architecture contract.

The v1 enabled modules are:

- Dashboard
- Content
- Appointments
- Clients
- Scheduling
- Media
- Forms
- Testimonials
- Products
- Settings
- Help

Future modules such as Galleries, Staff, contracts, and advanced commerce surfaces can be added by registering a sidebar item, creating a route, and adding the needed Prisma models/actions.

## Current Admin Flow

- Dashboard: mobile-friendly operations overview with snapshot metrics, consistent shortcut cards, upcoming appointments, and hamburger navigation on compact screens.
- Appointments: day-to-day queue, appointment details, statuses, intake answers, and internal appointment notes.
- Clients: long-term client book with profile data, private notes, timeline notes, and appointment history.
- Scheduling: setup for services, availability, blockouts, booking rules, intake prompts, and policies.
- Content: controlled public-site copy and hero image edits.
- Media: repo assets by default, R2 uploads when configured.
- Forms: reusable public forms, intake questions, and a submission inbox.
- Testimonials: review collection, approval workflow, featured quotes, and public proof pages.
- Products: commerce catalog setup for products, variants, collections, coupons, and checkout-ready records.
- Settings: business details, theme basics, media mode, and enabled modules.
- Help: in-app user guide for day-to-day admin use.

## Theme Tokens

Theme presets and CSS variable generation live in `lib/theme/tokens.ts`. See `docs/theme-tokens.md` for the token structure, current presets, and how to add new client styles.

## User Documentation

End-user documentation lives in `docs/admin-user-guide.md` and is also summarized in the admin at `/admin/help`.

Client handoff documentation lives in `docs/client-handoff-checklist.md`.

Email platform planning lives in `docs/email-core.md`. Use it before changing booking notifications, form notifications, newsletter flows, sender configuration, or delivery logging.

The email outbox is drained by `npm run email:process`. On Railway, create a separate cron service from this repo with that command and a schedule such as `*/5 * * * *`. Railway cron schedules are configured in the service settings, not in this single web-service `railway.json`.

## Scheduling

The first scheduling engine is native and intentionally small. The adapter contract lives in `lib/scheduling/types.ts`, and the implementation lives in `lib/scheduling/native.ts`. This keeps room for a future Google Calendar or Cal.diy-backed adapter without rewriting the admin shell.

Scheduling owns the rules that create bookable time:

- service duration and location
- buffer before/after appointments
- minimum notice
- max advance booking window
- slot interval
- intake prompt
- booking policy and required policy acceptance
- weekly availability and blockouts

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
