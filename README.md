# Showrunner

Showrunner is a reusable administration product for service businesses. It combines a protected admin, native scheduling, client records, content editing, media, commerce and public integration APIs. Client websites keep their own presentation and connect through the public APIs and browser bridges. The repository includes tenant/site boundaries; deployment configuration and site settings determine which modules and integrations are available.

## Stack and repository map

Use **Node 22.22.3 and npm 10.x**, as declared in `package.json` and CI. The app uses Next.js App Router, React, TypeScript, Prisma with PostgreSQL, Puck for the website editor, and shared admin UI components. Read the installed Next.js guides referenced by [AGENTS.md](AGENTS.md) before changing framework code.

| Path | Purpose |
| --- | --- |
| `app/` | Next layouts, admin routes, public proof/upload pages and API route entrypoints |
| `modules/` | Module manifests, admin pages, actions, widgets and module-owned API handlers |
| `shell/` | Module registry, navigation, admin frame and dashboard composition |
| `components/ui/` | Shared controls and visual recipes |
| `lib/` | Authentication, site boundaries, scheduling, payments, media, email and shared services |
| `clients/` | Client content manifests and standalone booking source |
| `public/` | Shipped content bridge and static assets |
| `prisma/schema/` | Prisma schema files, merged through `prisma.config.ts` |
| `prisma/migrations/` | Deployable database migrations |
| `scripts/` | Workers, seed helpers and operational scripts |
| `test/` | Unit/integration tests and explicit browser fixtures |
| `developer-docs/` | Maintained guides; the local `docs/` folder is Git-ignored |

API route implementations are not all in module folders. Existing public API routes under `app/api/public/v1/` also contain request validation and orchestration. Reuse `lib/api/` helpers and the owning domain service; keep new route entrypoints thin where a module handler already exists.

## Local setup

1. Start PostgreSQL and create a dedicated development database.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, a random `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, and development `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
3. Run `npm ci` and `npm run prisma:generate`.
4. Apply committed migrations with `npm run prisma:deploy`. Use `npm run prisma:migrate` when authoring a schema change and its migration.
5. For a fresh development database, run `npm run seed` to create the owner and starter data.
6. Run `npm run dev` and open `http://localhost:3000/admin`.

The seed is not a harmless production health check: it updates settings, templates and starter records. Do not rerun it on established client databases as part of ordinary releases. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are seed inputs, not runtime login overrides. The seed only resets an existing user's password when `RESET_ADMIN_PASSWORD=true` is deliberately set.

`npx prisma db push` is suitable only for disposable experiments; use committed migrations for shared and deployed databases. `SHOWRUNNER_BUILD_DIR` can isolate local Next output. Next may then update generated type imports and `tsconfig.json`; review those changes before committing.

## Admin design and public branding

Admin appearance is defined in `app/admin/design-tokens.css`, with shared recipes under `components/ui/styles/` and task layouts beside modules. [The admin token developer guide](developer-docs/admin-design-system.md) covers ownership, scales, examples, extension rules and tests. [DESIGN.md](DESIGN.md) defines visual direction and [PRODUCT.md](PRODUCT.md) records product behavior.

Tenant presets in `lib/theme/tokens.ts` apply to public surfaces through `PublicTheme`; they do not recolor admin. The root stylesheet is a document reset. Client websites and the Content editor's actual website iframe own their own branding.

## Modules and current capabilities

`shell/modules.ts` registers the following modules. Registration does not mean every module is enabled for every site. `MODULE_INCL` controls build inclusion; required platform modules remain included. Runtime installation/settings and permissions further control access. Module manifest readiness text should describe implemented capabilities, not serve as proof that an external integration is configured.

| Module ID | Admin purpose and current boundary |
| --- | --- |
| `dashboard` | Setup guidance and configurable widgets with persisted placement and sizing |
| `appointments` | Calendar/queue, creation, details, rescheduling, statuses, notes and booking operations |
| `scheduling` (Services) | Service catalog, flat/hourly pricing, rates, packages, staff/resources, availability and booking rules; main catalog at `/admin/modules/services` |
| `clients` | Profiles, configurable statuses, service references, notes, timeline, segments, consent, audited CSV import/export and duplicate merge; private shoot galleries/proofing |
| `content` | Manifest-controlled Puck editor over the real client website; approved fields, images, framing and publication |
| `blog` | Drafts, rich text, imagery, publication and public JSON delivery |
| `media` | Shared asset library, folders/tags, framing metadata, archive/restore, private delivery and generated variants |
| `uploads` | Expiring client upload links, private originals and authenticated downloads |
| `portfolio` | Website albums, layouts and previews; public gallery APIs. Client shoot delivery belongs in Clients |
| `forms` | Builder, submissions, file handling, client linking and public definition/submission APIs |
| `testimonials` | Moderation and featured content; no standalone public collection page in this checkout |
| `products` | Catalog, variants, media, bundles and commerce services; public product/checkout APIs, not a bundled full storefront |
| `payments` | Stripe/Square OAuth or credential fallback, PayPal credentials, provider verification and checkout controls |
| `communications` | Transactional outbox, event templates, visual email builder, sender controls and suppressions; campaigns/SMS are not a complete delivery product |
| `billing` | Document/line-item admin, totals, status, hosted checkout-link attachment, payment records and refund action. Public document acceptance/payment pages and PDF routes are absent |
| `automation` | Event rules, queued actions, signed webhook deliveries, replay and run records; scheduled processing must be provisioned |
| `analytics` | Reporting, goals, export, event adapters and retention; client consent/integration remains deployment work |
| `settings` | Business/site settings, public branding, module installation and data-access configuration |
| `users` | Owner-controlled accounts and roles, including last-owner protection |
| `deployments` | Owner-only deployment invitations and GitHub template handoff foundation; not an automatic hosting fleet manager |
| `help` | In-app module guidance and readiness information |

## Public surfaces and website integrations

The root `/` redirects to admin. The old `/book`, `/shop`, `/billing/[token]`, public form pages and general client portal are not mounted pages in this checkout. Do not link users to them merely because an older helper or historical plan mentions them.

Current public pages include `/proofs/[token]`, `/proofs/payment-return`, `/uploads` and `/uploads/[token]`. `/unsubscribe/[token]` is a route handler. Public JSON endpoints under `/api/public/v1/` cover services, availability, bookings, products, checkout, content, blog, forms and galleries. See the route files for exact methods and request contracts; do not assume each API has a hosted page.

`clients/booking/` contains the standalone booking source; its sample configuration defaults to demo data with API access disabled. Configure and host it deliberately for an integration. `public/showrunner-content.js` is the shipped website content bridge. Existing integrations use service slugs and the site's booking destination, not invented `/book/<id>` links. See [website content installation](developer-docs/puck-content-install.md), [session setup](developer-docs/session-setup.md), and [showcase cards](developer-docs/showcase-cards.md). Public API site resolution, origin validation, permissions, rate limits and payment verification must remain intact.

Scheduling uses the native adapter in `lib/scheduling/native.ts` with the contract in `lib/scheduling/types.ts`. Google Calendar OAuth/free-busy integration is already implemented in `lib/scheduling/google-calendar.ts`; configure its client credentials and scheduling encryption key when used. This is availability integration, not a claim of full bidirectional calendar synchronization. Calendar feeds and booking ICS routes are also present.

## Client photos and storage

[Client gallery proofing](developer-docs/client-gallery-proofing.md) documents private shoot galleries, selection limits, paid extras and authorized original delivery. [Client uploads](developer-docs/client-uploads.md) documents expiring upload requests. [Photo storage](developer-docs/photo-storage.md) covers private/public object boundaries and operations.

The media implementation supports repo assets, server-folder storage, S3-compatible storage, R2 and Cloudflare Images. Persist server files with a mounted volume at `MEDIA_ASSET_DIR`, or configure object storage. Railway Buckets can supply `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, and `SECRET_ACCESS_KEY`; the explicit `S3_*` names are also supported. Client uploads have separate `UPLOAD_*` credentials. Preserve signing secrets and original objects during deployment. Code support for a driver does not prove an installation's upload/delivery/scanning configuration is ready.

## Payments and email

Payments execute against each site's own connected provider account. Stripe and Square can use the configured AdmitOne Connect OAuth broker; without that configuration the app offers credential entry. PayPal uses credentials. Merchant credentials are encrypted with `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`, which must be distinct from `AUTH_SECRET` in production. The broker is used for onboarding, not ordinary checkout or Square refresh. See [payment setup](developer-docs/payments-setup.md) for the implementation's configuration and webhook boundaries.

The app queues email through the shared outbox. `SMTP_HOST` is required for production delivery; development without SMTP logs metadata instead of sending. Template state, sender configuration and worker execution also affect delivery. Do not interpret a successfully queued message as delivered email.

## Workers and operations

These commands exist in `package.json`; provision the workers needed by enabled features. The web process does not run them on an implicit timer.

| Command | Job |
| --- | --- |
| `npm run email:process` | Drain the transactional email outbox |
| `npm run automation:process` | Execute queued automation runs |
| `npm run webhooks:process` | Deliver queued signed webhooks |
| `npm run analytics:process` | Apply analytics retention |
| `npm run booking-reminders:process` | Queue due booking reminders |
| `npm run abandoned-carts:process` | Process abandoned-cart recovery |
| `npm run payments:refresh-square` | Refresh eligible Square OAuth credentials; schedule daily |

Workers need the intended database and feature credentials. Internal HTTP sweep routes use their configured worker secrets; inspect each handler before exposing or scheduling it. A worker's existence is not proof it has been provisioned for every client. `/api/health` verifies a database query and returns an uncached response; it does not verify SMTP, storage, provider connectivity or worker freshness.

## Deploying

`railway.json` builds with `npm run build`, runs `npm run prisma:deploy` before deployment, starts with `npm run start`, and checks `/api/health`. Its production config declares two `us-west2` replicas. Inspect effective per-service configuration, especially workers, before applying this config to a new target.

1. Review the intended diff, run validation, and commit the release. Do not deploy a working directory containing local environment files, media or test artifacts.
2. Identify the exact project, environment and service. Verify its repository, branch, active deployment and domains; names such as "beta" do not establish isolation.
3. Set production configuration from `.env.example`, including a random `AUTH_SECRET` of at least 32 characters, canonical app URL, database, required encryption/signing keys and feature credentials. Keep existing client secrets and data.
4. Push the configured branch, or upload a clean `git archive` of the reviewed commit to the explicit target. Seed only as a deliberate new-installation step.
5. Wait for deployment success, check the deployed revision and health, then verify the changed browser flow and relevant public integrations. A push or upload returning successfully is not deployment verification.

See [deployment fleet](developer-docs/deployment-fleet.md) for the verified release targets and discovery procedure. Do not revive empty/stopped services or deploy client websites as incidental admin cleanup.

## Validation and development references

```powershell
npm run prisma:generate
npx tsc --noEmit
npm test
npm run lint
npm run build
```

Run these in a clean checkout using the pinned Node version. Local ignored capture/build folders can confuse broad lint runs; do not suppress source rules to accommodate scratch files. CI also runs dependency and secret/configuration scans. For browser verification, run the scripts documented in the [admin token guide](developer-docs/admin-design-system.md) and [gallery verification guide](developer-docs/client-gallery-verification.md); they are not part of `npm test`.

Keep README claims tied to routes, handlers and tests. [The codebase verification record](developer-docs/codebase-verification.md) records this pass, known capability boundaries and release checks. Historical audits retain their original dates and are not a current feature inventory.
