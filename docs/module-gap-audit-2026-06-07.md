# Module Gap Audit - 2026-06-07

Scope: compare `docs/roadmap.md` with the implemented module registry, Prisma schema, admin actions, public routes, and current online product/API references. This is a gap note, not a roadmap lifecycle update.

## Executive Summary

The repo has a stronger admin/data foundation than the README implies. `shell/modules.ts` registers 16 active modules: Dashboard, Content, Appointments, Clients, Scheduling, Media, Portfolio, Forms, Testimonials, Settings, Help, Products, Communications, Billing, Automation, and Analytics.

The main gap pattern is consistent: many modules are admin-configurable but not yet public/runtime-complete. Scheduling, forms, testimonials, media upload, and transactional email have real public paths. Products, portfolio galleries, billing, automation, and analytics are mostly admin/data foundations waiting on storefronts, public portals, execution engines, adapters, or event emission.

Research supports the roadmap's strategic direction:

- Scheduling should grow toward multi-person event types, team availability, resource capacity, reminders, and calendar adapters. Calendly documents round robin, collective, and group scheduling as core team patterns; Google Calendar exposes free/busy queries for calendar conflict checks.
- Commerce should keep hosted payment collection. Stripe Checkout supports hosted or embedded payment pages; Shopify and WooCommerce both expose cart/checkout/store APIs; PCI guidance keeps SAQ A scope smallest when payment-page elements come from validated third parties.
- Portfolio/media should treat proofing, favorites, downloads, private links, responsive variants, and signed delivery as first-class. Pixieset's client gallery feature set and Cloudflare Images/R2 docs validate those as expected workflows.
- Analytics should not stay manual. GA4 expects standard ecommerce/lead events and consent-mode behavior; the implementation only records manual events today.
- Security and operability need to become platform primitives. OWASP API Top 10 highlights object/function authorization, Salesforce-style role/permission sets show why simple `role: string` is not enough, and WCAG 2.2 should remain the accessibility target.

## Agent Work Audit - 2026-06-07

Verification:

- `npm run lint` passed after the agent work.
- `npm run build` passed after the agent work.
- Audit scope covered changed routes, Prisma/schema additions, module manifests, server actions, event emission, public routes, and this gap document. No runtime browser pass was performed in this audit.

Agent 1 - Platform shell, dashboard, content, settings, help, security:

- What landed well: manifest readiness metadata is a useful non-breaking layer, required modules are protected, platform-status checks make the admin shell more honest, and lazy-loading module pages reduces cross-module blast radius. Dashboard, Settings, and Help now expose much more readiness context.
- Needs follow-up: `lib/platform-status.ts` still contains stale warnings after other agents shipped public galleries and automatic event emission. In particular, Portfolio can still be flagged as having no public route, and Automation/Analytics can still read as entirely manual even though an event catalog, event emitter, CSV export, and public event sources now exist.
- Needs follow-up: Help still has stale workflow copy saying public gallery delivery is not live and analytics instrumentation has not shipped. This can confuse operators because the module cards now say something different.
- Needs follow-up: the readiness system is still static metadata plus ad hoc checks. It does not persist installed/configured/public-safe state, per-site settings, health check history, or audit records. Treat the pass as an admin visibility layer, not a true module platform.
- Suggested roadmap/doc cleanup: add a canonical status vocabulary for `planned`, `admin foundation`, `manual`, `mixed`, `live`, and `public safe`, then require every module to declare what would move it to the next level.

Agent 2 - Scheduling, appointments, clients, forms, testimonials:

- What landed well: slot diagnostics fill a real operator gap, public booking now emits an event, forms emit submission events, testimonials now retain permission text/timestamp, and the client detail page is closer to a real unified timeline.
- Needs follow-up: admin rescheduling validates availability but does not use the same final serializable conflict check as public booking creation. Two concurrent changes can still create an overlap. Reschedule should be wrapped in a transaction with a final conflict query and should emit a reschedule notification/event.
- Needs follow-up: the client timeline uses `MessageLog`, not the actual `EmailOutbox`, so transactional booking/form/billing/order emails can be missing from the activity story unless manually logged elsewhere.
- Needs follow-up: forms now have CSV export and event emission, but file upload, conditional logic, version snapshots, spam review, and attachment destinations remain open. The page copy should avoid calling forms "attachment-ready" until uploads and attachment relationships exist.
- Suggested roadmap/doc cleanup: Scheduling and Appointments should share one concurrency/audit requirement: every create, reschedule, cancel, capacity change, and staff/resource assignment must be auditable and collision-checked in the same transaction boundary that writes the change.

Agent 3 - Products/eCommerce, billing/documents, communications/email:

- What landed well: storefront/cart scaffolding is real, cart math is centralized, stale carts are repriced, draft orders/payment rows are created without collecting card data, billing documents now have public tokenized views and snapshots, and email preview/test-send plus billing/order transactional queues are useful immediate upgrades.
- Needs follow-up: submitting the cart creates a new draft order/payment every time while leaving the cart open. The checkout preparation action should be idempotent per cart, mark or transition cart state, and prevent duplicate draft orders unless the cart changes.
- Needs follow-up: `addToCartAction` accepts `returnTo` and redirects to it. Current UI does not appear to pass external URLs, but the action should still constrain redirects to same-origin relative paths.
- Needs follow-up: billing checkout links are labeled as Stripe Checkout but accept any public HTTPS URL. Either constrain the provider semantics or relabel this as a hosted payment link until a real Stripe Checkout/Payment Link adapter exists.
- Needs follow-up: attempting to email a draft billing document can create a public token/snapshot before the draft-status guard rejects the send. The draft guard should happen before token/snapshot creation.
- Needs follow-up: marketing compliance headers improved, but campaign send/schedule UI, preference center, sender-domain health, resend controls, and bounce/complaint reporting are still missing.
- Suggested roadmap/doc cleanup: define an idempotency rule for every money-adjacent action: cart checkout preparation, payment webhooks, invoice acceptance, quote conversion, refund, coupon redemption, and inventory reservation.

Agent 4 - Media, portfolio, automation, analytics:

- What landed well: media lifecycle metadata is much stronger, public galleries and access-token views exist, favorites work, gallery/favorite events emit, analytics CSV export exists, and outbound webhook endpoint delivery is now tied to event emission instead of only manual records.
- Needs follow-up: `emitModuleEvent` dispatches subscribed webhooks synchronously. Public gallery rendering emits `gallery.viewed`, so page refreshes can repeatedly write analytics rows and block on webhook delivery. Event capture needs idempotency/throttling, async dispatch, retries, dead-letter/replay, and a way to keep public pages fast.
- Needs follow-up: Automation rule execution is still mostly not real. The event emitter records matched automation runs as `SKIPPED`, while actual outbound delivery goes through the separate webhook endpoint registry. Existing `SEND_WEBHOOK` automation rules and their `webhookUrl` are not executed, which is confusing for admins.
- Needs follow-up: public gallery downloads are direct links to `imageUrl`. Private/deleted media filtering only applies when a gallery item is attached through `mediaAssetId`; raw image URLs bypass that lifecycle. Private galleries need signed/expiring delivery or a storage proxy before they are safe for controlled proofing.
- Needs follow-up: analytics now has event sources and export, but not UTM/session capture, consent gating, GA4-style recommended event names, ecommerce events, retention policy, or server-side conversion adapters.
- Suggested roadmap/doc cleanup: make the event system its own platform milestone with idempotency keys, event schema versions, async delivery, retry policy, consent rules, and a catalog that maps cleanly to analytics, automation, and webhooks.

Follow-up correction - Codex 2026-06-08:

- Resolved: `emitModuleEvent` no longer performs webhook network calls during public requests. It records analytics, matches automation rules, and queues webhook deliveries; the worker route/script process queued deliveries with HMAC signatures, retry backoff, and failed-delivery status.
- Resolved: `gallery.viewed` emission now has a dedupe window, and server attribution reads first-party visitor/session plus UTM context while honoring a denied tracking-consent cookie.
- Resolved: active `SEND_WEBHOOK` automation rules with `webhookUrl` now create queued run records and delivery rows. Non-webhook actions remain explicitly labeled as executor-pending, and manual delivery records cannot create worker-pending jobs.
- Resolved: public gallery rendering and downloads now use a gallery media proxy for media-backed items, enforce gallery access tokens, hide deleted/private assets, and prevent raw URL-only items from appearing in private galleries.
- Resolved: Portfolio, Media, Automation, Analytics, Help, and platform-status copy now use mixed/partial language instead of stale "not live" or "manual only" language.
- Still pending: gallery comments/approvals, generated variants, fully private storage/signed object URLs, replay/dead-letter UI, analytics retention controls, client analytics adapters, and complete GA4/ecommerce mappings.

## Core Platform Foundation

Current implementation:

- `SiteSettings` is a single global settings row; there is no `Site`, `Tenant`, `SiteDomain`, `ModuleInstallation`, `ModuleSetting`, or `AuditLog`.
- Modules are simple static manifests with `active` or `future` status only. There is no dependency graph, settings schema, route/widget declarations, permission declaration, import/export handler, or installed/configured/public/beta distinction.
- Admin auth is one protected admin session with `AdminUser.role` as a string. Server actions call `requireAdmin()`, but there is no module-level or record-level permission engine.

Implementation pass - Codex 2026-06-07:

- Added non-breaking manifest readiness metadata in `shell/module-types.ts` and every `modules/*/module.ts`: readiness level/mode, capabilities, routes, dependencies, data models, permissions, settings sections, and health checks.
- Kept `status: active | future` as the sidebar/route gate. Added `required` module support so Dashboard, Settings, and Help stay enabled through `normalizeModules()`.
- Added `lib/platform-status.ts` to combine manifest metadata with read-only live checks for booking setup, R2 config, SMTP/email worker setup, failed/stale outbox, sender verification, overdue billing, manual automation, and manual analytics.
- Changed the shared module route to lazy-load only the selected module page, so an unrelated broken module page cannot take down Settings/Help/Dashboard module routes.
- No schema migration landed in this pass. The next clean schema set is `Tenant`, `Site`, `SiteDomain`, `ModuleInstallation`, `ModuleSetting`, `AuditLog`, `Role`, `Permission`, `RolePermission`, `AdminUserRole`, `AdminSession`, `LoginAttempt`, `SiteApiKey`, `AllowedOrigin`, and `DataRequest`.

Missing to be fully featured:

- Add tenant/site tables and composite unique constraints before public URLs, coupons, order numbers, slugs, and gallery access tokens become multi-site data.
- Promote module manifests from sidebar entries to capability manifests: admin routes, public routes, widgets, permissions, data models, settings, seed data, health checks, import/export.
- Add audit logs for create/update/delete/status/export/payment/refund/access events.
- Add public API contracts with signed site keys, CORS allowlists, per-module rate limits, stable response schemas, and versioning.
- Add Web Component and iframe embed delivery. MDN's Web Components guidance supports reusable custom elements with encapsulated functionality, which matches the roadmap's cross-site widget plan.

Roadmap suggestions:

- Add a "module health" concept: installed, enabled, configured, public-safe, needs-adapter, has-public-route, has-export.
- Add data migration guidance for moving from global unique slugs/coupons/order numbers to tenant-scoped composite uniques.
- Add backup/restore and export as Phase 0 requirements, not late quality gates.

## Dashboard

Current implementation:

- Dashboard is an active module with upcoming bookings, counts for pending/upcoming bookings, client count, active services, media count, and shortcut cards.
- It does not surface module readiness, broken integrations, pending audit findings, email worker health, deployment cron status, recent failed sends, overdue invoices, or automation/manual-vs-live state.

Implementation pass - Codex 2026-06-07:

- Dashboard now shows enabled module readiness, live/mixed/manual/admin-foundation counts, public-route declaration state, and top operational warnings.
- Dashboard shortcut cards now only link to modules enabled in settings, avoiding disabled-module 404s.

Missing to be fully featured:

- Module health cards using manifest/config status.
- Operational alerts: email queue failures, missing cron, expiring gallery access, overdue invoices, unavailable booking days, failed uploads, public form abuse spikes.
- Role-aware dashboard sections once permissions exist.
- Cross-module "today" queue: appointments, forms, invoices, tasks, reviews, gallery approvals.

Roadmap suggestions:

- Roadmap should explicitly define the Dashboard module. Today it exists but is not a roadmap section.
- Add module health, incidents, release notes, and deployment checks. Atlassian Statuspage's component/status/incident-template patterns are useful inspiration for status-aware dashboards.

## Scheduling

Current implementation:

- Services, service slugs, duration, location, buffers, minimum notice, max advance window, slot interval, intake prompt, policy text, weekly availability, blockouts, native availability, and public booking exist.
- `nativeSchedulingAdapter` checks rules, blockouts, existing non-canceled bookings, service buffers, min notice, and max advance window. Booking creation uses a serializable transaction and queues booking-created emails.
- No staff, resources, locations as first-class entities, group events, recurring appointments, waitlists, paid booking, external calendar connections, or client self-service exists.

Missing to be fully featured:

- Staff/location/resource models and availability scopes.
- Appointment type model: one-on-one, group/class, request-only, recurring, capacity, waitlist.
- Calendar adapters for Google/Cal.com/Outlook/ICS. Google Calendar FreeBusy is the obvious first external availability check.
- Cancellation/reschedule windows, client cancel/reschedule links, manual approval, holidays, capacity limits, daily/weekly booking limits.
- Deposit/no-show/pay-in-full integration with billing/commerce.
- Reminder automation and admin/staff assignment alerts.

Roadmap suggestions:

- Add a scheduling "rules testbench" for debugging why a slot is unavailable. Calendly exposes troubleshooting concepts around unavailable times; this would reduce support friction.
- Add event routing/intake questions for routing leads to staff or service types.

## Appointments

Current implementation:

- Appointments are separated from Scheduling. Admins can view queues, filter status, inspect details, change status, store internal appointment notes, and see client links.
- Status emails queue for confirmed/canceled/completed states.
- There is no calendar grid, reschedule action, drag/drop, staff assignment, resource conflict warning, client-facing appointment detail page, or no-show workflow.

Missing to be fully featured:

- Calendar month/week/day and agenda views.
- Reschedule flow with availability validation and notification.
- No-show, arrived, checked-in, request-approved/rejected states.
- Staff/resource assignments and conflict warnings.
- Appointment files, intake updates, payment balance, and client portal links.

Roadmap suggestions:

- Treat Appointments as its own operational module in the roadmap instead of burying it under Scheduling.
- Add audit log requirements for status changes and note edits.

## Clients / CRM

Current implementation:

- Clients have name, unique email, phone, status, private notes, client notes, bookings, form submissions, testimonials, billing documents, message logs, carts/orders, and email subscriber relations.
- Public booking upserts client by email and public forms can create lead clients for `CLIENT`/`INQUIRY` destinations.
- Client detail shows profile, manual notes, appointment history, and service history.

Missing to be fully featured:

- Multiple emails/phones, addresses, company/family records, tags, custom fields, timezone/preferences, lead source, birthdays/anniversaries.
- Unified timeline across bookings, forms, emails, invoices, orders, galleries, payments, notes, uploads, status changes.
- Saved segments and lead pipeline.
- Merge/dedupe, import/export, data deletion/export requests.
- Client portal for profile, appointments, invoices, forms, files, messages, gallery favorites/access.
- Consent/preferences records for marketing, SMS, policy acceptance, photo release, data retention.

Roadmap suggestions:

- Add CRM tasks and reminders. HubSpot's CRM docs emphasize records, properties, associations, and activities; Showrunner should add task/timeline primitives before advanced automation.
- Add record-level ownership now so staff can be limited to their own clients/bookings later.

## Content / SEO

Current implementation:

- Content edits only update homepage copy and hero image through `SiteSettings`.
- Public homepage conditionally lists active forms and featured testimonials.
- There is no page model, SEO metadata model, navigation builder, blog/content posts, schema generator, sitemap/robots controls, social preview, redirect manager, or per-module public landing pages.

Implementation pass - Codex 2026-06-07:

- Content manifest and page now label the module as partial: homepage copy/media are live, while page/SEO models, redirects, sitemap controls, and structured data remain pending.

Missing to be fully featured:

- Page/content model with draft/published states.
- SEO metadata per page/module, canonical URLs, Open Graph images, sitemap automation, robots controls.
- LocalBusiness/Organization structured data tied to settings, hours, services, reviews, and locations.
- Redirects and slug-change history.
- Blog/news/FAQ/resources if content sites are in scope.

Roadmap suggestions:

- Split "Content" and "SEO" in the roadmap. The current roadmap has a Content/SEO section, but implementation only covers editable homepage copy.
- Add Search Console verification, sitemap submission, and structured data validation. Google documents LocalBusiness structured data, sitemaps, and validation/re-crawl steps.

## Media

Current implementation:

- Media can upload R2-backed image assets when configured, requires alt text, has an image MIME allowlist, and caps uploads at 7 MB.
- Repo media is supported as a mode; media assets are selectable by portfolio galleries.
- There are no folders, tags, focal points, captions, credits, private/public states, asset edit/delete, variant generation, signed download links, virus scanning hook, or attachment relationships.

Missing to be fully featured:

- Asset metadata: folder, tags, caption, focal point, credit/byline, usage context, copyright, public/private, decorative alt option.
- Transform pipeline: thumbnails, cards, hero, full-screen, social, download/original.
- Private delivery: signed URLs, access expiration, audit logs.
- Deletion lifecycle and orphan detection.
- Direct-to-storage uploads for large files and batch uploads.

Roadmap suggestions:

- Add `AssetVariant` and attachment join tables earlier. Cloudflare Images supports variants/private images, and Cloudflare R2 presigned URLs support single-object browser upload/download access.
- Add SVG hardening. SVG is allowed now; roadmap should require sanitization or disallow public untrusted SVG.

## Portfolio

Current implementation:

- Admin can create galleries with status/visibility/category/cover/SEO/proofing/download flags/access code hash/rights notes, add gallery items, create private access rows, and revoke/reactivate access.
- Prisma includes `PortfolioGalleryFavorite`, but there is no public gallery route, no favorite action, no magic-link access flow, no comments, no approvals, no downloads, and no commerce tie-in.

Missing to be fully featured:

- Public gallery pages, lightbox, responsive image loading, keyboard accessibility.
- Password/magic-link validation and access-token public route.
- Favorites, comments, approvals, revision rounds, export selected images.
- Download bundles, expiring links, watermark/original handling, license display.
- Print/product sales, package booking CTAs, lab/fulfillment exports.
- Edit/delete/reorder for galleries and items.

Roadmap suggestions:

- Add proofing flows as a first-class workflow, not just data tables. Pixieset highlights favorites, comments, export/download favorites, private delivery, and print/digital sales as core gallery expectations.
- Add per-gallery analytics events: view, favorite, download, share, approve, purchase.

## Forms

Current implementation:

- Form CRUD, status, duplicate, delete, field create/edit/delete/reorder-by-sortOrder, typed fields, hidden fields, signature field type, public renderer, public submission storage, honeypot, DB-backed rate limit, client/inquiry linking, and admin notification email exist.
- Supported destinations are limited to `STANDALONE_LEAD`, `CLIENT`, and `INQUIRY`; schema enum also lists booking/order/gallery but the action deliberately excludes them.

Missing to be fully featured:

- File uploads, conditional logic, skip logic, multi-page forms, prefill, answer piping, multilingual forms, save/resume.
- Real e-signature/document workflow, signer identity, signed PDF/document snapshots.
- Booking/order/gallery attachment destinations.
- Field versioning/snapshots so historic submissions remain interpretable after fields change.
- Admin submission detail/export/delete, spam review, consent capture.

Roadmap suggestions:

- Update the roadmap's older "field adder" audit note. Current actions include update/delete and form delete, so that note is stale.
- Add conditional logic and file upload. Jotform markets signatures, conditional logic, skip logic, prefill, and file/image upload as normal form-builder capabilities.

## Testimonials

Current implementation:

- Admin can create testimonials, moderate status, feature/unfeature, delete with confirmation, and link/create clients by email.
- Public testimonial page lists approved testimonials and accepts public submissions with permission checkbox, honeypot, and DB-backed rate limit.
- There is no request workflow, campaign/send link, third-party review import, review schema output, response/reply workflow, proof of consent beyond a boolean, or review fraud policy tooling.

Missing to be fully featured:

- Review request templates and post-completion automation.
- Source verification, third-party review links/imports, response/reply notes.
- Consent/release snapshot with timestamp and text.
- Structured data where appropriate, public widgets/blocks by module/site.
- Abuse moderation: duplicate detection, IP/email throttling summaries, admin review queue details.

Roadmap suggestions:

- Add FTC review compliance language: no fake/procured reviews, disclose incentives/material connections, retain permission/consent proof. FTC guidance warns against deceptive/fake review practices.

## Products / eCommerce

Current implementation:

- Product, variant, collection, coupon admin foundations are present and audited/resolved.
- Product default variant sync exists, variant-level inventory rule is documented, price/money bounds exist, collection add exists, coupon create exists.
- Public storefront and cart scaffolding now exist at `/shop`, `/shop/[slug]`, and `/cart`.
- `lib/commerce/cart.ts` is the authoritative cart/order math layer: it reprices stale carts, enforces one currency per cart, applies active coupons, uses variant-level inventory authority, and creates draft orders with pending Stripe-shaped payment records.
- Checkout session creation, tax/shipping, pickup, fulfillment, refunds, paid receipts, inventory reservation/decrement, and payment webhooks are still not implemented.

Missing to be fully featured:

- Storefront polish: collection pages, product image galleries, related products, SEO/schema.
- Checkout adapter: Stripe Checkout session creation first, plus webhook verification/idempotency, payment status updates, refunds.
- Tax/shipping/pickup, inventory reservation/decrement, abandoned cart recovery, and fulfillment.
- Order admin list/detail, fulfillment, receipts, customer history, exports.
- Gift cards, package credits, class packs, deposits, subscriptions/retainers.
- Product image galleries and typed tags/attributes.

Roadmap suggestions:

- Add "cart/order math service" as an explicit non-negotiable before checkout.
- Add `Refund`, `InventoryReservation`, `GiftCard`, `PackageCredit`, `Subscription`, and `Fulfillment` models.
- Stripe Checkout, Shopify Storefront API, WooCommerce Store API, Square Web Payments SDK, and PCI SAQ A references all support the roadmap's hosted/tokenized payment strategy.

## Communications / Email

Current implementation:

- There is a real email core: templates, outbox, provider events, sender identities, recipient groups, subscribers/lists/campaign records, suppression scopes, unsubscribe route, provider-event route, and CLI/HTTP outbox worker.
- Communications admin shows system templates as read-only, allows manual templates/manual notes, reads actual `EmailOutbox`, and manages scoped suppressions.
- Public booking, public form submissions, billing document notices, and draft order checkout-prepared notifications queue transactional emails.
- Communications admin now includes template preview with token JSON and test-send queuing through the real outbox renderer.
- Marketing queueing requires an absolute HTTPS unsubscribe URL and emits one-click `List-Unsubscribe` headers. No UI exists yet for editing system templates, sending/scheduling campaigns, SMS, resend, or bounce analytics dashboards.

Missing to be fully featured:

- Email template editor with versioning and a system-template safe edit flow. Preview and test send exist, but editing system templates remains read-only.
- Campaign send/schedule UI, list targeting, one-click unsubscribe headers for marketing, preference center.
- Bounce/complaint dashboards, retry/resend controls, delivery health.
- SMS adapter with consent, quiet hours, cancellation/reschedule keywords.
- Notification routing by module/staff/assignment.

Roadmap suggestions:

- Add Gmail/Yahoo-style sender compliance gates: SPF/DKIM/DMARC alignment, TLS, spam-rate monitoring, and one-click unsubscribe for marketing. Google's sender FAQ says bulk senders must authenticate, avoid unwanted mail, and make unsubscribe easy; marketing mail needs one-click unsubscribe.
- Keep transactional/marketing classification in every template and outbox row. FTC CAN-SPAM guidance distinguishes transactional/relationship messages from commercial opt-out obligations.

## Billing / Documents

Current implementation:

- Admin can create invoices/quotes/contracts, line items, totals, discounts, tax, due dates, attachments, guarded status transitions, overdue derivation, draft-only edit/delete of line items, and grouped currency totals.
- Billing documents now have tokenized public client links, JSON snapshots, print/save-PDF views, quote/contract public acceptance, customer notice email queueing, and a Stripe Checkout URL handoff field.
- The hosted payment strategy remains tokenized/hosted: admins can attach a Stripe Checkout URL, but this app does not collect raw card data.
- Partial payments, paid receipts/PDF generation, recurring invoices, refunds, contract signing/versioning, customer portal, and payment webhooks are still not implemented.

Missing to be fully featured:

- Native Stripe Checkout/Payment Link or Stripe Invoicing adapter, payment webhook, partial payments, deposits.
- Generated PDF and receipt artifacts beyond the current print/save-PDF public view.
- Contract signing, version snapshots, counterparty acceptance, document audit trail.
- Recurring invoices/retainers and failed payment recovery.
- Refunds/credits, account balance, revenue by service/product.

Roadmap suggestions:

- Add document snapshot/versioning as a quality gate before public signing/payments.
- Stripe Invoicing supports quotes, customer emails, recurring invoices, and multi-currency customers; roadmap should decide whether Showrunner generates its own PDFs or delegates invoice hosting to Stripe in v1.

## Automation

Current implementation:

- Admin can create/edit/delete/toggle automation rules, manually record runs, create/edit/delete webhook endpoints with generated secrets, validate known events, and manually record deliveries.
- There is no event bus, trigger evaluator, background worker, action executor, signed outbound dispatcher, retry scheduler, or Zapier/Make connector.

Missing to be fully featured:

- Event emission from bookings, forms, orders/payments, invoices, galleries, clients, testimonials, email.
- Rule evaluator with multiple conditions/operators and AND/OR groups.
- Action executors: send email/SMS, create task, add tag, update status, create invoice, request review, notify staff, call webhook.
- Signed outbound webhooks with HMAC headers, retries, dead-letter/replay, delivery log tied to actual dispatch.
- Scheduled jobs: reminders, abandoned carts, recurring invoices, gallery expiration, exports/cleanup.

Roadmap suggestions:

- Add a first-class event catalog and idempotency keys per event. Cal.com webhook docs show broad booking/form/no-show event payloads, and Stripe webhook docs emphasize signature verification.
- Add task management as an automation target and dashboard surface.

## Analytics / Reporting

Current implementation:

- Analytics event and goal models exist. Admin can manually record events, create/toggle goals, show module metrics, top events, attribution summaries, and conversion progress.
- No automatic event emission, UTM capture middleware, visitor/session tracking, consent banner/gating, GA4/Meta/Search Console adapters, CSV export, retention controls, or server-side conversion hooks exist.

Missing to be fully featured:

- Client/server event emitters integrated into booking, forms, testimonials, portfolio, products, checkout, billing, email.
- UTM/referrer/landing-page capture and first/last-touch attribution.
- Consent mode, script category gating, anonymized mode, retention windows.
- GA4 recommended events, especially ecommerce events such as `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, and `refund`.
- CSV export and dashboard filters by time range/module/source/currency.

Roadmap suggestions:

- Add analytics instrumentation as part of every public feature build, not after the fact.
- Google Consent Mode requires tag behavior to respect consent state, so settings/content should include consent UI before GA4/ads adapters ship.

## Settings

Current implementation:

- Settings updates business name, contact email, timezone, theme preset/primary color, hero image URL, media driver, and enabled modules.
- Module toggles operate on enabled module IDs only; module statuses are only `active` or `future`.
- No domain, tenant, embed keys, CORS allowlist, public visibility, per-module configuration, email sending verification UI, consent/privacy policy settings, backup/export settings, or role management.

Implementation pass - Codex 2026-06-07:

- Settings is now structured into Business, Theme and media, Modules, and Security/data foundation sections.
- Module controls display readiness, primary gaps, and required platform modules. The persisted shape remains the existing enabled module ID list.
- Security/data foundation rows identify the schema work needed for site/tenant scoping, module installation/settings, audit logs, roles/permissions, sessions, login attempts, signed API keys, allowed origins, and data requests.

Missing to be fully featured:

- Site/domain/tenant settings.
- Module installation/configuration/visibility/beta flags.
- Embed keys and allowed origins.
- Sender domain verification and Postmaster-style delivery health.
- Privacy, terms, cancellation/refund/shipping/photo release policy URLs/text.
- Role/user management and permission assignment.
- Import/export/backup/restore controls.

Roadmap suggestions:

- Split Settings into Business, Modules, Security, Integrations, Policies, Email, Data, and Theme sections.
- Add permission sets instead of only string roles. Salesforce's security guide describes object permissions, profiles, and permission sets as separate access layers.

## Help

Current implementation:

- Help is a static admin user guide with common workflows and troubleshooting notes.
- It does not know which modules are enabled, which features are pending/manual, which worker/integration setup is incomplete, or which roadmap items changed recently.

Implementation pass - Codex 2026-06-07:

- Help now reads enabled modules and platform status, shows module readiness/mode, current warnings, common workflows with honest manual/foundation notes, and the security/compliance foundation checklist.

Missing to be fully featured:

- Context-aware help based on enabled modules and feature readiness.
- Setup checklist and handoff progress tied to settings/integrations.
- Release notes/what changed.
- Troubleshooting for email worker, unavailable booking slots, R2 uploads, module toggles, public form throttling.
- Links to public docs/policies per client.

Roadmap suggestions:

- Add Help as a roadmap module. The current "What We Might Be Missing" mentions support/help, but the implementation already has it.
- Add status/release-note patterns. Atlassian Statuspage documents incident templates, component status, subscriptions, and status embeds; similar patterns fit client-safe support and operational transparency.

## Admin Roles, Security, Compliance

Current implementation:

- Auth uses JWT cookies, bcrypt password hashes, production `AUTH_SECRET` checks, and in-memory login lockout.
- Protected admin layout uses `requireAdmin()`. Server actions generally require admin.
- Public form/testimonial submissions have DB-backed rate limits and honeypots.
- No CSRF token system, persistent login attempt storage, MFA, audit logs, role/record permissions, CSP, upload scanning, signed embeds, or data export/delete workflows are present.

Implementation pass - Codex 2026-06-07:

- Added read-only visibility for `AUTH_SECRET`, email worker, sender verification, R2, and manual/foundation module risks through `lib/platform-status.ts`, Dashboard, Settings, and Help.
- Deferred schema changes remain: persistent login attempts, session revocation, MFA-ready fields, audit logs, module/record permissions, signed embed/API keys, allowed origins, and export/delete data request records.

Missing to be fully featured:

- Role and permission model: owner/admin/staff/photographer/fulfillment/accountant/viewer plus record-level ownership.
- Audit logs for all sensitive events.
- CSRF strategy for server actions/forms, especially state-changing admin actions.
- Persistent auth rate limit and session revocation.
- Signed public embeds and strict CORS allowlists.
- Data retention, export/delete, backups.
- WCAG 2.2 AA test plan and release gate.

Roadmap suggestions:

- Move security/compliance from a section to a platform workstream with checklist gates per module.
- OWASP API Security Top 10 names object-level and function-level authorization among 2023 risks; this directly maps to module and record permissions.
- W3C advises WCAG 2.2 as the current accessibility target, including newer criteria such as focus appearance, target size, redundant entry, and accessible authentication.

## Recommended Priority Adjustments

1. Phase 0 should include tenant/site scoping, audit logs, module manifests, role/permission sets, and export/backup basics before more public commerce/gallery surface area.
2. Phase 1 scheduling should include external calendar conflict checks, client cancel/reschedule links, reminders, and slot diagnostics before multi-staff complexity.
3. Phase 2 should add CRM timeline/tasks/consent records alongside forms, because forms without timeline/consent become hard to reason about later.
4. Phase 3 should build public gallery access and favorites before print sales. Proofing is the value path.
5. Phase 4 commerce should build cart/order/payment math and webhooks before storefront polish.
6. Automation and analytics should be wired as platform services during each public feature build, not as isolated admin pages afterward.

## Sources Used

- Calendly multi-person scheduling: https://calendly.com/help/multi-person-scheduling-options-for-your-organization
- Cal.com webhooks: https://cal.com/docs/developing/guides/automation/webhooks
- Google Calendar FreeBusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Invoicing: https://docs.stripe.com/invoicing
- Stripe webhooks: https://docs.stripe.com/webhooks
- Shopify Storefront API: https://shopify.dev/docs/api/storefront/latest
- WooCommerce Store API: https://developer.woocommerce.com/docs/apis/store-api/
- Square Web Payments SDK: https://developer.squareup.com/reference/sdks/web/payments
- PCI SSC SAQ A iframe guidance: https://www.pcisecuritystandards.org/faqs/1438/
- HubSpot CRM concepts: https://developers.hubspot.com/docs/api-reference/latest/crm/understanding-the-crm
- Jotform online forms/signature features: https://www.jotform.com/features/online-forms-with-signature/
- FTC endorsements/reviews: https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews
- FTC CAN-SPAM guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Google LocalBusiness structured data: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Cloudflare Images features: https://developers.cloudflare.com/images/optimization/features/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Pixieset Client Gallery: https://pixieset.com/client-gallery/
- GA4 ecommerce events: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
- Google Consent Mode: https://support.google.com/analytics/answer/10000067
- Gmail sender guidelines FAQ: https://support.google.com/a/answer/14229414
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- Salesforce Security Guide: https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_security_impl_guide.pdf
- MDN Web Components: https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- Atlassian Statuspage features: https://www.atlassian.com/software/statuspage/features/core
