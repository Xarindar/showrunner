# Modular Website Plugin Roadmap

Last researched: June 6, 2026 · Last audit pass: June 7, 2026

## How To Read This Roadmap (Audit Protocol)

This file is both a roadmap and an audit ledger. Every buildable item moves through one lifecycle. **Agents: treat the Status Index below as the source of truth, and _append_ to an item's log blocks rather than rewriting them.**

**Lifecycle:** `⬜ PENDING → 🔵 READY-FOR-AUDIT → 🔍 AUDITED → 🛠 RESOLVED → ✅ CONFIRMED`, with `⚠️ FLAGGED` as the branch for an audited/resolved item that still has an open blocker or a fix that did not fully land.

| Token | State | Meaning |
|---|---|---|
| `⬜ PENDING` | not built | specced only; schema and/or UI absent |
| `🔵 READY-FOR-AUDIT` | built, unaudited | implementer marked it ready; awaiting an audit pass |
| `🔍 AUDITED` | findings recorded | an AUDIT block exists; fixes not yet applied or incomplete |
| `🛠 RESOLVED` | fixes applied | implementer addressed findings; awaiting re-verification |
| `✅ CONFIRMED` | verified | auditor re-checked the code and the fix holds |
| `⚠️ FLAGGED` | needs rework | open blocker, regression, or a resolution that did not fully land |

**Finding severity** (used inside 🔍 AUDIT blocks): `🔴 BLOCKER` · `🟠 HIGH` · `🟡 MEDIUM` · `🟢 LOW`.

**Log block format** — one line per lifecycle step under the item, oldest first:

```
> **🔍 AUDIT · <author> [MM-DD-YY]:** findings, each tagged 🔴/🟠/🟡/🟢 with file:line + fix.
> **🛠 RESOLVED · <author> [MM-DD-YY]:** what changed.
> **✅ CONFIRMED · <author> [MM-DD-YY hh:mm TZ]:** what was re-verified in code (file:line).
> **⚠️ FLAG · <author> [MM-DD-YY hh:mm TZ]:** what is still wrong or not covered.
```

Grep targets: `🔍 AUDIT`, `🛠 RESOLVED`, `✅ CONFIRMED`, `⚠️ FLAG`, or any severity emoji. Full audits that live in their own file are linked from the Status Index.

> Legacy inline phrases ("ready for audit", "waiting for audit", "audited 06-06-26") predate this protocol and are descriptive only — trust the Status Index token and the log blocks over them.

## Status Index

Authoritative current state. `§` = Architecture-Roadmap section number; `—` = cross-cutting.

| § | Item | Status | Open findings | Updated |
|---|---|---|---|---|
| 3 | Commerce — catalog (product/variant/collection/coupon) | ✅ CONFIRMED | — | 06-07-26 |
| 3 | Commerce — cart / order / payment | ⬜ PENDING | schema only, no write paths | 06-06-26 |
| 4 | Photography Portfolio — gallery/admin foundation | 🛠 RESOLVED | public proofing live; comments/approvals/widgets/signed variants pending | 06-08-26 |
| 7 | Forms — field + form builder CRUD | ✅ CONFIRMED | — | 06-07-26 |
| 7 | Forms — destinations / public client linking | ✅ CONFIRMED | — | 06-07-26 |
| 7 | Forms — templates · signatures · automations | ✅ CONFIRMED | clone + notify confirmed; template catalog / booking attach / binding e-sign remain future work | 06-07-26 |
| 8 | Testimonials — collection form | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — admin moderation defaults | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — public module toggle | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — anti-abuse | ✅ CONFIRMED | full moderation audit trail still pending | 06-07-26 |
| 10 | Communications module (admin) | ✅ CONFIRMED | auto-send + template editor still pending | 06-07-26 |
| 11 | Billing / Invoices / Documents | ✅ CONFIRMED | public accept/pay, PDF, partial payments still pending | 06-07-26 |
| 12 | Automation module | 🛠 RESOLVED | non-webhook executors, replay/dead-letter UI, and worker provisioning pending | 06-08-26 |
| 13 | Analytics & Reporting | 🛠 RESOLVED | client adapters, retention controls, and full ecommerce mappings pending | 06-08-26 |
| — | Email controller (`lib/email` outbox) — full report in `Claude Audit - Email Controller 06-07-26.md` | ✅ CONFIRMED | code confirmed; Railway cron remains deploy config to provision | 06-07-26 |

### Cross-Cutting Email Controller Audit Log

> **🔍 AUDIT · Claude [06-07-26]:** Full findings live in `Claude Audit - Email Controller 06-07-26.md`: outbox drain not provisioned, enqueue failures swallowed, bounce suppression scope, provider-event route, unsubscribe/subscribe wiring, missing-recipient visibility, retry backoff, provider idempotency, pooled SMTP, and worker-route hardening.
> **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — code fixes are applied: queue failures write failed/suppressed `EmailOutbox` rows, missing recipients write `no_recipient`, bounces suppress `ALL`, subscribe/unsubscribe routes exist and resubscribe clears marketing suppressions, provider events are routed through a secret-protected idempotent endpoint, retry backoff starts at 5 minutes, SMTP uses a pooled transport, deterministic message ids mitigate duplicate sends, worker secret checks are timing-safe, and both CLI/HTTP workers honor `EMAIL_WORKER_LIMIT`.
> **⚠️ FLAG · Codex [06-07-26 09:34 CDT]:** Railway cron provisioning is deployment configuration for this early dev environment, not a local-code defect. `.env.example`, README, and the handoff checklist document the worker secret and cron service requirement; the actual Railway scheduled service still needs to be configured and verified in the deployment.
> **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Code fixes in this file's log verified (the full report has its own ledger). Queue failures and missing recipients persist as `FAILED`/`SUPPRESSED` `EmailOutbox` rows (`lib/email/queue.ts:57-92,154-168`); suppression blocks per scope including `ALL`/`TRANSACTIONAL` (`:33-43`). Subscribe/unsubscribe exist (`app/unsubscribe/[token]/route.ts`, `lib/email/subscriptions.ts`); provider events route through a secret-protected endpoint (`app/api/internal/email-provider-events/route.ts`, `lib/email/provider-events.ts`). Retry backoff starts at 5 min (`lib/email/process.ts:7,14-19`), SMTP is pooled (`lib/email/provider.ts:25`), and deterministic message ids plus `idempotencyKey` unique dedup mitigate duplicate sends (`process.ts:21-24`, `queue.ts:45-55`). Worker route + `EMAIL_WORKER_LIMIT` present (`app/api/internal/email-outbox/route.ts`, `scripts/process-email-outbox.ts`). The FLAG is accurate: the Railway scheduled service is deployment config, not a code defect, and still needs provisioning.

## Product Direction

Showrunner should become a reusable operating layer for client websites: one installable module system that can power booking, commerce, galleries, portfolios, client records, and operational admin tools across many site types.

The current app already has the right spine for this: Next.js, Prisma/Postgres, module registration in `shell/modules.ts`, site settings, theme tokens, native scheduling, client records, media, and a protected admin. The next step is to separate "client website shell" from "portable business modules" so the same core can be embedded into existing sites, deployed as a standalone admin, or mounted inside a Next.js app.

## Research Basis

- Reusable embed architecture should support both framework-native installation and framework-agnostic widgets. MDN describes Web Components as reusable custom elements with encapsulated functionality, which fits cross-site booking/cart/gallery widgets: <https://developer.mozilla.org/en-US/docs/Web/Web_Components>
- For Next.js sites, multi-zone architecture can let separate apps share one domain while remaining independently deployed: <https://nextjs.org/docs/app/guides/multi-zones>
- Third-party embed scripts should use controlled loading strategies. Next.js documents the `Script` component for optimized third-party script loading: <https://nextjs.org/docs/api-reference/next/script>
- Media-heavy sites should use responsive image optimization. Next.js `Image` provides automatic optimization, and Cloudflare Images supports dynamic variants and R2-backed workflows: <https://nextjs.org/docs/app/api-reference/components/image>, <https://developers.cloudflare.com/images/get-started/>
- Scheduling integrations should be adapter-based. Cal.com exposes bookings, schedules, add-to-calendar links, OAuth, and webhooks; Google Calendar exposes free/busy queries for availability checks: <https://cal.com/docs>, <https://cal.com/docs/developing/guides/automation/webhooks>, <https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query>
- Commerce should avoid handling raw card data in v1. Stripe Checkout supports hosted or embedded checkout for one-time payments and subscriptions, while Shopify Storefront API exposes products, carts, and checkout URLs: <https://docs.stripe.com/payments/checkout>, <https://shopify.dev/api/storefront>
- Alternate commerce/payment adapters should account for Square and WooCommerce. Square has a Web Payments SDK, and WooCommerce exposes REST and Store APIs for products, orders, customers, cart, and checkout: <https://developer.squareup.com/docs/web-payments/quickstart>, <https://developer.woocommerce.com/docs/apis/>
- Accessibility needs to be a first-class release gate. W3C recommends WCAG 2.2 for future applicability: <https://www.w3.org/TR/WCAG22/>
- API and admin security should use OWASP API Security Top 10 2023 as a baseline, especially object-level authorization and function-level authorization: <https://owasp.org/API-Security/editions/2023/en/0x10-api-security-risks/>
- Email, subscriptions, and recurring billing need compliance-aware defaults. FTC CAN-SPAM guidance distinguishes commercial from transactional email; FTC negative-option/click-to-cancel rulemaking is active again as of 2026 after the prior 2024 rule was vacated, so design for clear consent, easy cancellation, and audit records without treating this file as legal advice: <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>, <https://www.ftc.gov/legal-library/browse/rules/negative-option-rule>
- Search and analytics modules should emit structured data and standard events. Google documents LocalBusiness structured data, image SEO, and GA4 recommended ecommerce events: <https://developers.google.com/search/docs/appearance/structured-data/local-business>, <https://developers.google.com/search/docs/appearance/google-images>, <https://developers.google.com/analytics/devguides/collection/ga4/reference/events>
- PCI scope should stay small by using hosted/payment-processor checkout where possible. PCI DSS SAQ A is the reference point for merchants outsourcing payment pages to compliant third parties: <https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf>

## Target Site Types

- Service businesses: salons, admissions consultants, coaches, repair services, rentals, studios, clinics that do not need HIPAA-grade workflows, classes, and local providers.
- Photographers and creative studios: portfolio galleries, proofing, print/product sales, client albums, bookings, invoices, contracts, and digital delivery.
- Product shops: small catalogs, collections, inventory, coupons, checkout, shipping, local pickup, taxes, order management, and customer accounts.
- Venues and event businesses: date availability, packages, inquiries, deposits, contracts, tours, galleries, and add-ons.
- Portfolio-first brands: artists, makers, builders, designers, restaurants, stylists, and agencies that need galleries plus lead capture.
- Membership or recurring-service businesses: subscriptions, retainers, passes, class packs, renewals, cancellation, and client self-service.

## Architecture Roadmap

### 1. Core Platform Foundation

Build a stable platform core that every module uses.

- Multi-site model: add `Site`, `SiteDomain`, and `Tenant` boundaries instead of a single `SiteSettings` row.
- Module manifests: each module declares admin routes, public routes, widgets, permissions, Prisma models, dependencies, settings schema, seed data, and export/import handlers.
- Capability flags: distinguish `enabled`, `installed`, `configured`, `visibleToPublic`, and `beta`.
- Theme contract: keep CSS variables and presets, but add per-module token slots for cards, booking flows, gallery grids, commerce badges, and form controls.
- Embed layer: support three delivery modes:
  - Next.js package/component for sites we control.
  - Web Component widget for non-Next sites.
  - Iframe fallback for hostile CSS environments or strict client sites.
- Public API layer: versioned REST or RPC endpoints for widgets, with signed site keys, CORS allowlists, rate limits, and stable response schemas.
- Admin shell: keep one protected admin, but make dashboards module-aware and role-aware.
- Data lifecycle: module-level import/export, archive/delete, audit logs, backups, and migration scripts.

### 2. Scheduling Module

Current status: native service booking exists with services, availability rules, blockouts, intake prompt, booking policy, public booking flow, appointments, and clients.

Next requirements:

- Multi-staff scheduling with staff profiles, locations, skills, service assignment, and per-staff availability.
- Resource scheduling for rooms, equipment, vehicles, booths, and rentable spaces.
- Appointment types: one-on-one, group class, event, consultation, recurring appointment, waitlist, request-only approval, and paid deposit booking.
- Calendar adapters: native, Google Calendar, Cal.com, ICS feed, and later Outlook.
- Booking rules: buffers, lead time, max advance window, capacity, cancellation window, reschedule limit, timezone, holidays, blackout ranges, and manual approval.
- Payments: optional deposits, no-show fees, pay-in-full, coupons, package credits, gift cards, and refunds.
- Notifications: confirmation, reminder, cancellation, reschedule, waitlist opening, admin digest, and internal assignment alerts.
- Client self-service: confirm, reschedule, cancel, update intake, pay balance, upload files, and view appointment history.
- Admin views: calendar month/week/day, agenda queue, staff/resource filters, drag-to-reschedule, bulk blockouts, and conflict warnings.

### 3. eCommerce Module

Commerce should be modular because some sites need only "buy this print" while others need a real shop.

Implementation status:

- Product catalog admin surface, starter data, and module activation: audited 06-06-26 (see note).
- Commerce foundation data models for products, variants, collections, coupons, carts, orders, order items, and payments: audited 06-06-26 (see note).
- Hosted-checkout-oriented payment records without raw card storage: audited 06-06-26 (see note).

> **🔍 AUDIT · Claude [06-06-26]:** commerce foundation
>
> **Verdict:** The data foundation is solid and the catalog admin (products, variants, collections, coupons) is functional with shared validation, pagination, and per-site enable. Everything *downstream* of the catalog — cart, order, payment — is **schema-only**: no code creates carts/orders/payments yet, so the correctness-critical commerce math is unbuilt and untested. Safe to keep building on; **do not represent checkout/orders as working.**
>
> **What's good (keep):**
> - Money is integer cents throughout; `Order`/`OrderItem` snapshot name/sku/price at write time; `onDelete: Restrict` on product → cart/order items protects order history (`prisma/schema.prisma`).
> - `Payment` is correctly hosted-checkout shaped — `externalPaymentId`, `externalCheckoutSession`, `hostedReceiptUrl`, `rawSummary`, no card/PAN fields. ✔ meets "no raw card storage."
> - Validation moved to a shared zod layer (`lib/admin-validation.ts`): money regex → cents, currency `[A-Z]{3}`, negatives rejected, coupon amount/percent mapped by type. Dispatch now enforces `enabledModuleIds` (disabled modules 404). Seed ships a starter collection/product/coupon and gates the admin-password reset behind `RESET_ADMIN_PASSWORD`. Good follow-through on the prior audit.
>
> **Must-fix before commerce ships:**
> 1. 🔴 **`parseForm` throws uncaught.** It uses `schema.parse` (`lib/admin-validation.ts:217`); any bad admin input (e.g. price `"abc"`) throws a ZodError that no action catches → 500 / error boundary, not a field message. The public booking path uses `safeParse` + friendly return; commerce/admin actions must do the same. This affects *every* `parseForm` caller (products, and the refactored service/client/settings actions), so fix it centrally.
> 2. 🟠 **Dev marker leaked into the UI.** The success banner literally renders `"Commerce changes saved. waiting for audit"` (`modules/products/page.tsx:81`). Remove before any client sees it.
> 3. 🟠 **Two sources of price truth.** `createProductAction` mirrors `basePrice` into a `"Default"` variant, but `updateProductAction` never touches variants → product price and default-variant price drift after any edit. Also the default variant's `isActive` is set only at create time from status, so a product later activated via `updateProductStatusAction` keeps an **inactive** default variant (not purchasable). Decide which is authoritative and sync it. (`modules/products/actions.ts:33-62, 77-111`)
> 4. 🟠 **Dual inventory counters.** `trackInventory`/`inventoryQuantity` exist on both `Product` and `ProductVariant`, set independently, with no rule for which governs and no reservation/decrement. Define the authority before checkout or overselling is guaranteed. (`schema.prisma:209-233`)
> 5. 🟠 **No money upper bound.** `moneyCents` has no max (`lib/admin-validation.ts:17`); a price ≥ ~$21.47M overflows the INT4 `*Cents` column on insert (raw DB error). Cap server-side; consider BigInt cents for headroom.
>
> **🛠 RESOLVED · Codex [06-07-26]:** audit fixes applied
>
> - Resolved: shared `parseForm` now uses `safeParse`, redirects back to the referring admin page with an `error=` message, and affected admin pages render that error instead of falling into a 500. The adjacent Forms and Testimonials local admin parsers were also updated to the same safe-redirect pattern.
> - Resolved: visible `"waiting for audit"` success-banner text was removed from Products, Forms, and Testimonials UI. Audit state stays in this roadmap only.
> - Resolved: product base price/status/SKU/default inventory now sync to the default variant on product save; status toggles also activate/draft the default variant. Product base price is the catalog-level default price, while non-default variants may override price.
> - Resolved by rule: inventory authority is variant-level for checkout. Product-level inventory remains only as a default-variant mirror/convenience until cart/reservation logic lands, and the Products UI now states that rule.
> - Resolved: money input now caps cents to the PostgreSQL `INT4` limit before database insert.
> - Hardened from traps: clearing a product slug on edit preserves the existing slug instead of silently rewriting public URLs; duplicate coupon codes now show an error instead of overwriting the existing coupon; coupon discounts must be greater than zero.
>
> **✅ CONFIRMED · Claude [06-07-26 01:45 CDT]:** All six verified in code. `parseForm` uses `safeParse` + error redirect (`lib/admin-validation.ts:240-251`); no "waiting for audit" text remains anywhere in `modules/`; `updateProductAction` and `updateProductStatusAction` sync the default variant through `syncDefaultVariant` (`modules/products/actions.ts:25-69,150-179`); `moneyCents`/`optionalMoneyCents` cap at the INT4 max (`lib/admin-validation.ts:9,20-27`); slug-preserve-on-clear (`products/actions.ts:121-127`), coupon `P2002` error redirect (`:264-281`), and the coupon `>0` refines (`admin-validation.ts:231-238`) are all present. Admin pages render the `error=` param (`products/page.tsx:95`, `forms/page.tsx:130`, `testimonials/page.tsx:70`), and the Products UI states the variant-level inventory rule (`products/page.tsx:203,385`).
>
> **Traps to design for when cart/checkout/orders get built (all absent today):**
> - `Order.orderNumber` is `@unique` with **no generator** — needs a collision-safe scheme (DB sequence or insert-retry); naive sequential numbers race.
> - Cart/Order totals (`subtotal/discount/tax/total Cents`) are denormalized with no invariant. Build **one** authoritative recompute function and call it on every mutation; never trust client-supplied totals.
> - Cart line prices snapshot at add-time with no reprice-at-checkout step → long-lived `OPEN` carts will bill stale prices.
> - Currency is free-form per row; nothing enforces one currency per cart/order — reject mixed-currency carts, and don't sum multi-currency order totals (the dashboard stat already does `formatMoney(sum)` assuming USD).
> - Coupon: model allows an inconsistent state (`amountCents` and `percentOff` both nullable, no DB check). The form transform guards it correctly, but a check constraint or a single `value` field is safer. `startsAt/endsAt` windows + min value aren't in the UI; `createCouponAction` **upserts on code** (silently overwrites an existing coupon); redemption limits are stored but unenforced.
> - `generateUniqueCommerceSlug` is check-then-insert (TOCTOU) — concurrent same-name creates can collide on the unique slug. And `updateProductAction` regenerates the slug from the slug field, so clearing that field silently rewrites the public `/shop/<slug>` URL (SEO/link break).
>
> **Tenancy:** all 9 commerce tables are single-tenant with **global** uniques (`Product.slug`, `Coupon.code`, `Order.orderNumber`). When the `Site`/tenant boundary lands (§1), each needs a tenant column + composite uniques — retrofitting uniques after data exists is painful, so account for it now.
>
> **Note:** the admin advertises `/shop/<slug>` and `/shop/collections/<slug>` URLs, but no public `/shop` route exists yet (storefront pending) — those links 404 today.

Core requirements:

- Product catalog: products, variants, SKUs, options, collections, tags, attributes, image galleries, related products, and active/draft states. Product/variant/collection/SKU/tag/attribute/status foundation is audited 06-06-26; image galleries and related products remain pending.
  > **🔍 AUDIT · Claude [06-06-26]:** Catalog CRUD works (create/edit product, add variant, create collection + add-to-collection, create coupon) with status filter + pagination. Today products carry a single `imageUrl` only — no image gallery, no `related products`. `tags`/`attributes` are untyped JSON with no validation or queryable index (a GIN index or a real Tag table is needed before "filter by tag"). See the price/inventory/slug must-fixes in the foundation note above.
- Cart and checkout: cart widget, saved cart, checkout handoff, taxes, shipping, pickup, discount codes, gift cards, and abandoned-cart hooks. Cart/order/coupon data foundation is audited 06-06-26; widgets, tax/shipping, gift cards, and abandoned-cart hooks remain pending.
  > **🔍 AUDIT · Claude [06-06-26]:** `Cart`/`CartItem`/`Coupon` tables and indexes are well-shaped, but **no cart code path exists** — nothing adds to a cart, applies a coupon, or computes `subtotal/discount/total`. The `CartStatus.ABANDONED` state and `expiresAt` are present but unused (no abandoned-cart job). When building this, see the foundation note: single authoritative totals recompute, reprice-at-checkout, one-currency-per-cart, and enforce coupon windows/limits/redemptions.
- Order management: orders, statuses, fulfillment, refunds, notes, invoices/receipts, customer history, and admin notifications. Order/status/customer-link data foundation is audited 06-06-26; fulfillment UI, refunds, receipts, and notifications remain pending.
  > **🔍 AUDIT · Claude [06-06-26]:** `Order`/`OrderItem`/`Payment` tables, indexes, and the snapshot pattern are sound, but there is **no order create/read surface** — orders are only read by the Products dashboard stats (`order.count` / `aggregate`), which return zero because nothing writes orders. Before this is real: implement collision-safe `orderNumber` generation, the totals recompute, and an order list/detail UI. `OrderStatus` has both `DRAFT` and `PENDING` — document the intended lifecycle so statuses aren't used inconsistently.
- Payment adapters: Stripe Checkout first, then Square, Shopify checkout handoff, WooCommerce sync, and manual invoice/pay-later. Provider/status/external checkout fields are audited 06-06-26; live adapters remain pending.
  > **🔍 AUDIT · Claude [06-06-26]:** Record shape is correct for hosted checkout — `PaymentProvider` (MANUAL/STRIPE/SHOPIFY/SQUARE/WOOCOMMERCE) and `PaymentStatus` enums are ready, with external id/session/receipt fields and **no card data**. ✔ No adapter, no checkout-session creation, and no webhook handler exist yet. When adding webhooks: verify signatures, make handlers idempotent (key off `externalPaymentId`/session), and **sanitize provider payloads before storing in `rawSummary`** so no PII/PAN lands in the DB.
- Digital products: secure downloads, expiring links, license notes, proof galleries, and file delivery tracking.
- Service-commerce crossover: sell deposits, packages, retainers, class passes, paid add-ons, and booking bundles.
- Subscriptions: recurring billing, plan changes, cancellation, renewal reminders, failed payment recovery, consent snapshots, and audit logs.
- Analytics: GA4 `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `refund`; server-side conversion hooks where configured.

### 4. Photography Portfolio Module

Photography needs more than a generic gallery because proofing, privacy, and sales matter.

Implementation status:

- Portfolio/gallery admin foundation, Prisma models, starter seed data, module registration, gallery status/visibility controls, item records, proofing/download flags, private access links, public gallery/access-token routes, downloads, and favorites capture are partially live as of 06-08-26.
- Gallery widgets/lightbox, comments/approvals/revision rounds, selected-image export, download bundles, print/lab workflows, upload batch tooling, fully signed/private object delivery, and booking/commerce tie-ins remain pending.

- Portfolio collections: featured galleries, categories, cover images, captions, location/date metadata, and SEO-ready image pages.
- Client proofing: private galleries, password or magic-link access, favorites, comments, approvals, revision rounds, and selected-image export.
- Print/product sales: connect gallery images to print sizes, framing, digital downloads, packages, taxes, fulfillment, and lab/export workflows.
- Delivery: zip/download bundles, expiring links, watermark toggles, download permissions, and high-res/original handling.
- Booking tie-in: gallery visitors can book sessions tied to a package or campaign.
- Performance: responsive variants, blur placeholders, lazy loading, CDN transformations, alt text, and batch upload.
- Rights management: model release/usage notes, license expiration, hidden/private assets, and copyright display.

### 5. General Gallery and Media Module

The existing media module should grow into a full asset library.

- Asset library: folders, tags, alt text, focal point, captions, credit/byline, usage context, and public/private state.
- Transform pipeline: original storage plus generated variants for thumbnail, card, hero, full-screen, social, and download.
- Gallery layouts: masonry, editorial grid, carousel, lightbox, before/after, video gallery, file gallery, and mixed media.
- Attachments: files attached to clients, bookings, products, forms, contracts, and admin notes.
- Storage adapters: repo assets for small sites, R2 for scalable storage, Cloudflare Images for transformations, and future S3-compatible drivers.
- Safety: file type allowlist, size limits, virus scanning hook, private signed URLs, image CSP, and deletion lifecycle.

### 6. Client Book / CRM Module

Current status: clients, notes, appointment history, and private notes exist.

Next requirements:

- Unified contact record: people, companies/families, multiple emails/phones, addresses, tags, preferences, timezone, pronouns, birthdays/anniversaries where useful.
- Timeline: bookings, orders, invoices, forms, emails, notes, uploads, gallery activity, payments, and status changes.
- Segments: saved filters for leads, active clients, VIPs, past due, upcoming appointment, recent purchase, no recent activity.
- Lead pipeline: inquiry, contacted, proposal sent, booked, completed, follow-up, archived.
- Client portal: profile, appointments, orders, invoices, files, forms, messages, favorites, and gallery access.
- Consent and preferences: email/SMS opt-in, marketing tags, policy acceptance history, photo usage release, and data deletion/export request tracking.
- Import/export: CSV import, duplicate merge, export all client data, and handoff reports.

### 7. Forms, Intake, and Contracts

This is the missing bridge between scheduling, client books, photography, and commerce.

- Form builder: text, textarea, select, checkbox, radio, date, typed signature, required fields, hidden metadata, admin field builder, public renderer, and submission storage are audited with fixes applied as of 06-07-26; file upload, conditional sections, and binding e-signature workflows remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > Create → render → store works end-to-end, and the validation plumbing the prior commerce audit flagged (`parseForm` throwing, the "waiting for audit" banner, missing error display) was fixed *during* this audit — `modules/forms/actions.ts` now uses `safeParse` + a friendly `?error=` redirect that the admin page renders. Remaining issues, in priority order:
  > - 🔴 **It is a field *adder*, not a field builder.** The only field mutation is `createFormFieldAction` — there is **no edit, delete, or reorder** action (`modules/forms/actions.ts`), and the fields table renders read-only (`modules/forms/page.tsx:387-418`). A typo'd or wrong-type field can't be fixed or removed, only buried under new ones; `sortOrder` is editable only at create time. Forms themselves can't be deleted either — the toggle only flips ACTIVE↔DRAFT and never reaches the `ARCHIVED` state that exists in the enum. Build field edit/delete/reorder + form archive/delete before this is client-ready (and per the §Quality Gates, every destructive action needs confirm + audit).
  > - 🟠 **Hidden "metadata" is client-spoofable.** The renderer emits `<input type="hidden" value={placeholder}>` and `actions.ts:236` takes the POSTed value whenever it's non-empty (`field.type === HIDDEN && !rawValue ? placeholder : rawValue`), so any caller can override a hidden field by sending `field-<id>`. Don't treat hidden fields as server-authoritative; inject trusted metadata server-side instead.
  > - 🟠 **Submissions are keyed by field label, not id.** `data[field.label] = value` (`actions.ts:246`) — two fields sharing a label silently overwrite each other, and the submitter-name heuristic `label.toLowerCase().includes("name")` (`actions.ts:248`) grabs the first label containing "name", so a "Company name" field above "Your name" mislabels the submitter. Key stored answers and detection by field id/type, not free-text label.
  > - 🟠 **Slug edit silently rewrites public URLs (TOCTOU + clear-to-regenerate).** `generateUniqueFormSlug` is check-then-create (`actions.ts:95-111`), so concurrent same-name creates can collide on the `@unique` slug; and `updateFormAction` regenerates from the slug field every save, so clearing that field rewrites `/forms/<slug>` and breaks existing links. Same class as the commerce slug finding.
  > - 🟠 **Three forked copies of `parseForm`.** The fix was pasted into `lib/admin-validation.ts:232`, `modules/forms/actions.ts:33`, and `modules/testimonials/actions.ts:32` (plus a forked `redirectWithValidationError` in each) rather than importing the shared exported one. Parameterize the fallback path and import the shared `parseForm` so the next fix lands in one place.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** shared validation helper — Forms and Testimonials now import the shared `parseForm`/`formObject` helper from `lib/admin-validation.ts`, and `parseForm` accepts a fallback path so validation redirect behavior stays centralized.
  >
  > **✅ CONFIRMED · Claude [06-07-26 01:45 CDT]:** Verified — both import from the shared module (`modules/forms/actions.ts:8`, `modules/testimonials/actions.ts:7`); no forked `parseForm`/`redirectWithValidationError` remains in either, and the `parseForm(schema, formData, fallbackPath)` signature is in place (`lib/admin-validation.ts:240`).
  >
  > **RESOLVED - Codex [06-07-26]:** field edit/delete/reorder-by-sort controls, confirmed form archive/delete, and form duplication are now in the admin. Public submissions are keyed by field id with labels preserved for display, hidden fields use the saved server-side placeholder instead of trusting posted hidden values, clearing a slug on edit preserves the existing public URL, and unique slug collisions redirect with a friendly admin error.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — added `FormFieldRole` metadata, admin role controls, migration backfill for common starter identity fields, and seed roles. Public submissions now derive submitter name/email from field role metadata (or an email field type for email fallback), not from a free-text label heuristic; hidden fields continue to use the saved server-side value.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Holds in code. Field edit/delete/reorder exist — `updateFormFieldAction`/`deleteFormFieldAction`, with `sortOrder` writable on both create and update (`modules/forms/actions.ts:280,308,63,295`) and delete gated on `confirmDelete` (`:80-84`). Form delete is `deleteFormAction` with confirm (`:239`); `updateFormStatusAction` accepts any `FormStatus` including `ARCHIVED` (`:40,183`). `duplicateFormAction` clones fields into a `DRAFT` (`:190-237`). Submissions are keyed by `field.id` with the label kept for display (`:376-380`); hidden fields read `field.placeholder`, never the posted value (`:366`). `FormFieldRole` drives submitter name/email with an email-type fallback (`:382-389`), and the schema nulls mismatched role/type pairs (`:65-72`). `FormFieldRole` enum is present (`prisma/schema.prisma:232`). Slug is preserved when cleared (`:149`) and P2002 collisions redirect with a message (`:131,166`).
  >
  > **Tenancy:** `Form.slug` is a **global** `@unique` (`prisma/schema.prisma:442`). When the Site/tenant boundary lands (§1) this needs a tenant column + composite unique — same retrofit the commerce note calls out; account for it before real form data accumulates.
- Form destinations: standalone storage plus client/inquiry lead linking are audited with fixes applied as of 06-07-26; direct booking, order, gallery, and operational attachment flows remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > Client/inquiry linking works: on a `CLIENT`/`INQUIRY` submission with an email, `createPublicFormSubmissionAction` upserts a `Client` (status `lead`) and links the submission (`modules/forms/actions.ts:253-265`). Two problems:
  > - 🟠 **Public input can mutate an existing CRM record.** The upsert does `update: { name: submitterName }` (`actions.ts:257`), so anyone who submits a public form using a known client's email overwrites that client's name. Guard against overwriting an existing non-lead client's name from an anonymous submission (create-only, or only fill blanks).
  > - 🟠 **Four of six destinations are inert but selectable.** Only `CLIENT` and `INQUIRY` do anything; `BOOKING`, `ORDER`, `GALLERY`, and `STANDALONE_LEAD` are stored and otherwise ignored, yet the admin dropdown offers all six with no hint (`modules/forms/page.tsx:159-164`). A client who builds a "Booking" form gets silent nothing — the submission saves but attaches to no booking. Restrict the select to wired destinations, or label the rest "coming soon" so the config isn't misleading.
  >
  > **RESOLVED - Codex [06-07-26]:** public form submissions no longer overwrite an existing client record; they link by email or create a new lead only when none exists. New/edit form destination choices are limited to the currently wired paths: standalone storage, client, and inquiry.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — re-verified the flagged twin path in `createPublicFormSubmissionAction`: existing clients are selected by email and linked by id only, while new leads are created only when no matching client exists. The `BOOKING` destination remains hidden from new/edit choices until booking attachment is built, so the early scaffold is not presented as wired.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Holds. The public submit selects an existing client by email and reuses it by id with no `update` to name; a new `lead` is created only when none matches (`modules/forms/actions.ts:393-409`). `supportedDestinations` is `STANDALONE_LEAD, CLIENT, INQUIRY` (`:16`) and backs both the schema enum and the admin select, so `BOOKING`/`ORDER`/`GALLERY` are no longer offerable. This is the same guard now applied to the testimonials path, closing the cross-module overwrite.
- Templates: contact inquiry and booking intake starter forms are audited with a clone action added as of 06-07-26; photo session questionnaire, venue inquiry, product customization, waiver, model release, contract, and testimonial request templates remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > The two starter forms seed idempotently by slug and render correctly (`prisma/seed.ts:172-243`). But "templates" here are just two **hardcoded `Form` rows** — there is no template/clone primitive, so each remaining template (photo questionnaire, waiver, model release, contract…) means another hand-coded seed block or a full manual rebuild in the admin. Before that list grows, add a real "create form from template" mechanism (a template catalog + clone action) so non-engineers can stamp out forms. Minor: field seeding is gated on `count === 0` (`seed.ts:189,226`), so re-running seed silently refills fields if an admin had emptied a form, and never reconciles edits to the seeded set — fine for now, but it means the seed isn't a safe "reset to template."
  >
  > **RESOLVED - Codex [06-07-26]:** forms can now be duplicated into draft forms with their fields copied, so starter forms can be reused as admin-editable templates. A richer template catalog remains future work.
  >
  > **⚠️ FLAG · Codex [06-07-26 09:34 CDT]:** the richer template catalog, booking-attachment destination, and binding e-signature workflow are future feature scaffolding, not current working claims. Current fixes cover clone/reuse, typed-name acknowledgement capture, and hiding unwired destinations; do not market this as contract-grade e-signature or booking-attached intake until those roadmap items are built.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Clone is real — `duplicateFormAction` copies a form and its fields into a `DRAFT` (`modules/forms/actions.ts:190-237`). The FLAG holds: there is still no template catalog, no booking-attachment destination, and no binding e-signature. Those remain unbuilt and are labeled future work.
- Signatures: typed signature field, timestamped submissions, and user-agent metadata are audited as basic acknowledgement capture; IP capture, PDF export, versioned terms, and binding e-signature workflows remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > Present at a basic level: a `SIGNATURE` field renders as a text input with a "Type your full name" placeholder (`app/forms/[slug]/page.tsx:116`), stored as plain text in `data`, with `createdAt` as the timestamp and `user-agent` captured in `metadata` (`actions.ts:267-279`). The gap to call out: the stored "signature" is **indistinguishable from any other text field** — no dedicated `signedAt`/signer/IP columns and nothing binds it to immutable, versioned terms (both listed pending). That's acceptable as a typed-name acknowledgement, but **do not market it as a binding e-signature** for contracts/waivers/releases until the signed value is captured alongside a frozen terms version + IP. Also note the IP isn't capturable as written — behind Railway's proxy you'll need `x-forwarded-for`, not the socket address.
  >
  > **STATUS - Codex [06-07-26]:** already fixed for basic acknowledgement capture; the binding e-signature pieces remain explicitly pending.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Accurate as typed-name acknowledgement only. A `SIGNATURE` value is stored as plain text in `data`, with `user-agent` in `metadata` and `createdAt` as the timestamp (`modules/forms/actions.ts:418-424`). There is no dedicated `signedAt`/signer/IP column and no binding to frozen, versioned terms — matches the pending list. Do not treat as binding e-signature.
- Automations: create/link client from inquiry or client-targeted form submission plus form-submission email notification are audited with fixes applied as of 06-07-26; create booking request, add tag, create invoice, and unlock gallery remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > The one automation that's built — upsert/link a client on `CLIENT`/`INQUIRY` submit — works (`actions.ts:253-265`). The client-visible trap here is **notify-admin is dead UI**: the admin form collects a "Notify email" with the site contact as placeholder (`modules/forms/page.tsx:178-179, 317-318`), and the action stores `notificationEmail` (`actions.ts:134, 157`), but **nothing ever reads or sends it** — the only mailer in the app is `sendBookingEmails` (`lib/email.ts`), which form submissions never call. So a client configures a notification address and no email is ever sent on submission. Either wire `createPublicFormSubmissionAction` to email on submit, or remove the field until the Automations engine ships — a control that silently does nothing is worse than an absent one, and it directly undercuts the "notify admin" line above being treated as merely "pending."
  >
  > **RESOLVED - Codex [06-07-26]:** public form submissions now call `queueFormSubmittedEmail`, passing the stored notification email as an override when configured, so the Notify email field is no longer dead UI.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — notification wiring remains present through `queueFormSubmittedEmail`, and queue failures are now visible as failed/suppressed `EmailOutbox` rows through the email-controller fixes instead of disappearing into stdout.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Wired. `createPublicFormSubmissionAction` calls `queueFormSubmittedEmail` (`modules/forms/actions.ts:427-435`), which passes the stored `notificationEmail` as `overrideEmail` into `queueAdminEmail` (`lib/email/events.ts:162-182`). Queue failures persist as `FAILED`/`SUPPRESSED` `EmailOutbox` rows via `recordQueueFailure` (`lib/email/queue.ts:57-80,141-151`) rather than stdout. The Notify-email field is no longer dead UI. Remaining automations (booking request, add tag, create invoice, unlock gallery) are still unbuilt as stated.

### 8. Testimonials, Reviews, and Social Proof

This is useful across all site types and should be separate from galleries.

- Testimonial collection forms with permission checkbox are audited with fixes applied as of 06-07-26.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > The public collection path is the right shape: `createPublicTestimonialAction` uses `safeParse`, and forces `status=PENDING`, `permissionGranted=true` (required `z.literal("on")`), and `source="first-party"` server-side (`modules/testimonials/actions.ts:148-176`), so a visitor can't self-approve or spoof provenance. Two issues:
  > - 🟠 **`rating: z.coerce.number()…catch(5)`** (`actions.ts:50, 77`) silently turns *any* invalid rating — 0, 99, "abc", empty — into a **5-star**. Malformed or hostile input becomes a perfect score. Drop `.catch`, validate and surface an error (the `min(1).max(5)` is already there), or clamp explicitly; don't fall back to the best value.
  > - 🟠 **Same public-upsert client mutation as forms** (`findOrCreateClient` → `update: { name }`, `actions.ts:90-104`): a public testimonial submitted with a known client's email rewrites that client's name. See the anti-abuse line for the missing throttle that makes this exploitable at scale.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** testimonial collection fixes — Invalid ratings now fail validation instead of falling back to 5 stars, and public testimonial submissions no longer rewrite an existing client name when the submitted email already exists.
  >
  > **✅ CONFIRMED · Claude [06-07-26 01:45 CDT]:** Verified — `rating` is `z.coerce.number().int().min(1).max(5)` with no `.catch(5)` in both the admin and public schemas (`modules/testimonials/actions.ts:25,52`); the public path calls `findOrCreateClient(..., false)`, so `update: {}` leaves an existing client's name intact (`:65-79,137`).
  >
  > **⚠️ FLAG · Claude [06-07-26 01:45 CDT]:** This client-name-overwrite fix was applied to testimonials **only**. The twin path in **Forms still overwrites it** — `createPublicFormSubmissionAction` upserts with `update: submitterName ? { name: submitterName } : {}` (`modules/forms/actions.ts:352-354`), so an anonymous form submission using a known client's email still rewrites that client's name. This is the exact issue the 06-06-26 §7 Form-destinations audit raised, and it was never resolved there. Apply the same create-only / fill-blanks guard to the forms path.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — the Forms twin path now matches Testimonials: public submissions find an existing client by email and link it without updating the client's name, or create a new lead only when no client exists.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Both sides hold. Testimonials' public path calls `findOrCreateClient(..., false)`, so the upsert runs `update: {}` and an existing client's name is left intact (`modules/testimonials/actions.ts:71-85,164`). The forms twin path now matches — select-by-email, link-by-id, no name write, create-only-when-missing (`modules/forms/actions.ts:393-409`). The §7/§8 cross-module overwrite flagged on 06-07-26 01:45 is resolved on both paths.
- Admin approval queue, rating, source, client association by email, service/product association fields, and featured state are audited with fixes applied as of 06-07-26.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > Queue, status filter, pagination, client-by-email linking, and the feature toggle all work; the `parseForm`/banner/error-display issues were fixed during this audit (now `safeParse` + `?error=` rendered at `modules/testimonials/page.tsx:70`). Remaining:
  > - 🟠 **Admin "Add testimonial" publishes immediately with permission pre-checked.** The form defaults `status=APPROVED`, `featured` checked, *and* `permissionGranted` checked (`modules/testimonials/page.tsx:134, 155, 159`). For an admin transcribing a third-party `source`/`sourceUrl` quote, the pre-checked permission box plus auto-approve means a non-first-party review goes live and featured with consent unverified — which fights the "only first-party reviews that meet policy" rule two lines down. Default permission **unchecked** and status to `PENDING`.
  > - 🟠 **No delete, no moderation trail.** The only mutation is `updateTestimonialModerationAction` (a bare status/featured flip, `actions.ts:133-146`) — there's no delete and no record of who approved/rejected or when. The roadmap lists the audit trail as pending, but flag that today nothing is removable and moderation is unattributable. Reject also keeps the row `featured` if it was featured (the flip only touches the field sent), so a featured→rejected item stays flagged featured in the DB; the public query saves you (it filters `APPROVED`), but the state is inconsistent.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** admin moderation defaults — Admin-added testimonials now default to `PENDING`, with permission and featured unchecked. Rejecting a testimonial clears `featured` so DB state stays consistent. Archive and confirmed delete actions are now present; moderation audit trail remains deferred until the broader audit-log work lands.
  >
  > **✅ CONFIRMED · Claude [06-07-26 01:45 CDT]:** Verified — the admin form defaults status to `PENDING` and leaves permission/featured unchecked (`modules/testimonials/page.tsx:134,155,159`); `updateTestimonialModerationAction` forces `featured:false` when `status===REJECTED` (`modules/testimonials/actions.ts:117`). Delete + moderation audit trail are correctly still absent (acknowledged deferred).
- Display widgets: public grid and homepage quote block are audited with fixes applied as of 06-07-26; carousel, service-specific reviews, and product-specific reviews remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > Both widgets filter correctly: the public grid requires `APPROVED && permissionGranted` (`app/testimonials/page.tsx:19-27`) and the homepage block additionally requires `featured` (`app/page.tsx:19-28`). The real finding is module-disable, and it's **shared with the Forms public surface**:
  > - 🟠 **Public routes ignore the module-enabled flag.** Only the admin dispatch checks `enabledModuleIds` (`app/admin/(protected)/modules/[moduleId]/page.tsx:27`). The public surfaces — `app/testimonials/page.tsx`, the homepage quote block, `app/forms/[slug]/page.tsx`, and the homepage forms list — have **no `enabledModuleIds` guard**, so disabling "testimonials" or "forms" hides the admin nav but leaves the public pages *and the public write actions* fully live. That violates the §Quality Gate "every module can be disabled without orphaning." Gate the public routes and the public server actions (`createPublicTestimonialAction`, `createPublicFormSubmissionAction`) on the enabled set, or make the rule explicit and intentional. carousel / service- / product-specific variants are genuinely unbuilt — confirmed pending (the `serviceName`/`productName` columns exist but nothing filters display by them).
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** public module toggle — Homepage Reviews CTA, featured testimonial block, `/testimonials`, and public testimonial submissions now respect `enabledModuleIds`. The same pass also hid homepage Forms UI and gated `/forms/[slug]` plus public form submissions when Forms is disabled. Testimonials still ship enabled by default for every site; this only controls visibility when a user explicitly disables the module.
  >
  > **✅ CONFIRMED · Claude [06-07-26 01:45 CDT]:** Verified all six surfaces gate on `enabledModuleIds` — homepage Reviews CTA + featured block + forms list and their queries (`app/page.tsx:13-34,68-73,99-105,110-155`), `/testimonials` (`app/testimonials/page.tsx:19`), `/forms/[slug]` (`app/forms/[slug]/page.tsx:148`), and both public write actions (`createPublicTestimonialAction` `modules/testimonials/actions.ts:126`; `createPublicFormSubmissionAction` `modules/forms/actions.ts:299`). No ungated public surface remains for either module.
- Structured data only where allowed by Google guidelines and only for first-party reviews that meet policy.
- Anti-abuse controls: moderation, permission gate, source notes, and basic honeypots are audited with fixes applied as of 06-07-26; shared-store rate limiting and full audit trail remain pending.

  > **🔍 AUDIT · Claude [06-06-26]:**
  >
  > The three claimed controls are real: moderation (default `PENDING`), the permission gate (required checkbox + server `z.literal("on")`), and source notes (`source`/`sourceUrl`). The concrete missing piece is **spam/rate protection on the unauthenticated write endpoints**. Both `createPublicTestimonialAction` and `createPublicFormSubmissionAction` accept unbounded anonymous POSTs, each upserting a `Client` row — no honeypot, no CAPTCHA, no per-IP throttle. A bot can flood the moderation queue and mass-create/mutate client records. Add a honeypot field + per-IP rate limit before these are publicly reachable. ⚠️ Don't model the limiter on `lib/auth.ts` — its login throttle is an in-memory `Map` (`loginAttempts`), which resets on deploy and isn't shared across Railway replicas, so it won't actually limit anything in production; back public rate limiting with the DB or a shared store.
  >
  > **RESOLVED - Codex [06-07-26]:** public form and testimonial submissions now include a honeypot field that exits without writing when filled. A production-grade per-IP/shared-store limiter remains pending and is not marked complete.
  >
  > **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — added a database-backed `PublicRateLimit` table and shared public limiter. Public form and testimonial submissions are now throttled by forwarded/client IP in addition to the honeypot, so the unauthenticated write endpoints no longer rely on an in-memory or browser-only control.
  >
  > **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** DB-backed. `PublicRateLimit` model exists (`prisma/schema.prisma:1070`) and `publicRateLimitMessage` is a per-key window throttle stored in that table, keyed off `x-forwarded-for`/`x-real-ip`/`cf-connecting-ip` (`lib/public-rate-limit.ts:20-68`). Both public writes call it (`modules/testimonials/actions.ts:152`, `modules/forms/actions.ts:354`). Honeypot `companyWebsite` exits without writing when filled (`testimonials:148-150`, `forms:17,350-352`). No in-memory `Map`. The full moderation audit trail is still pending as stated.

### 9. Content and SEO Module

Current status: basic homepage content exists.

Next requirements:

- Page blocks: hero, services, gallery preview, product collection, testimonials, FAQ, staff, CTA, pricing, location, contact, featured booking/product.
- Structured data generators: LocalBusiness, Product, Service, ImageObject, FAQ where appropriate, Event/Class, BreadcrumbList.
- SEO controls: title, description, canonical, Open Graph image, robots, sitemap, redirects, and slug manager.
- Local business support: business hours, departments, locations, service area, phone, map link, and seasonal closures.
- Image SEO: descriptive filenames, alt text workflow, captions, lazy loading, responsive images, and sitemap image hints.

### 10. Communications Module

Current status: SMTP notifications exist.

Implementation status:

- Message template editor, allowed-token metadata, real outbox delivery visibility, manual delivery notes, scoped suppression-list entries, starter seed data, and admin module registration are audited with fixes applied as of 06-07-26.
- Automatic template rendering/sending is not yet wired into booking/order/form flows beyond the existing booking SMTP path. SMS adapters, provider delivery callbacks, bounce handling, retries, unsubscribe enforcement, and quiet hours remain pending.

> **🔍 AUDIT · Claude [06-07-26]:**
>
> The admin surface works end-to-end (create template, toggle active, record a manual log, add a suppression) with `requireAdmin()` on every action, the shared `safeParse`+`?error=` redirect, and a `P2002` guard on duplicate suppression emails. The core problem is architectural: this is a **second, simpler email system grafted onto the same `MessageTemplate` table that the real `lib/email` outbox pipeline already owns**, and the two disagree in ways that can silently break live mail.
>
> - 🔴 **Pausing a template here can disable transactional email.** `page.tsx:36-39` lists *every* `MessageTemplate` row, including the 7 keyed system templates seeded by `seedEmailCore` (`prisma/seed.ts:95-243`) that booking/form emails actually send. `lib/email/queue.ts:61-71` resolves templates with `where: { key, isActive: true }` and **throws "Email template not found" when `isActive` is false**. So clicking "Pause" on `booking.created.customer` flips `isActive=false` (`actions.ts:101-111`) and silently breaks the booking-confirmation send — no warning that these rows are load-bearing. Filter the library to non-keyed templates, or render keyed "system" templates as read-only.
> - 🔴 **Templates created here can never send.** `createMessageTemplateAction` (`actions.ts:81-99`) never sets `key`, and `queueEmail` only ever looks templates up *by* `key`. A template authored in this UI has no key (and no `htmlBody`/`textBody`), so the real pipeline can't find it — it is display-only. The "Create template" form implies these are usable; they are not wired to anything.
> - 🟠 **Suppression is marketing-only and one-way.** `createSuppressionEntryAction` (`actions.ts:139-161`) never sets `scope`, so every entry defaults to `MARKETING` (`schema.prisma:688`). `lib/email/queue.ts:33-43` only blocks transactional mail when `scope` is `ALL`/`TRANSACTIONAL`, so an admin who "suppresses" a contact still sends them transactional email, with no UI to pick scope. There is also **no un-suppress / delete action** anywhere — a contact who re-subscribes can't be removed (`SuppressionListEntry` is append-only), violating the §14 "recovery path" gate. Expose `scope` and add a remove action.
> - 🟠 **The delivery log is hand-typed, not real.** `recordMessageLogAction` (`actions.ts:113-137`) writes a `MessageLog` row from admin form input; actual sends live in `EmailOutbox`/`EmailProviderEvent` (`lib/email/process.ts`, `provider-events.ts`), which this module never reads. So "{sentCount} sent logs" counts manually-entered rows, not delivered mail — misleading as an operational record. `page.tsx:41` also `include: { client: true }`, but `recordMessageLogAction` never sets `clientId`, so that join is always null (dead include).
> - 🟡 **Local re-declarations.** `trimmed`/`requiredText`/`optionalStoredText`/`csvList` are copied into `actions.ts:11-23` instead of imported from `lib/admin-validation.ts`; `enumLabel`/`tokensToCsv` are re-pasted per module. Same forking the 06-06-26 forms audit flagged — centralize.
>
> **RESOLVED - Codex [06-07-26]:** keyed system templates now render read-only and the status action rejects attempts to pause them; admin-created templates are labeled as manual catalog templates rather than send-wired templates. Suppressions now expose `scope` and can be removed with confirmation. The dashboard's sent count and recent delivery table now read `EmailOutbox`, with hand-entered records labeled separately as manual notes. Communications actions now import shared validation helpers instead of redeclaring them locally.
>
> **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — re-verified the communications fixes in code: system templates are read-only in the admin, status changes reject keyed templates, manual templates/logs are labeled as manual, sent counts read `EmailOutbox`, and scoped suppressions can be removed. The remaining automatic-send/template-editor work is a future roadmap item, not a live capability claim.
>
> **Bottom line:** safe as a template/suppression *catalog*, but do **not** describe it as wired to sending. Fix the Pause-breaks-transactional hazard before a client touches it. Honest status: two communications systems coexist, and this admin can desync or disable the one that actually sends.
>
> **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — the pause-breaks-transactional hazard is fixed; the "not wired to sending" warning remains true only for manually created catalog templates and is now labeled that way in the UI.
>
> **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Holds. The pause-breaks-transactional hazard is closed — `updateMessageTemplateStatusAction` looks up `key` and rejects a status change on keyed system templates (`modules/communications/actions.ts:97-104`); the UI marks them with a "System read-only" pill (`modules/communications/page.tsx:190`). Admin-created templates never receive a `key` (`actions.ts:77-87`) and are labeled "manual template" (`page.tsx:108,155`). Suppressions expose `scope` (`actions.ts:60`) and have `deleteSuppressionEntryAction` with confirm (`:165`); `queueEmail` honors `ALL`/`TRANSACTIONAL`/`MARKETING` scope (`lib/email/queue.ts:33-43`). The dashboard sent count and recent table read `emailOutbox`, with hand-typed `messageLog` rows shown separately as manual notes (`page.tsx:47,52,62,215,351`). Validation helpers are imported from `lib/admin-validation` (`actions.ts:7`), not re-declared. Automatic send + template editor remain pending.

Next requirements:

- Email template editor with tokens and preview.
- Transactional emails: booking, order, invoice, gallery, form, password/magic link, reminders.
- Marketing email guardrails: opt-in state, unsubscribe link, suppression list, sender identity, and campaign logging.
- SMS adapter: reminders, confirmations, two-way cancellation/reschedule, consent capture, and quiet hours.
- Inbox/log: sent messages, delivery status, bounce, failure retry, and manual resend.
- Notification routing: admin digest, per-staff alerts, assignment-based notifications, and internal notes.

### 11. Billing, Invoices, and Documents

Implementation status:

- Quotes/invoices/contracts admin foundation, collision-resistant document numbers, server-computed line totals, discounts, tax, guarded status transitions, draft-only mutability, document attachments, starter seed data, and module registration are audited with fixes applied as of 06-07-26.
- Public accept/pay links, hosted checkout handoff, partial payments, PDF rendering, recurring invoices, refund handling, and contract signing/versioning remain pending.

> **🔍 AUDIT · Claude [06-07-26]:**
>
> Best-built of the three. Totals are computed server-side in integer cents, every `*Cents` value is capped at the INT4 max, `recomputeDocumentTotals` (`actions.ts:114-136`) is a single authoritative recompute called inside a `$transaction` on line-item add, and `generateDocumentNumber` (`actions.ts:98-112`) uses a per-day random suffix with a retry loop — the commerce audit's lessons clearly carried over. The real problems are **lifecycle and mutability**, not the math:
>
> - 🔴 **Documents stay fully mutable after they're finalized.** `addBillingLineItemAction` and `addBillingAttachmentAction` (`actions.ts:193-246`) have **no status guard** — you can add line items to a `PAID` or `VOID` invoice, and `recomputeDocumentTotals` rewrites its `subtotal/total` while `paidAt` stays put. A "paid" invoice can silently end up a different amount than what was paid, with no record of the change. Freeze line items/totals once status leaves `DRAFT` (or snapshot on send), per the §14 audit-log gate.
> - 🔴 **No edit or delete anywhere — append-only.** The only line-item mutation is *add*: no edit, no delete, no reorder, and no way to fix the first line item created with the document. Customer name/email, discount, and tax are settable **only at create** (`createBillingDocumentAction`) — no action corrects them afterward. Documents themselves can't be deleted, only flipped to `VOID`. Same "adder, not editor" shape the 06-06-26 forms audit flagged; build line-item edit/delete + document-field edit before this is client-usable.
> - 🟠 **Status transitions are unguarded and lossy.** `updateBillingDocumentStatusAction` (`actions.ts:176-191`) allows any status → any status (`PAID`→`DRAFT`, `VOID`→`PAID`) and sets `acceptedAt`/`paidAt` but **never clears them** on a backward move, so a voided doc keeps its `paidAt`. `OVERDUE` exists in the enum and the dashboard's "open" sum includes it, but nothing ever derives it from `dueAt` — it can only be set by hand. Define the allowed transitions and compute `OVERDUE`.
> - 🟠 **Dashboard sums mix currencies.** `currency` is free-form per document, yet the stat cards sum `totalCents` across all rows and render with `formatMoney(...)` defaulting to USD (`page.tsx:46-53, 93, 100`). A €1,000 and a $1,000 invoice display as "$2,000.00" — the same multi-currency trap commerce flagged. Segment sums by currency, or pin one currency per site.
> - 🟠 **Attachment URL is unvalidated.** `billingAttachmentSchema.url` is plain `requiredText` (`actions.ts:80-85`) with no scheme allowlist. It renders as text today (`page.tsx:380`) so there's no live XSS, but the moment it becomes an `<a href>` a stored `javascript:`/`data:` URL is admin-XSS / open-redirect. Validate `https:` (or `https?:`) now.
> - 🟡 **Two total-math paths + uncaught collision.** `createBillingDocumentAction` computes totals inline (`actions.ts:141-142`) instead of reusing `recomputeDocumentTotals`, so the formula lives twice and can drift. And a `documentNumber` collision (or 8 exhausted attempts) throws a raw error the action doesn't catch → error boundary instead of a friendly retry. Both low-probability; route create through the shared recompute and catch `P2002`.
> - 🟡 **`clientId` trusted unverified.** Passed straight into `create` (`actions.ts:149`); if the selected client is deleted between page render and submit, the FK throws an uncaught `P2003`. Validate existence or catch it.
>
> Money/validation primitives (`moneyCents`, `currencyCode`, `trimmed`, …) are re-declared at `actions.ts:12-31` rather than imported from `lib/admin-validation.ts` — same centralize note as the other two modules.
>
> **RESOLVED - Codex [06-07-26]:** line items, totals, document fields, and attachments are editable only while a document is `DRAFT`; finalized documents render locked. Draft document fields, line-item edit/delete/reorder, and confirmed destructive actions are now present. Status transitions are one-way and terminal for `PAID`/`VOID`; overdue status is derived from `dueAt` before the admin queue renders. Dashboard totals are grouped by currency. Attachment URLs must be public `https:` URLs. Document creation uses the shared recompute path, validates client existence, catches unique/FK failures, and imports money/currency primitives from `lib/admin-validation.ts`.
>
> **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — re-verified draft-only guards on document edits, line-item add/edit/delete, and attachment add actions; finalized documents render locked. Status transitions are constrained server-side, overdue state is derived before rendering, dashboard totals group by currency, attachment URLs use public-HTTPS validation, and create/update paths return admin errors instead of raw Prisma failures.
>
> **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Holds across all six findings. `requireDraftDocument` guards every mutation — document edit, line add/edit/delete, attachment add (`modules/billing/actions.ts:163-173,263,333,377,407,430`) — so a `PAID`/`VOID` doc can no longer have its total rewritten. Line-item edit/delete and `sortOrder` reorder exist (`:370,401,92`); document fields are editable via `updateBillingDocumentAction` (`:256`). Status changes route through `assertAllowedStatusTransition` with `PAID`/`VOID` terminal (`:188-203`); `paidAt` is set only on `PAID` (`:314`). `OVERDUE` is derived from `dueAt` before the queue renders (`modules/billing/page.tsx:64-67`). Dashboard sums group by currency via `groupBy(["currency"])` + `currencyTotalsLabel` (`page.tsx:41-43,85-91`). Attachment URL is `safeExternalHttpsUrl` (`actions.ts:108`), which requires https and blocks private/link-local/metadata hosts (`lib/admin-validation.ts:43-66`). Create routes through `recomputeDocumentTotals` (`:240`), validates client existence (`:175-186,208`), and catches P2002/P2003 (`:244-250`). Primitives imported from `lib/admin-validation` (`:8-18`). Public accept/pay, PDF, partial payments still pending.

- Quotes/proposals with line items, deposits, expiry, and accept/pay flow.
- Invoices with status, partial payments, due dates, tax, discounts, and PDF receipt.
- Contracts and documents attached to clients/bookings/orders.
- Recurring invoices or retainers for service businesses.
- Admin financial dashboard: revenue by service/product, outstanding balances, refunds, and deposits.

### 12. Automation Module

Implementation status:

- Trigger/action rule admin, conditions metadata, explicitly manual run records, webhook endpoint registry, manual delivery records, starter seed data, module registration, event catalog/emitter, rule matching, queued signed webhook dispatch, retry tracking, and worker route/script are partially live as of 06-08-26.
- Non-webhook action executors, replay/dead-letter UI, worker provisioning, Zapier/Make connector support, and scheduled jobs remain pending.

> **🔍 AUDIT · Claude [06-07-26]:**
>
> Clean admin CRUD with `requireAdmin()` everywhere, shared `safeParse` redirects, and sensible conditional validation (`SEND_EMAIL` requires `targetEmail`, `SEND_WEBHOOK` requires `webhookUrl` — `actions.ts:54-61`). The thing to be loud about: **nothing here executes.** The roadmap lists background execution as pending, but the UI hides how little is wired.
>
> - 🔴 **"Run history" and "webhook deliveries" are hand-typed.** `recordAutomationRunAction` and `recordWebhookDeliveryAction` (`actions.ts:137-197`) write `AutomationRun`/`WebhookDelivery` rows from admin form input. No trigger fires a rule, no webhook is ever POSTed, no signature is computed. So the run-history / recent-deliveries tables and the `{runCount}` stat (`page.tsx:64-66, 101`) are demo rows an admin typed — not an audit trail. Label them manual/placeholder, and don't represent the trigger→action engine as working.
> - 🔴 **Webhook endpoints can have no signing secret.** `signingSecret` is `optionalStoredText` (`actions.ts:81`) defaulting to `""` (`schema.prisma:981`); the seed ships the literal `"replace-before-production"` (`seed.ts:575`). The §14 / Quality-Gate rule is "every external webhook is signed." When dispatch lands, an empty secret = unsigned delivery. Auto-generate a secret (`randomBytes`) when blank, never allow empty, and mask the input (`page.tsx:349` is a plain text field).
> - 🟠 **SSRF waiting to happen.** `webhookUrl`/`url` are validated only as well-formed URLs (`actions.ts:23-24, 80`), so `http://` and internal hosts (`http://169.254.169.254/…`, `http://localhost`) pass. Harmless while nothing dispatches, but before the sender is built, restrict to `https:` and block private/link-local ranges + cloud-metadata IPs, or use an egress allowlist.
> - 🟠 **"Conditions" is a single string pair, and unused.** The form collects one `conditionKey`/`conditionValue` and stores `{ [key]: value }` (`actions.ts:47-52`); there is no operator, no multiple conditions, no AND/OR, and **no evaluator reads it**. Fine as a placeholder, but it can't express the trigger filtering the roadmap implies (e.g. "form == contact-inquiry AND amount > 100").
> - 🟠 **Append-only again.** Automations and webhook endpoints can be created and status-toggled but **never edited or deleted** (`actions.ts` has no field-update or delete action). A wrong URL, target email, or trigger can't be corrected — only paused. Add edit/delete with confirm + audit per §14.
> - 🟡 **`events` is unvalidated free text.** A CSV of arbitrary strings (`actions.ts:83-87`) with no check against a known event catalog, so `form.submited` (typo) silently subscribes to nothing once dispatch exists. Define the event names and validate against them. Validation primitives are re-declared locally here too.
>
> **RESOLVED - Codex [06-07-26]:** run and delivery forms/tables are now labeled manual rather than engine output. Webhook signing secrets are generated when blank, seed data no longer ships the literal `replace-before-production`, and secret inputs are masked. Automation/webhook URLs must be public `https:` URLs, event names are validated against a known catalog, and automations plus webhook endpoints now support edit/delete with confirmation. Validation helpers are imported from `lib/admin-validation.ts`.
>
> **🛠 RESOLVED · Codex [06-07-26]:** waiting for audit — hardened the legacy-secret edge case so editing an endpoint with a blank/placeholder secret generates a real secret instead of preserving an unsafe value, and seed now repairs old starter placeholder secrets without rotating valid ones. Manual run/delivery labels, public-HTTPS URL validation, event-catalog validation, edit/delete controls, and masked secret inputs remain in place.
>
> **Bottom line:** the data model and admin shell are reasonable scaffolding, but this is a **record-keeping mock of an automation engine**, not one. Treat run/delivery rows as manual until event emission + signed dispatch exist.
>
> **⚠️ FLAG · Codex [06-07-26 09:34 CDT]:** background execution, signed outbound dispatch, retries, and live event emission are intentionally early product scaffolding/future roadmap work. The admin now labels records as manual and no longer represents the trigger-action engine as live.
>
> **✅ CONFIRMED · Claude [06-07-26 15:10 CDT]:** Holds. Run/delivery rows are admin-entered and labeled — "manual run records" / "Manual run history" / "Manual webhook delivery records" (`modules/automation/page.tsx:122,408,615`). Webhook secrets auto-generate when blank on create, and on edit when the stored secret is blank or the legacy placeholder (`modules/automation/actions.ts:124-130,234,257`); seed generates a real secret and repairs the old `replace-before-production` literal (`prisma/seed.ts:709,715-720`); secret inputs are `type="password"` (`page.tsx:468,529`). URLs use `safeExternalHttpsUrl`, blocking non-https and private/link-local/metadata hosts (`lib/admin-validation.ts:43-66`; actions `:90,47`). Events validate against the `automationEvents` catalog (`actions.ts:27-38,99-102,113`). Edit/delete with confirm exist for both automations and endpoints (`:166,189,244,267`). Validation helpers imported (`:14-23`). The FLAG holds — background execution, signed dispatch, and live event emission are still unbuilt.

- Trigger/action engine:
  - Triggers: booking created, booking canceled, order paid, form submitted, gallery approved, client tagged, invoice overdue.
  - Actions: send email/SMS, update status, create task, add tag, create invoice, request review, notify staff, webhook.
- Webhooks: outbound webhooks with signing secrets, retries, and delivery logs.
- Zapier/Make-ready connector shape later, but first expose a clean webhook/events layer.
- Background jobs: reminders, abandoned carts, recurring invoices, gallery expiration, cleanup, and exports.

### 13. Analytics and Reporting

Implementation status:

- Analytics/admin foundation, Prisma event and goal models, starter seed data, module registration, manual event recording, source attribution summaries, top-event reporting, module metric cards, conversion-goal progress, CSV export, server-side event emission, and first-party UTM/session capture are partially live as of 06-08-26.
- Consent UI/script gating, GA4/Meta/Google Ads/Search Console adapters, server-side conversion hooks, full ecommerce mappings, and retention controls remain pending.

- Dashboard metrics by module: bookings, conversion, revenue, open invoices, top services/products, gallery engagement, client growth.
- Source attribution: UTM capture, referral source, campaign, landing page, first/last touch.
- Standard event layer: `booking_started`, `booking_completed`, `lead_submitted`, `gallery_viewed`, `favorite_added`, `view_item`, `add_to_cart`, `purchase`.
- Integration adapters: GA4, Meta Pixel/Conversions API, Google Ads, Search Console, and simple CSV export.
- Privacy controls: consent mode, script gating by category, anonymized analytics option, and data retention settings.

### 14. Admin Roles, Security, and Compliance

- Roles: owner, admin, staff, photographer, fulfillment, accountant, viewer.
- Permissions: module-level and record-level authorization, especially for staff seeing only their own bookings/clients.
- Audit logs: sign-in, settings change, booking/order updates, exports, deletes, refunds, and role changes.
- Security: rate limits, CSRF protections, signed embeds, strict CORS, webhook signatures, upload validation, CSP, and dependency update cadence.
- Data controls: export/delete client data, retention policy, privacy policy links, consent records, and backups.
- Payment scope: use hosted checkout by default; do not store card data.
- Accessibility release gate: WCAG 2.2 AA target for public widgets and admin flows.

## Module Priority

### Phase 0: Hardening Current Scheduler

Goal: make the current app dependable enough to reuse.

- Add site/tenant abstraction without breaking single-site usage.
- Add module manifest schema and migrate current registry to it.
- Add audit log model.
- Add admin roles.
- Add booking email template settings.
- Add test coverage for availability conflicts, blockouts, buffers, and slug generation.
- Add import/export for services, bookings, clients, and site settings.

### Phase 1: Embeddable Scheduling Plugin

Goal: make booking usable on any site.

- Build public widget API for services, availability, and booking creation.
- Build embeddable booking Web Component.
- Add iframe embed fallback.
- Add signed site key and allowed domain settings.
- Add brand/theme configuration per embed.
- Add Google Calendar adapter.
- Add reminder automation.
- Add client self-service links for cancel/reschedule.

### Phase 2: Client Book and Forms

Goal: make it useful for real client operations, not just appointments.

- Expand CRM fields and client timeline.
- Build form/intake builder. audited with fixes applied 06-07-26

  > **🔍 AUDIT · Claude [06-06-26]:** Full notes under §7 (Form builder). Headline: it's a field *adder*, not a builder — no field edit/delete/reorder and no form delete (`modules/forms/actions.ts`). The prior `parseForm`/banner/error issues were fixed mid-audit, and the public `/forms/<slug>` route + submission action are now gated by the module-enabled flag. Top remaining blockers before this counts as done: add field edit/delete/reorder; wire or remove the dead "Notify email" field; key submissions by field id not label.

- Add form templates and attach responses to clients/bookings. Starter templates, form duplication, and client/inquiry response linking are audited with fixes applied; booking attachment remains pending.

  > **🔍 AUDIT · Claude [06-06-26]:** See §7 (Templates + Form destinations). Client/inquiry response linking works (`createPublicFormSubmissionAction`). **Booking attachment is genuinely absent** — the `BOOKING` destination is stored but inert; nothing attaches a submission to a `Booking`, and the admin dropdown offers it anyway. "Templates" are two seeded `Form` rows with no clone/template primitive to extend.
- Add client portal foundation.
- Add consent/preferences records.
- Add CSV import/merge/export.

### Phase 3: Media, Gallery, and Photography

Goal: support portfolio and proofing sites.

- Expand media library metadata and folders.
- Add gallery model, public gallery pages, gallery widgets, and lightbox. Gallery model/admin foundation and public pages are partially live as of 06-08-26; widgets and lightbox remain pending.
- Add private gallery access. Admin access-link foundation and access-token public delivery are partially live as of 06-08-26; password UX and fully signed/private object delivery remain pending.
- Add favorites/comments/approvals. Favorite records are ready for audit as of 06-07-26; comments and approvals remain pending.
- Add R2/Cloudflare Images transformation strategy.
- Add digital delivery permissions and expiring links.

### Phase 4: Commerce Foundation

Goal: support small shops, deposits, packages, and print sales.

- Add products, variants, collections, coupons, carts, orders, and payments. audited 06-06-26
  > **🔍 AUDIT · Claude [06-06-26]:** Products / variants / collections / coupons are **built + admin-usable** (catalog only). Carts / orders / payments are **schema only - not yet implemented** (no write paths). Full notes under section 3 eCommerce Module -> "Implementation status." Original catalog blockers were resolved on 06-07-26: `parseForm` redirects with visible messages, UI audit-marker text was removed, product/default-variant price and active status sync, and variant-level inventory is the documented checkout authority.
- Integrate Stripe Checkout first.
- Add order dashboard and email receipts.
- Add service add-ons/deposits/packages.
- Add GA4 ecommerce event layer.
- Add Shopify handoff adapter for sites that already run Shopify.

### Phase 5: Advanced Commerce and Operations

Goal: support more business models without bloating the base install.

- Subscriptions/retainers with cancellation and consent audit trail.
- Invoices/quotes/contracts. audited with fixes applied 06-07-26

  > **🔍 AUDIT · Claude [06-07-26]:** Full notes under §11. Headline: solid server-side total math and capped money, but **append-only and mutable-after-final** — no line-item/document edit or delete, and line items can be added to a `PAID`/`VOID` doc, silently rewriting its total. Status transitions are unguarded (`PAID`→`DRAFT`, `paidAt` never cleared) and the dashboard sums mix currencies.

- Gift cards, credits, class packs, and memberships.
- WooCommerce/Square adapters.
- Fulfillment exports and print lab workflow hooks.
- Communications templates/logs/suppressions. audited with fixes applied 06-07-26

  > **AUDIT/RESOLUTION:** Full notes under §10. System templates are read-only, admin-created templates are labeled manual, actual delivery status reads `EmailOutbox`, manual notes are separated, suppressions have scope, and unsuppress is available.

- Automation builder and webhook delivery logs. partially live with queued dispatch as of 06-08-26

  > **AUDIT/RESOLUTION:** Full notes under section 12. Run/delivery records are explicitly manual, webhook secrets are generated and masked, URLs are public-HTTPS validated, event names use a known catalog, automations/endpoints have edit/delete controls, and live module events now queue signed webhook deliveries for worker processing.

- Analytics event/goal admin foundation. partially live with CSV export and server event emission as of 06-08-26

## Data Model Expansion

Likely new models:

- `Site`, `SiteDomain`, `ModuleInstallation`, `ModuleSetting`, `AuditLog`
- `StaffMember`, `Location`, `Resource`, `CalendarConnection`, `ReminderRule`
- `Form`, `FormField`, `FormSubmission`, `ConsentRecord`, `Contract`
- `Product`, `ProductVariant`, `Collection`, `Cart`, `Order`, `OrderItem`, `Coupon`, `Payment`, `Refund`
- `PortfolioGallery`, `PortfolioGalleryItem`, `PortfolioGalleryAccess`, `PortfolioGalleryFavorite` added 06-07-26; `GalleryComment` and `AssetVariant` remain pending.
- `AnalyticsEvent`, `AnalyticsGoal` added 06-07-26; external adapter and consent models remain pending.
- `PublicRateLimit` added 06-07-26 for DB-backed public form/testimonial throttling.
- `Invoice`, `Quote`, `Document`, `Subscription`, `PackageCredit`, `GiftCard`
- `Automation`, `AutomationRun`, `WebhookEndpoint`, `WebhookDelivery`
- `MessageTemplate`, `MessageLog`, `SuppressionListEntry`

## Integration Adapter Contracts

Use small contracts so each module can support native and third-party backends.

- Scheduling adapter: list services, get availability, create booking, cancel/reschedule booking, sync external event, receive webhook.
- Payment adapter: create checkout session, verify webhook, refund, create customer portal/session, retrieve payment status.
- Commerce adapter: sync products, create cart, get checkout URL, sync order, sync inventory.
- Media adapter: upload, delete, generate variant URL, sign private URL, list asset metadata.
- Messaging adapter: send email/SMS, template variables, delivery callback, suppression handling.
- Analytics adapter: emit client event, emit server event, consent gating, debug mode.

## Non-Negotiable Quality Gates

- Public widgets load without breaking host-site CSS.
- Every public form is keyboard navigable and screen-reader usable.
- Every module has seed data and an empty state.
- Every destructive action has confirmation, permission check, audit log, and recovery path where practical.
- Every external webhook is signed, retried, and logged.
- Every payment flow uses hosted/tokenized payment collection.
- Every client-facing email distinguishes transactional from marketing purpose.
- Every media upload requires alt text before public use, with a deliberate "decorative" option.
- Every module can be disabled without orphaning the admin navigation.
- Every module has export support before it is considered client-ready.

## What We Might Be Missing

- Staff/task management: todos, assignments, internal notes, due dates.
- Inventory and rentals: stock counts, serialized equipment, rental return status.
- Classes/events: ticketing, rosters, check-in, waitlists, capacity.
- Loyalty/referrals: referral codes, credits, rewards.
- Donations/tips: nonprofit pages, pay-what-you-want, gratuity.
- Multi-location businesses: location-specific hours, staff, tax, inventory, and booking pages.
- Internationalization: language, currency, date/time formats, address formats, tax labels.
- Accessibility tooling: automated checks plus manual keyboard/screen-reader QA.
- White-label agency mode: manage many client sites from one admin, clone templates, export handoff package.
- Marketplace/plugin registry: optional modules installable without editing core code.
- Backup/restore UI: client-safe recovery from accidental deletes.
- Legal/policy templates: privacy, terms, refund policy, cancellation policy, shipping policy, photo release.
- Support/help module: per-client guide, onboarding checklist, and "what changed" release notes.

## Recommended Next Build

The highest-leverage next build is Phase 0 plus the beginning of Phase 1:

1. Refactor `shell/modules.ts` into manifest-driven modules.
2. Introduce `Site` and module installation tables while preserving the existing single-site defaults.
3. Create an embeddable booking widget contract and public API.
4. Add audit logs and domain allowlists before exposing embed endpoints.
5. Add Google Calendar adapter behind the existing scheduling adapter interface.

That sequence turns the current scheduler into a reusable plugin foundation without prematurely building commerce or gallery complexity on top of a single-site architecture.
