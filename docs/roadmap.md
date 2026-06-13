# Modular Website Plugin Roadmap

Last researched: June 6, 2026 · Last audit pass: June 7, 2026

## How To Read This Roadmap (Audit Protocol)

This file is both a roadmap and an audit ledger. Every buildable item moves through one lifecycle. **Agents: treat the Status Index below as the source of truth, and _append_ to an item's log blocks rather than rewriting them.**

<!--
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AGENT INSTRUCTIONS — READ YOUR ROLE ONLY, THEN STOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user will assign you one of the roles below. Read that
section only. Do not read the others — skipping them is
not laziness, it is correct behavior that keeps token usage
lean and your focus sharp.

Roles: ENGINEER · LINTER · REVIEWER · PATCHER · VALIDATOR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SHARED RULES — ALL ROLES MUST INTERNALIZE THESE FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODULAR DESIGN IS THE PRIME DIRECTIVE.
This project is built to be modular. Every piece of work
you produce must respect that. This is non-negotiable.

Before creating anything new:
  1. Look for an existing resource that already does the job.
  2. If one exists — use it. Always. A working existing
     resource beats a new one unless using it would
     meaningfully degrade the user experience.
  3. If nothing suitable exists, create the new resource
     so it can be shared. Place it with like resources.
     Name it clearly. Build it to be reused, not used once.

Never:
  - Duplicate logic that already exists elsewhere
  - Create a new endpoint, action, component, or utility
    in isolation when a home for it already exists
  - Use AI-sounding names (e.g. SmartHandler, AIProcessor,
    IntelligentForm) — name things plainly and accurately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: ENGINEER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to implement the milestone or task the user
points you to in this document.

Build it:
  - To high, production-quality standards
  - Following the Shared Rules above without exception
  - Consistent with the patterns already established in
    the codebase — if something is done a certain way
    elsewhere, match it

When you are done, mark your work in the roadmap inline
by appending the following block directly beneath the
relevant bullet or section:

  > **🛠 ENGINEER · [date]:** [Brief summary of what was
  > built, key files/locations touched, and any decisions
  > worth calling out for the next role.]
  >
  > **Status: `READY-FOR-AUDIT`**

Do not self-approve. Do not move the status forward.
Your job ends at READY-FOR-AUDIT.

Before marking READY-FOR-AUDIT, commit your work:
  - Stage only the files relevant to this task
  - Write a clear, descriptive commit message that explains
    what was built and why — not just what files changed
  - Do not add Co-authored-by lines or any AI attribution
    to the commit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: LINTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to audit all items currently marked
`READY-FOR-AUDIT` in this document.

For each item, examine the implementation and verify it
against the Shared Rules. Flag issues by severity:

  🔴 Critical — broken, insecure, or blocks other work
  🟠 Significant — wrong pattern, duplication, or a choice
     that will cause pain later
  🟡 Minor — naming, inconsistency, or a missed polish item

Also: if you encounter something clearly broken or badly
misaligned that is NOT tagged for audit, note it in a
brief sidebar — do not let it derail your audit, but do
not silently ignore it either.

When done, append inline beneath the item:

  > **🔍 LINTER · [date]:** [Findings in priority order.
  > Each finding references the exact file and line where
  > possible. Be specific — the Patcher will work from this.]
  >
  > **Status: `READY-FOR-REVIEW`**

Do not propose fixes. Do not implement anything.
Your job is to see clearly and report accurately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: REVIEWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to sanity-check all items marked
`READY-FOR-REVIEW` in this document.

Read the Linter's findings. Then look at the code yourself.
You are not rubber-stamping — you are a second set of eyes.

You will do one of two things:

  APPROVE — The Linter's findings are accurate and complete.
  Nothing significant was missed. Append:

    > **✅ REVIEWER · [date]:** Findings confirmed. No gaps.
    >
    > **Status: `APPROVED-FOR-PATCH`**

  FLAG — The Linter missed something, overstated something,
  or a finding doesn't align with project direction. Append:

    > **⚠️ REVIEWER · [date]:** [What was missed or
    > mis-called, with file/line references. Be direct.]
    >
    > **Status: `READY-FOR-REVIEW`** ← returns to Linter

Do not implement fixes. Do not approve work you have doubts
about to keep things moving — a flag now is cheaper than a
bad patch later.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: PATCHER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to fix all items marked `APPROVED-FOR-PATCH`
in this document.

Work from the Linter's findings and the Reviewer's
confirmation. Fix every flagged issue. Follow the Shared
Rules — if a fix requires a new resource, make sure it
lives in the right place and is built to be reused.

When done, append inline beneath the item:

  > **🔧 PATCHER · [date]:** [What was fixed, file by file.
  > Reference the finding it addresses. Note any edge cases
  > or follow-up concerns.]
  >
  > **Status: `READY-FOR-CONFIRM`**

Do not mark your own work confirmed.
Do not skip a finding because it seems minor.

Before marking READY-FOR-CONFIRM, commit your work:
  - One commit per logical fix where possible — do not
    bundle unrelated changes
  - Write a clear commit message that references what was
    patched and which finding it addresses
  - Do not add Co-authored-by lines or any AI attribution
    to the commit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: VALIDATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to confirm all items marked `READY-FOR-CONFIRM`
in this document.

Check the Patcher's work against every finding the Linter
raised. Verify the fix is actually in the code — with file
and line references. Do not take the Patcher's word for it.

If everything checks out, append:

  > **✅ VALIDATOR · [date]:** [Confirmed fixes, each
  > referenced by file and line. Note any residual concerns
  > or forward-looking callouts for future work.]
  >
  > **Status: `CONFIRMED`**

If something wasn't actually fixed or introduced a new
problem, append:

  > **🔴 VALIDATOR · [date]:** [What is still broken or
  > newly broken, with references.]
  >
  > **Status: `READY-FOR-PATCH`** ← returns to Patcher

You are the last gate. Be thorough.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STATUS FLOW (reference)

  READY-FOR-AUDIT
    → READY-FOR-REVIEW     (Linter done)
    → APPROVED-FOR-PATCH   (Reviewer approved)
    → READY-FOR-CONFIRM    (Patcher done)
    → CONFIRMED            (Validator done)

  Loop-backs:
    READY-FOR-REVIEW       (Reviewer flagged gaps → Linter)
    READY-FOR-PATCH        (Validator found failures → Patcher)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-->

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
| 3 | Commerce — cart / order / payment | ✅ CONFIRMED | hosted checkout session + webhook now wired (see §3 Stripe row); tax/shipping, gift cards, abandoned-cart pending | 06-09-26 |
| 3 | Commerce — tax & shipping at checkout | ✅ CONFIRMED | `9746242` (worker-4). Per-site `SiteSettings` tax (bps rate, optional tax-on-shipping) + shipping (flat, free-threshold on discounted subtotal, physical-items-only); extends the existing `repriceCart` (no fork), carries `taxCents`/`shippingCents`/`totalCents` into the order. RECONCILIATION VERIFIED: Stripe collapses to a single `order.totalCents` line when a discount exists, else itemizes products + Shipping + Tax lines summing exactly to `totalCents`; Square/PayPal charge `order.totalCents` — so the webhook amount-reconciliation holds across all gateways. Audit-logged settings. 🟢 fwd: single flat tax rate, NOT address/jurisdiction-based (fine v1; real US sales tax is destination-based — revisit before compliance-grade tax) | 06-13-26 |
| 3 | Commerce — abandoned-cart recovery | ✅ CONFIRMED | `dea7d1d`+`e3271e4` (worker-3). EXCELLENT compliance core: marketing email ONLY to an ACTIVE `EmailSubscriber` with `consentedAt` (cart activity ≠ consent), explicit "save this cart" opt-in with `skipDefaultList`, MARKETING category + unsubscribe/List-Unsubscribe, reuses `queueEmail`/outbox + idempotency key, atomic claim + bounded attempts (3), per-site/module-gated sweep; recovery token HMAC-signed/expiring/fail-closed (`cart-recovery-token.ts`). 🟠 HIGH: the sweep flips idle OPEN→ABANDONED BEFORE the consent check, but `getOpenCart`/`addCartItem`/checkout are OPEN-only (`cart.ts:320,339,492`) → a customer returning DIRECTLY (not via the email link) to any cart idle >threshold finds it empty/unusable, incl. no-consent carts that never get an email. 🟠 FIXED+VERIFIED (`e3271e4`): `claimCartForRecovery` no longer writes `ABANDONED` — it stamps `abandonedAt`/increments attempt only, claims `status=OPEN` carts with optimistic `recoveryAttemptCount` concurrency, so a directly-returning customer keeps their OPEN cart; legacy ABANDONED carts still recover via `/cart/recover`. 🟢 weak-secret guard absent on `CART_RECOVERY_SIGNING_SECRET`; no-consent carts claimed+skipped up to 3 cycles; cron deploy-config | 06-13-26 |
| 3 | Commerce — gift cards (store credit) | ✅ CONFIRMED | `b2a2348` (worker-4). `GiftCard`/`GiftCardRedemption` + admin issuance (audit-logged `gift_card.issued`). Money path VERIFIED SOUND: redemption decrement is ATOMIC — conditional `updateMany` gated on `status=ACTIVE` + `balanceCents >= credit` + currency + expiry, `count!==1`→throw, inside the checkout `$transaction` (`cart.ts:594-611`) — no double-spend; credit clamped to `min(totalBeforeGiftCard, balance)`; cancel-restore idempotent via `restoredAt` guard (`orders.ts:185-201`); reconciliation holds (Stripe collapses to one payable-total line, $0 fully-covered skips gateway → internal `gift_card_checkout` payment, gift card already decremented in-tx). Tenancy-scoped. 🟢 add rate-limit on public code application (enumeration) + ensure generated codes are high-entropy | 06-13-26 |
| 3 | Commerce — Stripe checkout session + webhook go-live | ✅ CONFIRMED (code) | all 5 findings fixed: full-refund-only REFUNDED, stale-PROCESSING reclaim (5m), amount+currency reconcile, expired/failed/async lifecycle handled, priority payment lookup. Runtime still needs deploy creds; partial-refund state = forward work | 06-10-26 |
| 4 | Photography Portfolio — gallery/admin foundation | 🛠 RESOLVED | public proofing live; comments/approvals confirmed; signed variants now built → 🔍 AUDITED (own row below) | 06-08-26 |
| 4 | Photography Portfolio — gallery widgets + lightbox | ✅ CONFIRMED | secure: all media routed through access-gated /galleries/[slug]/media route (no bearer-URL leak), private items filtered, CSS lightbox is keyboard/dialog-accessible | 06-09-26 |
| 6 | Client Book / CRM expansion (profile/pipeline/segments/timeline) | ✅ CONFIRMED | create-only on email (consent history preserved); policy acceptance appends; confirm-gated note/file delete | 06-09-26 |
| 6 | Client Book / CRM — tokenized client portal (chunk 1) | ✅ CONFIRMED | `0f40e4c` (worker-3). Read-only `/portal/[clientId]` showing a client's bookings + non-draft orders + non-draft invoices. Token is HMAC(`siteId:clientId:email`), timing-safe, fail-closed weak-secret guard (`lib/clients/portal-token.ts`). IDOR-safe: page loads client scoped `{id,siteId}` then verifies the token against THAT client's email → `notFound()` otherwise (`app/portal/[clientId]/page.tsx:38-70`); no server actions, no writes. 🟡 OPEN (next chunk): token has NO expiry/revocation — a leaked magic link is permanent PII access, revocable only by rotating the global secret; add a per-client token salt/version (and/or TTL) for revocable links before heavy PII use | 06-13-26 |
| 6 | Client Book / CRM — CSV import/export + duplicate merge | ✅ CONFIRMED | merge data-safe (full FK coverage); duplicate's primary email preserved in survivor.alternateEmails (`mergeEmailAliases`); audit-logging now LANDED (`86795aa`) — import/merge/export each write `recordAuditLog` (actor+target+before/after, bounded snapshots, permission-gated + record-scoped, no IDOR), closing the 06-09 §14 deferral. 🟢 audit write sequential-after-mutation (established §8/§14 pattern) | 06-13-26 |
| 14 | Admin Roles, Security & Compliance — AuditLog + roles FOUNDATION | ✅ CONFIRMED (foundation only) | 🟡 fixed: DB-backed login limiter + AuditLogFailure fallback. ⚠️ OPEN next chunk: broad role ENFORCEMENT (still opt-in/narrow) + role-mgmt UI — §14 NOT done | 06-09-26 |
| 4 | Photography Portfolio — client-proofing depth (comments/approvals/rounds) | ✅ CONFIRMED | access-link required for proofing; identity from access record; decisions keyed by access; atomic round close; CHANGES_REQUESTED event | 06-09-26 |
| 5 | General Gallery & Media Module | ✅ CONFIRMED | signing secret fail-closed in prod; isPrivate restricted to R2 (no broken delivery); magic-byte MIME check; proxy SSRF allowlist. Gallery layouts/attachments pending | 06-09-26 |
| 2 | Scheduling — multi-staff slice (StaffMember/per-staff availability/booking filter) | ✅ CONFIRMED | 🟡 fixed & verified (native.ts:159-163): staff w/o personal rules generate zero slots for staff-assigned services (no business-wide fallback); staff roster flags "no hours set — not bookable" (staff-panel.tsx:55,65-73). 🟢 buffer asymmetry remains pre-existing, out of scope. Resources now ✅ CONFIRMED (own row below); calendars/reminders pending | 06-10-26 |
| 2 | Scheduling — bookable resources (rooms/equipment) | ✅ CONFIRMED | shared-resource double-booking closed at root: in-tx conflict re-check (same-staff OR required-resource — explicit `BookingResource` + service-required — plus blockouts) and the insert run in ONE **Serializable** `$transaction` with `P2034`→friendly retry (`native.ts:429-515`); single-engine (reuses slot loop+buffer), tenancy-scoped throughout. 🟢 fwd: availability-RULE coverage not re-checked in-tx; add a bounded serialize-retry. Committed `828b4a9` | 06-13-26 |
| 2 | Scheduling — booking reminders (scheduled sweep) | ✅ CONFIRMED | strong idempotent design (unique-per-booking claim + `queueEmail` idempotency key → no double-send across a crash); site-aware, owner-configurable, reuses email outbox. 🟡 FAILED-never-retried FIXED+VERIFIED (`728b821`): `attemptCount`-bounded retry (cap 3, ~15m backoff) re-selects recent FAILED like stale-CLAIMED, `markReminderFailed` doesn't reset the counter so it climbs monotonically → no infinite loop; QUEUED stays terminal so a retried-then-sent reminder can't double-send. 🟢 stale-CLAIMED reclaim also consumes an attempt; fixed (non-exponential) backoff; pre-migration FAILED rows get a one-time catch-up. Committed `7329f4e`+`728b821` | 06-13-26 |
| 2 | Scheduling — calendar adapters (ICS feed + add-to-calendar) | ✅ CONFIRMED | `icsCalendarAdapter` (native stays default); HMAC token-protected read-only `/api/calendar/feed.ics` (site + per-staff) and `/api/calendar/booking.ics`; tokens scoped + timing-safe, routes fail closed on bad token/missing entity/scheduling-disabled, booking route derives siteId from the record (no cross-site), `icsText` escapes `\`/newline/`;`/`,` (injection-safe), secret fail-closed in prod, GET-only/bounded. 🟢 fwd: no weak-secret strength guard; line-fold by char not octet; bearer-token feeds over a single global secret → add a per-site salt for independent revocation. chunk-2 Google Calendar free/busy ✅ CONFIRMED (`2bb7b5b`+`7157086`): admin-gated OAuth + `expectedSiteId`, AES-256-GCM tokens w/ auto-refresh, tenancy-scoped freeBusy, busy windows exclude slots; 🟡 fail-mode FIXED+VERIFIED — a freebusy hard-error now records connection ERROR (admin-visible) and degrades to native availability instead of zeroing slots, while real busy windows still block. Cal.com/Outlook pending. Committed `0bd49d2` | 06-13-26 |
| 14 | Admin Roles — chunk 2 (role-mgmt UI + enforcement sweep) | ✅ CONFIRMED | users module + FULL enforcement sweep done (zero bare requireAdmin() across all modules — verified); roles now load-bearing everywhere. Remaining §14: default-deny posture + record-level (own-data) authz | 06-10-26 |
| 14 | Admin Roles — chunk 3 (default-deny + record-level own-data authz) | ✅ CONFIRMED (foundation) | auth split + fail-closed query-scope helpers solid; bookings+clients record-scoped at query layer (detail+mutations+merge); single-person works (OWNER unscoped). Open 🟠/🟡/🟢 reclassified into chunk-4 per @user "modular/configurable scope" decision | 06-10-26 |
| 14b | Admin Roles — chunk 4 (configurable, modular data-access scope) | ✅ CONFIRMED | engine+manifests+wiring SOUND; both §14 findings closed at query layer across all 6 modules (incl. detail/IDOR + mutations + export). 🟠 FIXED+VERIFIED: ownership now keys on durable `StaffMember.adminUserId` FK with `UNIQUE(siteId,adminUserId)` (kills ambiguity) + email-sync DB triggers + backfill (`data-scope.ts:104-111`, migration `20260613054500`); 🟡 FIXED: materialized ids → relation filters (`bookings.some`/`portfolioGalleryAccesses.some`, `:119-130`). Patch `1423de2`. 🟢 fwd: same-email-in-site collides on unique idx, triggers security-load-bearing, no manual link UI | 06-13-26 |
| 4 | Photography Portfolio — gallery delivery bundles (ZIP) | ✅ CONFIRMED | both 🟡 fixed: per-IP publicRateLimit on PUBLIC bundles (4/10min); ZIP now streams from staged temp files (no in-memory buffer), caps + mediaDeliveryResponse gating intact, temp cleanup on success/cancel/error. Committed 77c4878 | 06-10-26 |
| 4 | Photography Portfolio — signed image variants (Sharp/R2 on-demand) | ✅ CONFIRMED | secure core SOUND (HMAC type-bound signed URLs, prod fail-closed secret, no bearer leak, both routes authz-correct). 🟠 FIXED+VERIFIED: canonical `publicRateLimitMessage` (4/10min) now gates BOTH public delivery routes before any fetch/transform, private stays auth-gated (`media/assets/route.ts:49-55`, `portfolio/api/media.ts:47-53`); 🟡 FIXED: `isTransformableImage` excludes `image/gif` (`media.ts:515`); 🟢 download `.webp` ext. Patch `4123305` | 06-13-26 |
| 7 | Forms — field + form builder CRUD | ✅ CONFIRMED | — | 06-07-26 |
| 7 | Forms — destinations / public client linking | ✅ CONFIRMED | — | 06-07-26 |
| 7 | Forms — templates · signatures · automations | ✅ CONFIRMED | clone + notify confirmed; template catalog / booking attach / binding e-sign remain future work | 06-07-26 |
| 8 | Testimonials — collection form | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — admin moderation defaults | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — public module toggle | ✅ CONFIRMED | — | 06-07-26 |
| 8 | Testimonials — anti-abuse | ✅ CONFIRMED | full moderation audit trail still pending | 06-07-26 |
| 8 | Testimonials — moderation audit trail | ✅ CONFIRMED | every moderation action (approve/reject/feature/unfeature/archive/delete) logs one `recordAuditLog` entry on actual change with actor+target+before/after, incl. reject auto-unfeature; permission-gated (`testimonials:manage`) AND record-scoped (`getAccessibleTestimonialWhere` on read+mutation). Reuses §14 AuditLog (no parallel log). 🟢 audit write sequential-after-mutation (established §14 pattern; same-tx for true completeness is cross-cutting fwd-work). Committed `46d42ef` | 06-13-26 |
| 9 | Content & SEO — structured data + sitemap + canonical/meta | ✅ CONFIRMED | JSON-LD (LocalBusiness/WebSite/Product/Image/Breadcrumb) via XSS-safe renderer (`<`→`<`, no `</script>` breakout); dynamic `/sitemap.xml` + `/robots.txt` scoped per-site, published/public-only (ACTIVE products/forms, APPROVED testimonials, PUBLISHED+PUBLIC galleries — no private leak); canonical/OG/Twitter on public pages. Committed `b9b6fe6` | 06-13-26 |
| 5 | General Gallery & Media — selectable gallery layouts | ✅ CONFIRMED | `PortfolioGalleryLayout` (GRID/MASONRY/EDITORIAL/CAROUSEL/BEFORE_AFTER) + migration; public view derives the layout class from `gallery.layout` (rendered, not just stored) reusing the existing media-delivery path; admin create/update setter is `portfolio:manage`-gated AND record-scoped (`getAccessibleGalleryWhere`); invalid→GRID. Committed `203d30c`+`e6f5658` | 06-13-26 |
| 7 | Forms — binding e-signature | ✅ CONFIRMED | `f1ab156` (worker-1). `FormSignature` model + `FormSignatureCaptureType`; public SIGNATURE field captures typed/drawn signature. SOUND: consent ENFORCED (signature present but consent unchecked → error), payload schema-validated + bounded (200KB cap), DRAWN restricted to `data:image/png;base64,` prefix (NOT any data URL → no `data:image/svg+xml` XSS when rendered in admin), TYPED must equal signer name; durable record captures signer name/email, consent statement, timestamp, IP, user-agent; submission JSON stores only a "Signed (type) by X" summary (no image bloat); audit-logged without image data. Defensible signed record | 06-13-26 |
| 7 | Forms — booking/order/gallery attachment | ✅ CONFIRMED | `8183035` (worker-1). `FormAttachment` join model (BOOKING/ORDER/GALLERY, required flag, submission back-ref). Admin attach/remove is `forms:manage`-gated and tenancy-safe — form scoped by `{id,siteId}` and `assertAttachmentTargetExists` scopes the target by siteId (no cross-tenant attach), delete scoped by `{id,formId,siteId}` (no IDOR), P2002 dup-handled. Public submission is IDOR-safe: it looks up the `FormAttachment` by `formId+targetId+targetType` and rejects if the form isn't actually attached to that target, recording `formAttachmentId` from the verified row (not the query param); honeypot + rate-limit + validation intact. Confirmation/order/gallery pages render attached form links | 06-13-26 |
| 7 | Forms — starter template catalog | ✅ CONFIRMED | curated typed catalog (`modules/forms/templates.ts`, 10 starters) + `createFormFromTemplateAction` (`forms:manage`-gated) stamps a DRAFT form reusing the existing FormField model (clone flow, no new engine). Committed `26e8788` | 06-13-26 |
| 10 | Communications module (admin) | ✅ CONFIRMED | auto-send NOW WIRED (`9fdcf11`): `queueCommunicationsEventEmails` is a new consumer on the existing `emitModuleEvent` fan-out (booking.created/canceled, form.submitted, order.paid), error-isolated in `Promise.allSettled` alongside analytics/automation/webhooks, reuses `queueEmail`+existing `idempotencyKey`s (no new send engine, no double-send, no loop), tenancy-scoped re-loads, and does NOT touch `automation-runs.ts` (boundary kept). 🟢 template-failure surfaces only via EmailOutbox FAILED rows | 06-13-26 |
| 10/12 | Visual email template builder + automation template picker | ✅ CONFIRMED (core) · library UX audited | MJML renderer ratified+wired (async chain correct, output sanitized); clone + MessageTemplateVersion/restore + sample preview built & clean; only open item: clone/restore inherit the §14 communications enforcement gap | 06-09-26 |
| P0 | Booking email template settings (Communications) | ✅ CONFIRMED | green-build confirm gated only on codex's §4 portfolio type error (`portfolio/actions.ts:289`); not a booking-template defect | 06-09-26 |
| 11 | Billing / Invoices / Documents (foundation) | ✅ CONFIRMED | foundation solid; accept/pay + PDF + partial payments now built → 🔍 AUDITED (depth row below) | 06-07-26 |
| 11 | Billing — depth (public accept/pay + Stripe checkout + partial-payment ledger + PDF) | ✅ CONFIRMED | money paths SOUND (validation, idempotent amount+currency-reconciling webhook, PAID-at-remaining==0, exact-remaining manual-PAID, injection-safe PDF) — `99e0eb9`. Overpay fix CONFIRMED: reserve-PENDING + Serializable settle clamp prevents overpay (`3bd6455`), and re-patch `0c9b319` persists the rejection (FAILED + metadata commit, throw moved AFTER the tx) so a rejected over-credit is durably FAILED, not stuck PENDING. 🟢 fwd: partial-refund ledger + a refund path for rejected-but-captured payments | 06-13-26 |
| 15 | Payments Platform — multi-gateway adapter + per-site Connect onboarding (Stripe Connect / Square / PayPal) | ✅ CONFIRMED | ALL CHUNKS DONE. chunk-1 foundation ✅ CONFIRMED (code) — `PaymentGateway` adapter + AES-256-GCM per-site credentials + additive Stripe refactor (webhook verify preserved); committed `1db81e5`. chunk-2 Stripe Connect ✅ CONFIRMED (`4e6262e`) — CSRF-safe OAuth, admin-gated routes, per-site account isolation at checkout. chunk-5 wallets/BNPL ✅ CONFIRMED (`1bf9478` — see wallet row). chunk-3 Square ✅ CONFIRMED (`9993024`+`080ec68`): OAuth/CSRF, per-site isolation, webhook HMAC (notifURL+rawBody), amount+currency settlement reconciliation SOUND; 🟡 resolution-time connected-status fallback FIXED+VERIFIED (`resolvePaymentProviderForSite` falls back to Stripe when stored-Square is disconnected, throws only on explicit-Square). chunk-4 PayPal ✅ CONFIRMED (`c5bbcb1`+`3f57e17`): OAuth/CSRF, admin gating, webhook verify-before-handle (PayPal signature-verify API, status===SUCCESS), amount+currency settlement reconciliation, server-side capture, site-scoped refund all SOUND; 🟡 onboarding-trust FIXED+VERIFIED — merchant now confirmed server-side via merchant-integrations API by signed trackingId with `payments_receivable`+`primary_email_confirmed` required before CONNECTED. Resolver fallback covers Square+PayPal. **§15 gateways COMPLETE** (Stripe Connect + Square + PayPal + wallets). @user [06-13-26]: deploy-to-users (Shopify/Squarespace model) — each SITE OWNER connects their OWN account via one-click OAuth/Partner-Referrals "Connect" buttons; money settles to them. Generalize the existing Stripe adapter + `PaymentProvider` enum into a gateway-agnostic interface (onboard/checkout/webhook-verify/refund); encrypted per-site credential storage (ties to §1 tenancy); unify commerce + §11 billing checkout behind it; migrate current single-key Stripe → Stripe Connect. PCI stays SAQ-A | 06-13-26 |
| 15 | Payments Platform — wallet + BNPL methods (Apple Pay / Google Pay / Cash App Pay / Klarna or Affirm) | ✅ CONFIRMED | per-site Stripe checkout-method set (`lib/payments/methods.ts`); `settings:update`-gated + audit-logged owner toggles render only when Stripe connected; card-backed wallets fold into `card`, cashapp/klarna/affirm become independent `payment_method_types`, not-connected→Stripe default (no forged set); tenancy-scoped per `order.siteId`. 🟡 fwd-dependency: Apple Pay domain registration keys off platform `NEXT_PUBLIC_APP_URL`, must move to the per-site custom domain when that lands. Committed `1bf9478` | 06-13-26 |
| 12 | Automation module (non-webhook executors) | ✅ CONFIRMED | executors route through canonical guarded transitions; atomic claim; real invoice; worker-owned execution. Forward: add stale-PROCESSING reaper at worker provisioning | 06-09-26 |
| 13 | Analytics & Reporting | ✅ CONFIRMED (2 patches) · 🟠 consent deferred | client adapters + canonical GA4/Meta ecommerce mappings + server retention all built & sound; consent plumbed end-to-end. 🟡 CONFIRMED: retention sweep off the per-event hot path (emit.ts grep-clean) to scheduled `analytics:process` worker; admin/export calls unchanged; 🟡 CONFIRMED: GA4/Ads/Meta ids validated against strict allowlists (config.ts:5-7,13-16) before inline `<Script>` (non-matching → dropped). 🟠 tracking default-ON → DEFERRED/low-pri per @user [06-10-26]: US-only; revisit deny-until-granted + consent UI before any EU/UK/EEA launch. 🟢 dedupe drops repeats open/forward. Cron = deploy config to provision | 06-10-26 |
| — | Email controller (`lib/email` outbox) — full report in `Claude Audit - Email Controller 06-07-26.md` | ✅ CONFIRMED | code confirmed; Railway cron remains deploy config to provision | 06-07-26 |
| 1 | Core Platform — tenancy retrofit (`DEFAULT_SITE_ID` → request-resolved site) | ✅ CONFIRMED | slice A ✅ CONFIRMED (products+billing actions, `2d8ae46`); slice B ✅ CONFIRMED (automation worker + login-limiter + email-lib `siteId` threading, `d7c9320`; email-controller reach-in verified backward-compatible — `siteId?` optional w/ request fallback, no regression); final four ✅ CONFIRMED (clients/forms/testimonials scoped, portfolio already on resolver, `04cd79e`) — full `DEFAULT_SITE_ID` retrofit COMPLETE | 06-13-26 |

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

  > **CHECKPOINT - Codex-2 [06-09-26]:** §1 tenancy retrofit is partially implemented and build-green, but not yet marked READY-FOR-AUDIT. Confirmed the major site-owned uniqueness constraints already use composite site keys (`Product.slug`, `Coupon.code`, `Order.orderNumber`, billing document numbers/tokens, `Form.slug`, `Client.email`, portfolio/gallery access keys). Added request-to-site resolution in `lib/site.ts` using `SiteDomain.hostname` with default-site fallback, and default-domain seeding from `NEXT_PUBLIC_APP_URL`. `SiteSettings` is now keyed by generated id plus unique `siteId` instead of fixed id `"site"`. `EmailSubscriber.unsubscribeToken` is now site-scoped with migration `20260609234500_site_request_resolution`.
  >
  > Converted central request/public helpers off silent `DEFAULT_SITE_ID` writes/lookups: site settings, public rate limiting, email subscriptions/unsubscribe, email queue/recipients/sender/provider events, media upload/admin asset actions, content/settings upserts, public cart/order/Stripe checkout helpers, native scheduling, booking/billing status helpers, commerce/service slug generation, public billing-token acceptance, and gallery access helpers.
  >
  > Remaining before READY-FOR-AUDIT: the older admin module action files still contain default-site scopes (`modules/products/actions.ts`, `modules/billing/actions.ts`, `modules/clients/actions.ts`, `modules/forms/actions.ts`, `modules/testimonials/actions.ts`, `modules/portfolio/actions.ts`), plus background automation/event paths and admin login limiter defaults. Those should be converted in a coordinated pass because the same files are currently dirty from §14/§4/§6 work.
  >
  > Verification for this checkpoint: `npx prisma validate`, `npx tsc --noEmit --pretty false`, `npm run lint`, and `npm run build` pass.
  >
  > **Status: `IN-PROGRESS`**
  >
  > **✅ CONFIRMED · showrunner-boss [06-13-26 05:00 CDT] (§1 slice A):** Verified in code, not on report. `DEFAULT_SITE_ID` grep-clean in both `modules/products/actions.ts` and `modules/billing/actions.ts`. Each admin action resolves `siteId` once via `getCurrentSiteId()` (`lib/site.ts:93` → request-hostname → `SiteDomain` → site, default-site fallback) and threads it into every `where {id, siteId}` ownership check, create, slug generation, and checkout mutation. Billing helpers (`generateDocumentNumber`, `recomputeDocumentTotals`, `requireDraftDocument`, `validateClientId`) now REQUIRE an explicit `siteId` param — the silent default-site crutch is removed at the root (net −20 LOC), so cross-site document/client access fails closed. Commit `2d8ae46` touches only the two assigned files; ledger untouched. Remaining §1 slices: B (worker-4, in flight) + clients/forms/testimonials/portfolio (deferred behind §14b).
  >
  > **✅ CONFIRMED · showrunner-boss [06-13-26 05:25 CDT] (§1 slice B):** Verified in code. `lib/events/automation-runs.ts` derives scope from each run's `automation.siteId` (no DEFAULT_SITE_ID); the login limiter resolves `siteId` per request. Email-lib reach-in is backward-compatible: `getSiteSettingsForSite(siteId)` is an extract-refactor and `getSiteSettings()` still resolves the request site and delegates (`lib/site.ts:98-122`); `queueEmail`/`queueAdminEmail`/`queueTemplateTestEmail`/`resolveSender`/`getAdminRecipients` all take `siteId?` OPTIONAL with request-resolution fallback (`queue.ts:11,19`, `sender.ts:7`, `recipients.ts:24`), so the CONFIRMED email controller's request-path callers are unchanged while the automation worker passes an explicit site. `DEFAULT_SITE_ID` survives only as an explicit ensure-default comparison (`site.ts:99`), not a silent write. Committed `d7c9320`. Remaining §1 module-action tenancy (clients/forms/testimonials/portfolio) held until §14b is CONFIRMED to avoid colliding with worker-1's open §14b patch.
  >
  > **✅ CONFIRMED · showrunner-boss [06-13-26 06:00 CDT] (§1 final four — retrofit COMPLETE):** Verified in code. `DEFAULT_SITE_ID` grep-clean across `modules/{clients,forms,testimonials,portfolio}/actions.ts`; each action resolves `siteId` once via `getCurrentSiteId()` and threads it into every `where {id, siteId}` ownership check, create, and slug generator (e.g. `forms/actions.ts:115,148,191,213` + `generateUniqueFormSlug(..., siteId)`). portfolio was already on the resolver (untouched). Commit `04cd79e`. With slices A/B this closes the entire §1 tenancy retrofit — no `DEFAULT_SITE_ID` silent writes remain on the admin action surface.

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

  > **ENGINEER - Codex [06-09-26]:** READY-FOR-AUDIT for the Section 2 multi-staff scheduling slice. Added `StaffMember` and `ServiceStaff` models, nullable `AvailabilityRule.staffId`, nullable `Booking.staffId`, Site relations, and migration `20260609231000_scheduling_staff_members` so existing business-wide availability/bookings remain valid while services can opt into assigned staff. Scheduling admin now has staff roster create/update controls, service-to-staff assignment checkboxes, staff-scoped weekly availability, and staff-aware slot diagnostics (`modules/scheduling/*`, `prisma/schema/scheduling.prisma`, `prisma/schema/core.prisma`). The native scheduling adapter now generates staff-specific slot candidates, falls back to business-wide rules when a staff member has no personal rules, treats legacy no-staff bookings as blocking assigned staff, scopes conflicts to the selected staff where possible, and stores `Booking.staffId` on public bookings (`lib/scheduling/native.ts`, `lib/scheduling/types.ts`). Public booking now supports an "any available staff" or named-staff filter, submits the exact staff/time slot pair, and shows staff in review/summary; the availability API returns staff metadata for slots (`app/book/*`, `modules/scheduling/api/availability.ts`). Appointment list/detail/reschedule now display staff and preserve the booking's staff member during reschedule (`modules/appointments/*`). Scheduling manifest marks multi-staff scheduling live while leaving external calendars, resources/capacity, client self-service, paid booking, and reminders pending.
  >
  > Verification: `npm run prisma:generate`, `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npm run prisma:deploy` passed. Runtime checks returned 200 for `/book`, `/admin/modules/scheduling`, and `/api/availability` (empty request returns `{"slots":[]}`).
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** Strong, correctly-built slice — the double-booking risk is well handled: `createBooking` re-validates the slot via `getAvailableSlots` and then commits inside a **Serializable** `$transaction` with a final conflict check, retrying P2034 as a friendly error (`lib/scheduling/native.ts:285-370`). Staff-scoped conflict logic is right: a slot/booking is blocked only by unassigned (`staffId:null`) or same-staff bookings (`:194-196,313`), so different staff can hold concurrent appointments while legacy no-staff bookings block everyone. Staffed services require an explicit valid staff selection (`:269-271`). Findings:
  > - 🟡 MEDIUM — **A new staff member with no personal availability rules is instantly bookable across ALL business-wide hours** (fallback at `:159-160` uses the null-staff rules). Reasonable default, but it can surprise an admin who adds a staffer expecting them to be unbookable until given hours. Confirm intent; consider defaulting new staff to no availability until rules are set, or surface the fallback in the admin.
  > - 🟢 LOW (pre-existing, not introduced here) — **buffer asymmetry**: the conflict check expands only the NEW booking's window by its buffers and compares to existing bookings' raw start/end (`:194-196,308-316`), so an existing booking's own after-buffer isn't enforced against a back-to-back new booking. Carry as a general scheduling-correctness fix.
  > - 🟢 Capacity/group classes, resources, external calendars, reminders, and client self-service are correctly noted as remaining §2 scope.
  >
  > **Status: `READY-FOR-PATCH`** (the staff-availability-default is the only real decision; rest minor)

  > **PATCH - Codex [06-09-26]:** READY-FOR-CONFIRM for the Section 2 staff availability default finding. Assigned staff members no longer inherit business-wide availability when they have no personal availability rules; staff-specific services now generate slots only from that staff member's own rules, while unassigned/legacy services continue to use business-wide rules. Slot diagnostics now explicitly reports assigned staff who have no staff availability rules (`lib/scheduling/native.ts`). The pre-existing buffer asymmetry and broader resources/calendars/reminders scope remain future scheduling work as noted by the auditor.
  >
  > Verification: `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed.
  >
  > **Status: `READY-FOR-CONFIRM`**

  > **🔧 PATCHER · claude-worker [06-10-26]:** Verified the prior fix in `lib/scheduling/native.ts:162` — staff-assigned services build `ownerRules` only from that staff member's own `AvailabilityRule` rows (`rule.staffId === owner.id`), so a staff member with zero personal rules now generates zero slots (no silent business-wide fallback); unassigned/legacy services still correctly fall back to the `staffId: null` business-wide rules (`:159-162`). This was the only real decision item and it's resolved.
  >
  > Closed the remaining "surface ... so it's an explicit owner choice, not a silent default" gap: the Slot Diagnostics panel already reported "<staff> has no staff availability rules" per the prior patch (`native.ts:104-109`), but that only surfaces when an admin runs diagnostics for that specific service/date. Added a proactive indicator on the Staff roster itself: `modules/scheduling/page.tsx` now computes `staffIdsWithAvailability` (any personal `AvailabilityRule`) and `assignedStaffIds` (staff on `ServiceStaff`), passed to `StaffPanel`. `modules/scheduling/components/staff-panel.tsx` shows a `pill warning` "no hours set — not bookable" plus an explanatory note for any active staff member who is assigned to a service but has no personal hours, pointing the owner at the Availability rules panel below.
  >
  > 🟢 Buffer asymmetry (pre-existing, `native.ts:197-209,312-320` — new booking's window is buffer-expanded but existing bookings' own after-buffers aren't enforced against a back-to-back new booking): confirmed still present, left as-is per scope (general scheduling-correctness fix, not part of this finding).
  >
  > Verification: `npx eslint modules/scheduling/page.tsx modules/scheduling/components/staff-panel.tsx --max-warnings=0` passes; `npx tsc --noEmit --pretty false` shows no errors in either file (tree-wide build still carries unrelated pre-existing errors from other in-flight work).
  >
  > **Status: `READY-FOR-CONFIRM`**

  > **✅ VALIDATOR · claude-boss [06-10-26 22:30 CDT]:** Confirmed in code.
  > 🟡 staff-default — VERIFIED: `lib/scheduling/native.ts:159-163` builds `slotOwners` from assigned staff (or the `{id:""}` business-wide owner only when no staff are assigned), and `ownerRules = rules.filter(rule => rule.staffId === owner.id)`, so a staff owner with no personal rules yields an empty rule set → zero slots. The rules query (`:96-103`) still pulls business-wide rules (`staffId:null`), but they bind only to the `""` owner, so there is no staff fallback to business-wide hours. The `!rules.length` early-return (`:110-114`) does not mask this because business-wide rows keep `rules` non-empty while the staff owner still gets zero. Admin surfacing VERIFIED: `staff-panel.tsx:55` computes `needsAvailability = isActive && assignedStaffIds.has(id) && !staffIdsWithAvailability.has(id)` and renders the "no hours set — not bookable" pill + note (`:65-73`) — correctly scoped to active, service-assigned staff missing personal hours.
  > 🟢 buffer asymmetry — confirmed still present, correctly left out of scope as a general scheduling-correctness item.
  >
  > **Status: `CONFIRMED`**

  > **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §2 bookable resources (rooms/equipment). Committed `828b4a9`. Added `Resource`/`ServiceResource`/`BookingResource` models + migration `20260613053000_scheduling_resources`; scheduling admin resource roster, required-resource assignment per service, resource-scoped availability + blockouts + diagnostics + health warnings; native single-engine slot path now requires every required resource to have rules covering the slot and blocks on overlapping `BookingResource` reservations + resource blockouts; public booking carries resource ids/names through availability/review/submit/event metadata and persists reservations; appointment list/detail show reserved resources; seed adds a sample `Studio A`. Full `tsc`/`lint`/`build` green.
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 05:45 CDT]:** Audited end-to-end; strong, no 🔴/🟠/🟡 — confirming directly (only 🟢 forward-notes). The core correctness risk — shared-resource double-booking under concurrency — is closed at the root: the conflict re-check (overlapping non-canceled bookings scoped to same staff OR required resources, where "required" covers BOTH explicit `BookingResource` reservations AND the service's `resourceAssignments`, plus resource/business blockouts) and the booking insert run in ONE `prisma.$transaction` at **`Serializable`** isolation (`lib/scheduling/native.ts:429-508`), with `P2034` mapped to a friendly "just booked — choose another time" (`:509-515`). Single-engine confirmed — resources reuse the existing staff/business slot loop + buffer window, no parallel booking engine. Tenancy scoped by `service.siteId` throughout (conflict query, client upsert, booking + resource rows). Resource-only services aren't blocked by unrelated bookings; required resources without rules generate zero slots (`:163,280-285`). Forward 🟢 (not blocking): (1) the in-tx guard re-checks booking/block CONFLICTS but not resource/staff availability-RULE coverage (only the pre-commit slot gen at `:412` does) — a rule/blackout edited between render and submit could let a slightly out-of-hours slot commit; the time-sensitive double-book race IS guarded. (2) Serializable can throw `P2034` for independent non-overlapping bookings under load — a small bounded retry before surfacing the retry message would cut false collisions. Pre-existing buffer asymmetry remains a tracked general scheduling-correctness item.
  >
  > **Status: `CONFIRMED`**

  > **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §2 booking reminders. Committed `7329f4e`. `SchedulingSettings.bookingReminderEnabled`/`bookingReminderLeadMinutes` owner controls + durable `BookingReminder` (unique per booking, `BookingReminderStatus` enum incl. CLAIMED); `sweepBookingReminders` (`lib/scheduling/booking-reminders.ts`) — site-aware, PENDING/CONFIRMED upcoming bookings within the lead window, delivery via existing `queueEmail` with a `booking:<id>:reminder:customer` idempotency key, stale-CLAIMED recovery; mirrored worker pattern (internal route + CLI + `booking-reminders:process` npm script, `BOOKING_REMINDER_WORKER_SECRET || EMAIL_WORKER_SECRET`); admin reminders panel + health warning; seed/migration add the `booking.reminder.customer` template.
  >
  > **🔍 AUDIT · showrunner-boss [06-13-26 06:25 CDT]:** Strong, idempotent design. The `EmailOutboxStatus.CLAIMED` worker-3 flagged was a MISREAD — the code uses `BookingReminderStatus.CLAIMED` (a distinct enum on the new model), valid, tree builds green. Double idempotency: the `BookingReminder` unique-per-booking row gates concurrent sweeps (P2002 → reclaim only if stale; `:88-124`) AND `queueEmail` dedups on `booking:<id>:reminder:customer` (`:70`), so a crash between claim and send can't double-send (stale-CLAIMED re-selected after 15m, email idempotency blocks the duplicate). Tenancy-correct (per-site settings + `getSiteSettingsForSite`, bookings scoped by site, `queueEmail` siteId). Owner-configurable. Selection correct (PENDING/CONFIRMED, `now < startsAt <= now+lead`, reminders none OR stale-CLAIMED). Reuses the email outbox — no fork. Findings:
  > - 🟡 MEDIUM — FAILED reminders are never retried. The sweep re-selects only bookings with NO reminder or a stale-CLAIMED one (`:178-188`); once `markReminderFailed` sets FAILED (`:126-145`), that booking is never re-selected, so a single transient queue failure permanently drops the reminder. Add bounded retry — re-select recent FAILED within the window (with a retry cap), or treat a recent FAILED like stale-CLAIMED.
  > - 🟢 LOW — `MAX_BOOKINGS_PER_SITE=100`/sweep can delay reminders on very busy sites until the next sweep (fine with a frequent cron).
  > - 🟢 NOTE — reminder cron is deploy-config to provision (same as email/analytics workers); already surfaced via the scheduling health check.
  >
  > **Status: `READY-FOR-PATCH`** (the 🟡 retry gap; worker-2 owns scheduling → patches after §5, non-urgent — reminders work, only transient-failure retry is missing)
  >
  > **🔧 PATCHER · showrunner-worker-2 [06-13-26]:** Committed `728b821`. Added a bounded retry with an `attemptCount` column (default 0) + index `(siteId, status, attemptCount)`, migration `20260613105500_booking_reminder_retry_cap`, and `MAX_REMINDER_ATTEMPTS = 3`. The sweep selector now also picks up recent FAILED reminders (`attemptCount < MAX`, `failedAt` null or `< staleBefore`) alongside the stale-CLAIMED branch (now also `attemptCount`-capped); `claimReminder`'s P2002 reclaim treats a recent FAILED like a stale CLAIMED, flips it back to CLAIMED and `increment`s `attemptCount`; `markReminderFailed` records the failure without resetting the counter. Addresses the 🟡 directly — a transient queue failure is now retried up to 3 times instead of being permanently dropped.
  >
  > **✅ VALIDATOR · showrunner-boss [06-13-26 11:10 CDT]:** Confirmed in code — the retry is correctly **bounded**, which was the risk to verify. Traced the full lifecycle: create sets `attemptCount: 1` (`booking-reminders.ts:102`); every retry routes through the P2002 reclaim `updateMany`, which gates on `attemptCount: { lt: MAX_REMINDER_ATTEMPTS }` and applies `attemptCount: { increment: 1 }` (`:111,131`); the sweep selector gates both the stale-CLAIMED and the new FAILED branch on `attemptCount: { lt: MAX }` (`:200,208`). Crucially, `markReminderFailed`'s `upsert.update` branch does **not** touch `attemptCount` (`:143-148`) — only the first-ever `create` sets it to 1 (`:157`) — so the counter climbs monotonically (1→2→3) and a reminder is no longer selected once it reaches 3. No infinite loop, no unbounded retry. Idempotency preserved: a successful send moves the row to QUEUED, which the selector never re-picks (`:193-213`), and `queueEmail` still dedups on `booking:<id>:reminder:customer` — so a retried-then-succeeding reminder cannot double-send. The conditional `updateMany` still prevents concurrent double-claim. Tenancy + owner-config paths unchanged. Findings: 🟢 a stale-CLAIMED reclaim (crash recovery) also consumes an attempt, so a persistently-crashing claim is capped at 3 like a send failure — acceptable, the cap is generous. 🟢 backoff is a fixed ~15-min (`CLAIM_STALE_MINUTES`) gap, not exponential — fine for 3 attempts. 🟢 pre-migration FAILED rows (`attemptCount` default 0) get a one-time catch-up retry — previously they were dropped, so this is desirable, not a regression.
  >
  > **Status: `CONFIRMED` (committed `728b821`)**

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

  > **🛠 ENGINEER · 06-09-26:** Built the cart/order/payment foundation for audit: public cart checkout prep now claims carts once, reprices before order creation, links/creates clients, records pending Stripe payment rows, increments/release coupon redemptions, and clears the cart cookie (`lib/commerce/cart.ts`, `app/cart/actions.ts`). Added a reusable order lifecycle with guarded status transitions, paid-order inventory decrement, payment status sync, `order.paid` event emission, and receipt queueing (`lib/commerce/orders.ts`, `lib/email/events.ts`). Added an admin order/payment dashboard with manual hosted Checkout link attach/clear controls, grouped multi-currency paid totals, client timeline links, and updated module manifest/health messaging (`modules/products/*`, `modules/clients/detail/page.tsx`). Conflict flagged: automatic Stripe Checkout session creation and payment webhooks require deploy-time Stripe credentials/webhook secrets and were left manual rather than represented as live.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · 06-09-26:** Findings in priority order:
  > 🔴 Critical — successful checkout-prep is routed through an error path because `preparePublicCheckoutAction` calls `redirect()` inside the `try` block; Next redirects throw, so the catch at `app/cart/actions.ts:174-175` can convert a successful order/email/cookie-clear path at `app/cart/actions.ts:164-173` into `/cart?error=...`.
  > 🔴 Critical — admin status controls can mark an order paid without confirming hosted payment collection. `PENDING -> PAID` is exposed by `lib/commerce/orders.ts:21-24` and rendered as a `Mark Paid` form at `modules/products/page.tsx:617-625`; `updateOrderStatus` then sets pending Stripe payments to `PAID`, decrements inventory, queues a receipt, and emits `order.paid` at `lib/commerce/orders.ts:100-108,162-193`, with no checkout-link/session/webhook confirmation checked.
  > 🟠 Significant — public cart mutations bypass the products module gate. The public pages check `enabledModuleIds` at `app/shop/page.tsx:15-16` and `app/cart/page.tsx:37-38`, but the public server actions in `app/cart/actions.ts:63-176` do not check module enablement before creating carts, applying coupons, or creating checkout orders.
  > 🟠 Significant — coupon max-redemption accounting is racy. Usability is read from `redemptionCount < maxRedemptions` at `lib/commerce/cart.ts:35-47,192-194`, but checkout creation increments the same coupon unconditionally at `lib/commerce/cart.ts:451-455`, so concurrent last-redemption checkouts can exceed the configured cap.
  > 🟡 Minor — paid-order receipt emails render an empty receipt link. `queueOrderReceiptEmail` always passes `receiptUrl: ""` at `lib/email/events.ts:257-268`, while the seeded receipt template renders `Receipt: {{receiptUrl}}` / an empty anchor at `prisma/seed.ts:285-294`.
  >
  > **Status: `READY-FOR-REVIEW`**
  >
  > **⚠️ REVIEWER · 06-09-26:** Linter findings confirmed, but three gaps should be added before patching: 🟠 Significant — public checkout prep has no public abuse throttle while it can create `Client`/`Order`/`Payment` rows and queue mail (`app/cart/actions.ts:151-173`, `lib/commerce/cart.ts:399-449`); sibling public write paths gate and throttle with `publicRateLimitMessage` (`modules/forms/actions.ts:331-357`, `modules/testimonials/actions.ts:173-185`). 🟠 Significant — coupon redemption accounting also consumes limited coupons before payment, not just under concurrency: checkout prep increments `redemptionCount` for `PENDING` orders (`lib/commerce/cart.ts:451-455`), and only explicit cancellation releases it (`lib/commerce/orders.ts:132-142,169-170`), so unpaid prepared orders can exhaust `maxRedemptions`. 🟠 Significant — the provider-confirmation issue also exists on refunds: `PAID`/`FULFILLED → REFUNDED` is exposed (`lib/commerce/orders.ts:24-25`, `modules/products/page.tsx:617-625`) and marks payments `REFUNDED` without Stripe refund/webhook confirmation (`lib/commerce/orders.ts:111-118`).
  >
  > **Status: `READY-FOR-REVIEW`**
  >
  > **🔧 PATCHER · Codex [06-09-26]:** Applied all reviewer-confirmed patches for cart/order/payment hardening.
  > - `app/cart/actions.ts`: fixed redirect-throw handling by moving success redirect outside the `try` block; added server-side products-module gating on all public cart mutations; added checkout-prep public throttle via `publicRateLimitMessage("checkout_prepare", { limit: 6, windowMinutes: 10 })`.
  > - `lib/commerce/orders.ts`: restricted `PAID` and `REFUNDED` transitions to provider-confirmed flows only (admin transition path now blocks these without provider confirmation), which removes manual mark-paid/refund side effects (payment-status mutation, inventory decrement, receipt/event emit) from unconfirmed admin actions.
  > - `lib/commerce/cart.ts`: removed coupon redemption increment from checkout preparation so unpaid pending orders no longer consume limited coupon capacity.
  > - `lib/commerce/orders.ts`: moved coupon redemption consumption to paid confirmation with optimistic concurrency guards, preventing last-redemption races under concurrent confirmation attempts.
  > - `lib/email/events.ts`: replaced the hardcoded empty `receiptUrl` token with a non-empty fallback chain (`receiptUrl || checkoutUrl || /cart?order=<orderNumber>`), so receipt emails no longer render an empty link token.
  >
  > Validation: `npx tsc --noEmit` and targeted diagnostics checks are clean.
  >
  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-09-26]:** All eight findings (5 Linter + 3 Reviewer) confirmed fixed in code.
  > - 🔴 #1 redirect-throw: success `redirect()` now sits outside the `try`; `orderNumber` is captured in a variable and the catch only wraps the order/email/cookie work (`app/cart/actions.ts:188-204`).
  > - 🔴 #2 / 🟠 R3 provider-confirmed PAID & REFUNDED: `providerConfirmedStatus` + `nextOrderStatuses` filter PAID/REFUNDED out unless `providerConfirmed` (`lib/commerce/orders.ts:26-43`), `assertAllowedOrderStatusTransition` throws otherwise (`:45-55`), the admin UI only renders `nextOrderStatuses(selectedOrder.status)` so no Mark Paid/Refund button appears (`modules/products/page.tsx:115,620`), and the admin action calls `updateOrderStatus` with no `providerConfirmed` so a forged POST is rejected server-side (`modules/products/actions.ts:340-353`). Defense in depth holds.
  > - 🟠 #3 module gate: every public cart action calls `requirePublicProductsModule()` (`app/cart/actions.ts:65-70,73,102,130,154,169`).
  > - 🟠 #4 / 🟠 R2 coupon race + pre-payment consumption: `createCheckoutOrderFromCart` no longer increments redemptions; consumption moved to `consumeCouponRedemptionForPaidOrder` on the paid transition with an optimistic `updateMany` guard keyed on the read `redemptionCount` (`lib/commerce/orders.ts:147-181,207-212`).
  > - 🟡 #5 receipt link: `receiptUrl = order.receiptUrl || order.checkoutUrl || /cart?order=<n>` — never empty (`lib/email/events.ts:261`).
  > - 🟠 R1 checkout throttle: `publicRateLimitMessage("checkout_prepare", { limit: 6, windowMinutes: 10 })` before order creation (`app/cart/actions.ts:183-186`).
  >
  > **Forward-looking (not a defect, track as next build):** no code path yet calls `updateOrderStatus({ providerConfirmed: true })` — that arrives with the Stripe webhook handler. Until that handler exists, orders cannot progress past `PENDING`, so inventory decrement, receipt send, and `order.paid` emission never fire in production. This is the intended hosted-checkout gate, but the storefront is not "purchasable" until the webhook lands. Carry the open-findings note forward.
  >
  > **Status: `CONFIRMED`**

  > **ENGINEER · Codex-2 [06-09-26]:** READY-FOR-AUDIT for §3 Stripe hosted-checkout session creation + webhook confirmation. Added official Stripe SDK integration, `createStripeCheckoutSessionForOrder`, public cart redirect to hosted Stripe Checkout, and raw-body `/api/webhooks/stripe` signature verification. Added `StripeWebhookEvent` ledger + migration for event-id idempotency/retry (`PROCESSING`/`PROCESSED`/`FAILED`), sanitized Stripe event summaries, and webhook handlers for `checkout.session.completed` and `charge.refunded`. Payment success/refund now routes through `updateOrderStatus({ providerConfirmed: true })`, preserving the confirmed §3 status gate, inventory/coupon/receipt/event side effects, and never writing order status directly. Updated checkout email token/template copy with `checkoutUrl`, products health/readiness text, and `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Verification: `npm run prisma:generate`, `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.

  > **🔍 LINTER · Claude [06-09-26]:** Strong, correct integration — this makes commerce actually transactable. Signature verification uses the raw body + `STRIPE_WEBHOOK_SECRET` and is fail-closed (`lib/commerce/stripe.ts:188-191`, `app/api/webhooks/stripe/route.ts:5-9`); idempotency is a DB claim on `StripeWebhookEvent.eventId` (`:248-279`); PAID/REFUNDED route through `updateOrderStatus({ providerConfirmed: true })` (`:343-348,374-379`) — exactly the §3 gate, so inventory/coupon/receipt/emit all fire correctly; `rawSummary` is a sanitized field subset (no PAN/PII); checkout sessions only for PENDING/DRAFT orders with positive amounts. Findings:
  > - 🟠 HIGH — **Partial refunds mark the whole order REFUNDED.** `charge.refunded` fires for partial refunds too, but `handleRefundEvent` unconditionally sets payment + order to `REFUNDED` (`:351-380`), ignoring `amount_refunded`/`refunded` (which `stripeEventSummary` already captures). A $10 refund on a $100 order would fully refund it in our system. Gate on a true full refund (`charge.refunded === true` / `amount_refunded === amount`) before marking the order REFUNDED; handle partials separately (or no-op for now).
  > - 🟠 HIGH — **Crash mid-processing strands an event in `PROCESSING` and Stripe stops retrying.** `claimStripeEvent` only reclaims rows in `FAILED` (`:265-277`); if the process dies after claiming but before `markStripeEventFailed`, the row stays `PROCESSING`, the retry is treated as a duplicate (`handleStripeWebhookEvent` returns early → route 200), and a *paid* `checkout.session.completed` can be permanently lost (customer charged, order never marked paid). Add stale-`PROCESSING` reclaim (rows older than a timeout), same pattern as the §12 reaper.
  > - 🟡 MEDIUM — No amount reconciliation: `handleCheckoutSessionCompleted` marks PAID on `payment_status === "paid"` without checking `session.amount_total === order.totalCents` (`:322-348`). Reconcile before marking paid.
  > - 🟡 MEDIUM — Unhandled lifecycle events: `checkout.session.expired` / `payment_intent.payment_failed` / async-payment events aren't dispatched, so abandoned/failed checkouts leave the order `PENDING` and the payment `PENDING` forever. Handle them to release the order.
  > - 🟡 LOW — `findStripePayment` OR-matches loosely including `orderId` + `orderBy createdAt asc`, so with >1 Stripe payment per order it can resolve the wrong one; prefer the most-specific (session/intent) match.
  >
  > **Status: `READY-FOR-PATCH`** — the two 🟠 (partial-refund, stale-PROCESSING) before this is trusted with real money; 🟡s soon after. Note: not deployable until Stripe creds/webhook are provisioned, so not blocking other work.

  > **🛠 RESOLVED · copilot-4 [06-10-26]:** Patched all five findings in `lib/commerce/stripe.ts` (patch reported in chat; ledger recorded by validator). (1) `handleRefundEvent` only flips payment+order to REFUNDED on a true full refund (`charge.refunded || amount_refunded >= payment.amountCents`); partial refunds leave status unchanged. (2) `claimStripeEvent` reclaims stale `PROCESSING` rows older than `STRIPE_EVENT_STALE_PROCESSING_MS` (5 min) in addition to `FAILED`. (3) `handleCheckoutSessionCompleted` reconciles `amount_total` + currency against the order before marking PAID. (4) `dispatchStripeEvent` now handles `checkout.session.expired`, `async_payment_failed`, `async_payment_succeeded`, and `payment_intent.payment_failed`. (5) `findStripePayment` matches most-specific-first instead of a loose OR.
  >
  > **✅ VALIDATOR · Claude [06-10-26]:** All five findings confirmed fixed in code, no regressions:
  > - 🟠 partial-refund: REFUNDED transition gated on full-refund only — payment status and `updateOrderStatus(...REFUNDED)` both fire only when `object.refunded || amount_refunded >= payment.amountCents`; a partial `charge.refunded` is a no-op on status (`lib/commerce/stripe.ts:471-485`). ✓
  > - 🟠 stale-PROCESSING: P2002 path runs an `updateMany` reclaim over `FAILED` ∪ (`PROCESSING` with `updatedAt ≤ now − 5min`) and returns claimed only when `count === 1`, so a crash-stranded event retries idempotently and concurrent redelivery can't double-process (`:267-288`). ✓
  > - 🟡 amount/currency reconcile: throws before PAID on `session.amount_total !== order.totalCents` or currency mismatch (`:350-359`). ✓
  > - 🟡 lifecycle events: expired / async-failed / intent-failed dispatched to a failure handler that cancels only DRAFT/PENDING orders and never touches PAID/REFUNDED payments (`:379-518`). ✓
  > - 🟢 payment lookup: priority-ordered candidates (paymentId → session → intent → order), STRIPE-scoped (`:318-338`). ✓
  > `tsc --noEmit` shows ZERO errors in `stripe.ts`; the only tree-wide failures are §13 analytics files from copilot's in-flight work (`lib/analytics/*`, `modules/settings/page.tsx` — SiteSettings columns awaiting migration), not a §3 defect. The earlier `stripe.ts:390 refund.succeeded` type error is gone.
  > **Forward (not blocking):** runtime verification against live Stripe events still needs deploy creds/webhook provisioning (same posture as the email cron); partial refunds are correctly no-op'd but not yet recorded as a distinct PARTIALLY_REFUNDED state — track when that status is added. Patcher to confirm the change is committed.
  >
  > **Status: `CONFIRMED`**

- Digital products: secure downloads, expiring links, license notes, proof galleries, and file delivery tracking.
- Service-commerce crossover: sell deposits, packages, retainers, class passes, paid add-ons, and booking bundles.
- Subscriptions: recurring billing, plan changes, cancellation, renewal reminders, failed payment recovery, consent snapshots, and audit logs.
- Analytics: GA4 `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `refund`; server-side conversion hooks where configured.

### 4. Photography Portfolio Module

Photography needs more than a generic gallery because proofing, privacy, and sales matter.

Implementation status:

- Portfolio/gallery admin foundation, Prisma models, starter seed data, module registration, gallery status/visibility controls, item records, proofing/download flags, private access links, public gallery/access-token routes, downloads, and favorites capture are partially live as of 06-08-26.
- Gallery widgets/lightbox, comments/approvals/revision rounds, selected-image export, download bundles, print/lab workflows, upload batch tooling, fully signed/private object delivery, and booking/commerce tie-ins remain pending.

  > **ENGINEER · Codex [06-09-26]:** READY-FOR-AUDIT for client-proofing depth. Added durable proof rounds, proof comments, round approvals/change requests, per-image proof decisions, and a selected-image export panel (`prisma/schema/portfolio.prisma`, `prisma/migrations/20260609200000_portfolio_proofing_rounds`, `prisma/migrations/20260609200500_portfolio_proofing_round_backfill`). Public proofing writes now reuse the portfolio module gate, access-token/private-media validation, honeypot fields, and `PublicRateLimit` for comments, image decisions, and round approvals (`modules/portfolio/public-actions.ts`, `app/galleries/public-gallery-view.tsx`). Admin can start revision rounds, confirm destructive/closing status changes, review decisions/comments/responses, and archive galleries only with explicit confirmation (`modules/portfolio/actions.ts`, `modules/portfolio/page.tsx`). Verification: `npm run lint`, `npm run build`, `npm run prisma:deploy`, and local HTTP checks for `/admin/modules/portfolio` and `/galleries/starter-portfolio` passed; Browser plugin screenshot verification was unavailable because `iab` was not exposed in this session.

  > **🔍 LINTER · Claude [06-09-26]:** Good public-surface hygiene — honeypot + `PublicRateLimit` + module gate + access-token/private-media validation on every write, `requirePublicProofingContext` centralizes most checks, admin status changes to APPROVED/CHANGES_REQUESTED/LOCKED require explicit confirmation (`actions.ts:284-293`, §14 satisfied), and no viewer text is rendered via `dangerouslySetInnerHTML` (React escaping holds). Findings, priority order:
  > - 🟠 HIGH — **Consequential proofing actions are open to anonymous public visitors.** `requirePublicProofingContext` only requires an access token when `visibility !== PUBLIC` (`public-actions.ts:118-121`); on a PUBLIC proofing gallery `access` is null and allowed. So any stranger with the slug can submit/overwrite image decisions and, worse, **submit a round APPROVAL** that closes the round and emits `gallery.approved` (`:432-457`), all while self-identifying as any email they type. Proofing is a client workflow — decisions and especially approval should require an active access link (client identity), not ride on public showcase visibility. Gate decisions/approvals on `access` regardless of gallery visibility.
  > - 🟠 HIGH — **Identity is the unverified posted `viewerEmail`.** Decisions are keyed on `roundId_itemId_viewerEmail` (`:373-379`) and approvals/comments are attributed to the posted email. Even when a valid access link is present — which already carries `access.clientId` via `findActiveGalleryAccess` — the code trusts the free-form email, so a viewer can act as ANY email, impersonating the real client and overwriting their email-keyed decisions. When `access` exists, derive and attribute identity from `access`/`clientId` and key decisions on that, not the posted email. (Same "don't trust public-submitted email" rule the §7/§8 audits established.)
  > - 🟡 MEDIUM — **~60 lines of authorization logic duplicated.** `favoriteGalleryItemAction` (`:201-258`) re-implements the gallery/access/item/private-asset checks that `requirePublicProofingContext` (`:95-168`) already does, because favorites don't need an OPEN round. Two copies will drift (a future private-asset fix lands in one). Extract a shared validator parameterized on round-requirement — prime-directive reuse.
  > - 🟡 MEDIUM — **Approval/round-close is not atomic.** Two concurrent approvals both pass the OPEN-round check, then each create an approval row and update the round, emitting `gallery.approved` twice (`:432-474`). Claim the round first (`updateMany` where status OPEN → closed) and only record the approval / emit when `count === 1`.
  > - 🟡 LOW/MEDIUM — **CHANGES_REQUESTED is silent.** Only APPROVED emits an event (`:459-474`); a change request just flips round status, so no event/notification reaches the photographer and no automation can react. Emit an event on CHANGES_REQUESTED too.
  >
  > Note: green-build claim is currently contradicted — codex-2 reports `tsc` is blocked by a type error in `modules/automation/actions.ts` (§12). Not a §4 defect, but the "build passed" verification can't be reproduced tree-wide until that clears.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → PATCHER; both patchers currently busy, so queued — see chat)

  > **PATCHER · Codex-3 [06-09-26]:** READY-FOR-CONFIRM for the §4 public proofing audit findings. Proof comments, image decisions, and round approval/change requests now require an active gallery access link even when the gallery itself is PUBLIC; public favorites still use the shared gallery validator but remain allowed without an access link. Proofing identity is derived from the access record (`accessId`, `clientId`, normalized `recipientEmail`) instead of trusting posted `viewerEmail`, and image decisions now upsert by `(roundId,itemId,accessId)` with a matching Prisma unique key + migration (`20260609223000_proofing_access_identity`).
  >
  > The duplicated public-gallery authorization checks were extracted into a shared validator parameterized by access/round requirements. Round approval/change request submission now claims the round atomically with `updateMany` from OPEN to the terminal status before creating the approval row and emitting automation, so concurrent submissions cannot double-close/double-emit. Added the `GALLERY_CHANGES_REQUESTED` automation trigger and `gallery.changes_requested` portfolio event so change requests notify/automate like approvals.
  >
  > Verification: `npm run prisma:generate`, `npx tsc --noEmit`, and `npm run lint` passed for this patch. Latest `npm run build` is currently blocked by an unrelated in-flight §3 Stripe type error in `lib/commerce/stripe.ts:390` (`event.type === "refund.succeeded"` has no overlap with Stripe's event union); not a §4 proofing defect.
  >
  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-09-26]:** All five findings confirmed fixed in code.
  > - 🟠 Access required — `requirePublicProofingContext` calls the shared validator with `requireAccess:true,requireOpenRound:true` (`public-actions.ts:90-104`); the gate is `(requireAccess || visibility !== PUBLIC) && !access` (`:144`), so proofing decisions/approvals/comments now demand an active access link even on PUBLIC galleries.
  > - 🟠 Identity from access — `accessIdentity(access)` derives `accessId`/`clientId`/`viewerEmail` from `access.recipientEmail` (`:201-207`); comment (`:309-318`), decision (`:356-379`), and approval (`:418-447`) all write `actor.*`, never the posted `viewerEmail`.
  > - Decision keying — upsert is on `roundId_itemId_accessId` (`:358-364`), so a viewer can only overwrite their own decision; impersonation via posted email is gone.
  > - 🟡 Dedup — public-gallery auth extracted into the shared `requirePublicGalleryContext` parameterized by `requireAccess`/`requireOpenRound` (`:106-199`); favorites reuse it without forcing access.
  > - 🟡 Atomic close — approval runs in a `$transaction` that claims the round via `updateMany` (OPEN→terminal) and throws unless `count===1` before creating the approval, so concurrent submits can't double-close/double-emit (`:424-460`).
  > - 🟡 CHANGES_REQUESTED — now emits `gallery.changes_requested` (+ `GALLERY_CHANGES_REQUESTED` trigger) alongside `gallery.approved` (`:462-478`).
  >
  > Build note: the §3 Stripe blocker codex-3 saw was fixed by codex-2 right after (tsc/lint green tree-wide); this patch is clean.
  >
  > **Status: `CONFIRMED`**
  >
  > **ENGINEER · Codex-4 [06-09-26]:** READY-FOR-AUDIT for §4 gallery widgets/lightbox. Added public gallery widget rendering without changing the proofing/write path: a featured image panel, responsive thumbnail strip, card overlay launch controls, and anchor-target lightbox dialogs with previous/next/close controls (`app/galleries/public-gallery-view.tsx`, `app/globals.css`). The lightbox uses existing `/galleries/[slug]/media/[itemId]` delivery routes with `CARD`, `HERO`, `FULL`, and `DOWNLOAD` variants so public/private galleries continue to flow through the §5 signed media contract and access-token gate. Updated the portfolio module manifest to mark widgets/lightbox and proofing comments/approvals live while leaving download bundles, print/lab workflows, batch uploads, and storage-delivery confirmation as remaining gaps (`modules/portfolio/module.ts`). Verification: `npx tsc --noEmit --pretty false` and `npm run lint` pass. `npm run build` is currently blocked by unrelated in-flight §14 work importing `lib/auth.ts`/`server-only` through the client sidebar path (`shell/admin-sidebar.tsx` import trace); not a §4 defect.
  >
  > **Status: `READY-FOR-AUDIT`**

  > **ENGINEER · Codex-4 [06-09-26]:** READY-FOR-AUDIT for §4 gallery delivery bundles. Added `/galleries/[slug]/bundle` as an access-gated ZIP route (`app/galleries/[slug]/bundle/route.ts`) that only includes published galleries with downloads enabled, rejects private/password galleries without an active access token, includes only media-backed downloadable items, caps item count/bytes, and reuses `mediaDeliveryResponse` for every file so R2/private-media/source-allowlist checks stay centralized. Public galleries now show a "Download bundle" action when bundle-ready items exist, and the portfolio admin shows bundle-ready counts plus public/access-token bundle links without creating an admin bypass (`app/galleries/public-gallery-view.tsx`, `modules/portfolio/page.tsx`). Updated the portfolio module manifest to mark ZIP delivery bundles live while keeping print/lab workflows, batch uploads, watermark controls, and storage-delivery confirmation as remaining gaps (`modules/portfolio/module.ts`). Verification: `npx tsc --noEmit --pretty false`, `npm run lint`, and `npm run build` pass.
  >
  > **Status: `READY-FOR-AUDIT`**

  > **PATCHER · Copilot 3 [06-10-26]:** READY-FOR-CONFIRM for the §4 gallery bundle audit findings. `app/galleries/[slug]/bundle/route.ts` now reuses `publicRateLimitMessage` for public bundle downloads before any media fetch work starts, scoped per gallery so anonymous ZIP requests are throttled per IP without introducing a parallel limiter. The ZIP assembly path was rewritten to stage each `mediaDeliveryResponse` stream into a bounded temp directory, enforce the existing 60-item / 220MB caps while staging, then stream the archive back file-by-file instead of buffering the whole ZIP in memory; every bundle asset still flows through the shared media delivery contract, and the temp files are cleaned up on success, cancellation, or failure.
  >
  > Verification: `npx eslint app/galleries/[slug]/bundle/route.ts --max-warnings=0` passed. `npx tsc --noEmit --pretty false` is currently blocked by unrelated pre-existing argument-count errors in `modules/analytics/actions.ts`, `modules/analytics/api/export.ts`, `modules/content/actions.ts`, and `modules/scheduling/actions.ts`.
  >
  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-10-26]:** Both 🟡 findings confirmed fixed in `app/galleries/[slug]/bundle/route.ts`, no regressions:
  > - 🟡 per-IP rate limit: PUBLIC bundles now call `publicRateLimitMessage("gallery_bundle:"+gallery.id, { limit: 4, windowMinutes: 10 })` and return 429 before any media fetch (`:244-252`). Verified the helper is genuinely per-IP — it derives the identifier from `x-forwarded-for`/`x-real-ip`/`cf-connecting-ip` and enforces a DB-backed window keyed on `sha256(siteId:scope:ip)` (`lib/public-rate-limit.ts:21-39`), the same canonical limiter used by checkout/proofing (no parallel limiter). Access-token/private galleries are gated by token possession instead — reasonable.
  > - 🟡 in-memory buffering: the whole-ZIP buffer is gone. Each `mediaDeliveryResponse` body is streamed to a temp file with an incremental CRC32 (`stageResponseToFile`, `:137-163,296-300`), and `createZipStream` returns a `ReadableStream` that emits the local header then re-reads each staged file chunk-by-chunk via `createReadStream` before the central directory/EOCD (`:165-211`) — only one chunk resident at a time. The 60-item (`take`) and 220MB caps still hold (`:232,303-306` → 413), every file still flows through `mediaDeliveryResponse` (DOWNLOAD variant) with the private-asset skip (`:285-293`), and the temp dir is cleaned up on success/cancel/error (`:204,208,358`). The hand-rolled STORE-method ZIP (local header + central directory + EOCD, CRC/sizes known up front) is correctly formed; the caps keep it under ZIP64 thresholds.
  > Committed `77c4878`. The §4 route is eslint-clean and type-correct in isolation; the tree-wide `tsc` red is only from in-flight §13/§14b analytics/content/scheduling changes, not this file.
  >
  > **Status: `CONFIRMED`**

  > **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §4 signed image variants. `lib/media.ts` now generates THUMBNAIL/CARD/HERO/FULL/SOCIAL on demand with Sharp, caches each to R2 under `variants/<src>/<type>.webp` + persists `MediaAssetVariant` metadata (`generatedBy: sharp-r2`, `r2Key`, dims/size), and serves the cached variant on later hits; DOWNLOAD stays original. Private assets keep app-route URLs only and stay gated by the gallery access token / signed-media URL. Routes pinned to Node runtime for Sharp; `sharp` declared in package.json. Committed `7b8cb18` (media core + variants). Reported as commit-landed/audit-gated per boss ruling; not self-marked READY-FOR-AUDIT.
  >
  > **🔍 AUDIT · showrunner-boss [06-13-26 05:10 CDT]:** Audited §4 signed variants against the §5 media contract — security core is SOUND. Verified: signed URLs bind assetId+type+expires via HMAC-SHA256, checked timing-safe with length-guard + TTL (`lib/media.ts:211-221`); signing secret fail-closed in prod (`:182-189`); private assets store only the gated app route as `url`, never the public R2 URL, including generated variants (`:407,621,635`); decompression-bomb guard `limitInputPixels` + EXIF `.rotate()` (`:579-581`). Both delivery routes authorize correctly: `/api/media/assets` site-scopes the asset and requires a valid type-bound signature for private (`app/api/media/assets/[assetId]/route.ts:22-46`); the gallery route site+slug+PUBLISHED-scopes the item, validates the access token via `findActiveGalleryAccess(token, galleryId, siteId)`, and 404s private assets without an access record (`modules/portfolio/api/media.ts:21-67`). No bearer-URL leak. Findings:
  > - 🟠 HIGH — no per-IP rate limit on the public delivery routes. On-demand Sharp generation is CPU-bound and unauthenticated; a PUBLIC gallery exposes ~6 free Sharp generations per item (one per variant type) before the R2 cache warms, and the asset route is similarly open. The sibling §4 ZIP bundle already reuses `publicRateLimit` (4/10min) — both routes should reuse the SAME canonical limiter (keyed per asset/gallery) before any media-fetch/transform work. Root fix, consistent with the bundle precedent; not a new limiter.
  > - 🟡 MEDIUM — animated GIFs are in `allowedImageTypes`, so `isTransformableImage` is true and every non-DOWNLOAD variant is flattened to a static WebP (`:514-516,555` → `transformedR2VariantResponse`); animation is silently lost on CARD/HERO/FULL and only survives via DOWNLOAD. Either exclude GIF from the Sharp transform (serve original) or transform with `{ animated: true }`.
  > - 🟢 LOW — if a cached R2 variant object is deleted out-of-band but its `MediaAssetVariant` row remains, `safeR2ObjectResponse` swallows the miss and the request 404s instead of regenerating (`:570-573`). Fall through to regenerate on a cached-fetch miss.
  > - 🟢 LOW — variant `download=1` sets `content-disposition` with the original filename/extension while serving WebP bytes (`:702-704`), so a `photo.jpg` download contains WebP. Align the extension to the served variant or force DOWNLOAD for attachments.
  > - 🟢 LOW — concurrent first-hits on the same uncached (asset,type) each run Sharp + PutObject (idempotent upsert, wasted work). Acceptable; note only.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → straight to PATCHER; surface-owner worker-2 patches its own §4 after §2 resources to avoid a media-route collision)
  >
  > **🔧 PATCHER · showrunner-worker-2 [06-13-26]:** Patch `4123305`. Added canonical `publicRateLimitMessage` (4/10min) to both public delivery routes before any fetch/transform; excluded `image/gif` from the Sharp transform (animation preserved via original delivery); variant downloads use `.webp`. tsc/lint/build green.
  >
  > **✅ VALIDATOR · showrunner-boss [06-13-26 05:50 CDT]:** Confirmed in code. Asset route gates non-private with `publicRateLimitMessage("media_asset:<id>", {4,10})` → 429 before `mediaDeliveryResponse` (`app/api/media/assets/[assetId]/route.ts:49-55`); gallery route gates PUBLIC-no-token with `gallery_media:<gid>:<iid>` before asset fetch (`modules/portfolio/api/media.ts:47-53`) — same canonical limiter as the §4 ZIP bundle, no parallel limiter, and private/access-token deliveries correctly skip it (already auth-gated). `isTransformableImage` excludes `image/gif` so GIFs fall through to original R2 delivery (`lib/media.ts:515`); webp variant downloads name `.webp` (`:683`). All findings closed.
  >
  > **Status: `CONFIRMED`**

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

  > **⚠️ FLAG · Codex-2 [06-09-26]:** §5 media implementation is in the working tree but not yet marked READY-FOR-AUDIT because the repo currently contains overlapping uncommitted §4/§12 edits from other agents. Implemented: `MediaAssetVariant` schema + migration, focal point/usage context/storage-provider fields, adapter contract for REPO/R2/Cloudflare Images, named variant records (`THUMBNAIL`, `CARD`, `HERO`, `FULL`, `SOCIAL`, `DOWNLOAD`), signed private media URLs through `/api/media/assets/:assetId`, R2 private object proxying, Cloudflare Images upload/delivery support, media env/config/CSP, upload allowlist + size limit + fail-closed virus-scan hook, and portfolio media delivery through the shared `mediaDeliveryResponse` contract. Verification: `npm run prisma:generate`, `npx prisma validate`, and focused quiet ESLint pass for touched §5/related files pass; full `tsc --noEmit` is blocked by an unrelated §12 automation type error in `modules/automation/actions.ts`.

  > **ENGINEER · Codex-2 [06-09-26]:** READY-FOR-AUDIT for §5 media module. The prior TypeScript blocker is cleared; `npx tsc --noEmit` is green tree-wide. §5 implementation remains as described above: adapter-backed media contract, asset metadata expansion, generated variant records, signed private delivery route, R2/Cloudflare Images support, media CSP/env surface, upload safety gates, and portfolio delivery via the shared media response path. Commit note: not committed yet because required §5 behavior spans files currently mixed with other agents' uncommitted §4/§10/§12 edits in the shared worktree; I will stage only explicit §5 paths once the shared-file boundary is safe.

  > **🔍 LINTER · Claude [06-09-26]:** Well-built core — HMAC signatures bind assetId+variant+expiry and verify in constant time with a length guard (`lib/media.ts:157-187`), alt-text-or-decorative gate enforced before upload (`:120-128`, §14 satisfied), SVG explicitly excluded, 12MB cap checked before buffering, soft-delete respected on delivery (`:465`), and the delivery route scopes by site + gates private assets on a valid signature (`app/api/media/assets/[assetId]/route.ts:20-44`). Findings, priority order:
  > - 🟠 HIGH — **Hardcoded fallback signing secret.** `mediaSigningSecret()` falls back to the literal `"local-dev-media-url-secret"` when neither `MEDIA_URL_SIGNING_SECRET` nor `AUTH_SECRET` is set (`lib/media.ts:153-155`). In production with the env unset, every private-media signed URL is forgeable by anyone who knows that public default → private media disclosure. Fail closed: require a real secret when `NODE_ENV === "production"` and throw if absent (same "never ship a known secret" rule as the §10/§12 webhook-secret findings).
  > - 🟠 SIGNIFICANT — **Private delivery only actually works for R2; REPO and CLOUDFLARE_IMAGES private assets are unservable even with a valid signature.** `fetchMediaAssetSource` has a direct-read branch only for R2 (`r2ObjectResponse`, `:411-429,436-438`); for other drivers it fetches `generateVariantUrl()`, which for a private asset returns the app's own `/api/media/...` route **without** a signature (`:189-192,205,253`), so the inner fetch 404s. Cloudflare private images are uploaded with `requireSignedURLs=true` (`:263`) but can never be delivered, and repo-private assets can't either. Implement Cloudflare signed-delivery URLs (+ a repo private read), or restrict `isPrivate` to R2 and reject private uploads on other drivers so the feature isn't advertised-but-broken.
  > - 🟡 MEDIUM — **Upload allowlist trusts the client-declared MIME only.** `allowedImageTypes.has(file.type)` (`:142`) uses the spoofable multipart content-type with no magic-byte sniffing; a non-image payload labeled `image/png` passes (SVG is correctly excluded). Validate by content signature, not just declared MIME.
  > - 🟡 MEDIUM — **Delivery proxy fetches arbitrary `asset.url` with no host allowlist.** For non-R2 assets `fetchMediaAssetSource` does `fetch(absoluteUrl(asset.url …))` (`:441-444`); `asset.url` is admin/DB-set, so a repo reference pointed at an internal host makes the server proxy it (SSRF, admin-trust). Restrict server-side proxying to expected hosts (R2 base, imagedelivery.net) or only proxy private/R2 and redirect public assets to their CDN URL.
  > - 🟢 LOW/NOTE — `runVirusScanHook` is a fail-closed stub only (default mode lets uploads through with `scanned:false`; no real scanner) — fine as a hook, but it isn't scanning. Confirm the claimed image CSP is actually wired in response headers. Cross-cutting caution for §4 consumers: a signed URL is bearer for 15 min, so private-asset display URLs must only be minted on access-controlled render paths.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → PATCHER)

  > **PATCH · Codex-2 [06-09-26]:** READY-FOR-CONFIRM for the §5 media audit findings. Fixed the hardcoded-secret issue by making production media signing fail closed unless `MEDIA_URL_SIGNING_SECRET`/`AUTH_SECRET` is present and strong enough. Restricted private media to R2 on upload and metadata edits; non-R2 private delivery now returns null instead of recursively fetching unsigned app routes. Added image magic-byte validation for JPEG/PNG/WebP/GIF before upload. Added media proxy SSRF protection by reusing the existing safe HTTPS/public-host check and layering a media-origin allowlist for app-local assets, configured R2 public base/cloudflarestorage hosts, and Cloudflare Images delivery. Verification: focused quiet ESLint for media delivery files passed, `npx tsc --noEmit` passed, `npm run lint` passed, and `npm run build` passed.
  >
  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-09-26]:** All four findings confirmed fixed in code.
  > - 🟠 Signing secret — `mediaSigningSecret()` now throws in production when the secret is missing or weak (`isWeakProductionSecret`: <32 chars or contains local-dev/replace-with/change-me) (`lib/media.ts:131-134,178-185`); the known dev fallback only applies outside production.
  > - 🟠 Private delivery — `isPrivate` is now restricted to R2: `uploadMedia` rejects non-R2 private (`:382-384`) and `fetchMediaAssetSource` returns null for any private non-R2 asset (`:497-499`), so there's no advertised-but-broken Cloudflare/repo private path (Cloudflare upload no longer sets `requireSignedURLs`).
  > - 🟡 MIME — `detectImageMimeType` reads the first 16 bytes and `assertUploadFile` rejects when the detected signature ≠ declared type (`:147-176`).
  > - 🟡 SSRF — `fetchMediaAssetSource` now gates the proxy fetch behind `isAllowedMediaSourceUrl(url, request)` (`:508`), reusing the safe-HTTPS/public-host check + a media-origin allowlist. (Recommend a quick follow-check that the allowlist blocks private/link-local ranges.)
  >
  > **Status: `CONFIRMED`**

  > **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §5 selectable gallery layouts. Commits `203d30c` + `e6f5658` (the second a forward-repair restoring `public-gallery-view.tsx` after a commit-race blob issue — no history rewrite). `PortfolioGalleryLayout` enum + `PortfolioGallery.layout @default(GRID)` + migration `20260613063000`; admin create/update layout controls; public grid derives a layout class; CSS variants for masonry/editorial/carousel/before-after; manifest updated.
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 06:55 CDT]:** Verified the repair landed cleanly — `public-gallery-view.tsx` is intact (coherent imports incl. `PortfolioGalleryLayout`, existing `galleryMediaPath` delivery preserved) and the tree builds green. Layout is actually RENDERED: `galleryLayoutClass(gallery.layout)` → `public-gallery-layout-<x>` className on the grid (`:87-88,427`), not just stored. Admin setter is `portfolio:manage`-gated AND record-scoped via `getAccessibleGalleryWhere` (`modules/portfolio/actions.ts:252-258`, create at `:177-194`) — a PHOTOGRAPHER can only relayout their own galleries; invalid layout → GRID (`:51`). Reuses the existing media-delivery path. 🟢 the recurring admin-sidebar dev-server 500 (`shell/admin-sidebar.tsx` Prisma import trace) reappeared on worker-2's STALE running server but production build is clean — standing item to verify on a fresh server, not a §5 defect.
  >
  > **Status: `CONFIRMED`**

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

  > **ENGINEER · Codex [06-09-26]:** READY-FOR-AUDIT for §6 Client Book / CRM expansion outside the portfolio module. Added `ClientPipelineStage`, richer unified contact fields (company/household, alternate emails/phones, address, timezone, pronouns, birthday/anniversary, preferences), consent/preference tracking, data export/deletion request timestamps, `ClientFile`, and `ClientSegment` with default saved segments (`prisma/schema/clients.prisma`, `prisma/migrations/20260609220000_client_crm_expansion`). Reused `ClientTag` for CRM tags, added admin profile/file/segment actions with confirmed segment delete (`modules/clients/actions.ts`, `lib/admin-validation.ts`), expanded the clients list with saved segment filters and pipeline counts (`modules/clients/page.tsx`), and expanded client detail into a fuller CRM record with timeline entries for bookings, orders, payments, invoices, forms, emails, notes, uploads/files, gallery access, favorites, proof responses, proof decisions, and profile status changes (`modules/clients/detail/page.tsx`). Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run prisma:deploy`, and local HTTP checks for `/admin/modules/clients` plus a temporary local client detail render passed. Remaining §6 scope: client portal, CSV import/export, duplicate merge, and formal consent document versioning remain future work.

  > **🔍 LINTER · Claude [06-09-26]:** Clean, pattern-consistent work — `requireAdmin()` + shared `parseForm` everywhere, siteId-scoped, segment delete is confirm-gated, CRM tags reuse `ClientTag` scoped to `source:"admin"` so automation-created tags aren't clobbered, `clientFile.url` is correctly restricted to https/relative so the rendered `<a href>` can't carry `javascript:`/`data:` (no stored XSS), and the timeline is read-only aggregation. Findings, priority order:
  > - 🟠 HIGH — **`createClientAction` upserts on email and silently overwrites an existing client — including wiping consent history.** It does `client.upsert({ where: siteId_email, update: data, create: … })` (`modules/clients/actions.ts:125-132`); re-entering an existing email overwrites that client's entire record, and because create mode emits `policyAcceptanceHistory: []` when policy isn't re-checked (`:24-26,56`), the upsert's `update` branch **destroys the existing consent/policy acceptance history** — a §14/consent-record and FTC concern, not just a name clobber (this is the §3/§7 silent-upsert class, but with compliance data). Detect the existing email and error (or route to update); never overwrite a CRM record + consent history from a "create."
  > - 🟠 SIGNIFICANT — **Policy acceptance replaces history instead of appending.** `policyHistory` returns a single-element array assigned wholesale (`:24-26,56`), so each acceptance overwrites prior ones — the consent audit trail keeps only the latest acceptance. §14 wants consent *records*; append to the existing `policyAcceptanceHistory` rather than replacing it (and timestamp + source each entry).
  > - 🟡 MEDIUM — **Client files and notes are add-only.** `actions.ts` has only `addClientFileAction`/`addClientNoteAction` — no edit/delete, so a wrong attachment or note can't be removed. §14 wants destructive actions with confirm + recovery; add delete-with-confirm at least for files.
  > - 🟢 LOW — `uniqueSegmentKey` is check-then-create (TOCTOU) and `clientSegment.create` has no `P2002` catch (admin-only, low risk); `updateClientAction` uses `updateMany` with no existence check (harmless no-op on a stale id). Consider the established slug-collision pattern.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → PATCHER)

  > **PATCH · Codex [06-09-26]:** READY-FOR-CONFIRM for the §6 CRM audit findings. `createClientAction` is now create-only on email and redirects with an error when an existing client email is submitted, so create no longer overwrites CRM records or consent history (`modules/clients/actions.ts`). Policy acceptance entries now append timestamped `{ acceptedAt, source }` records to the existing `policyAcceptanceHistory` instead of replacing it. Added confirm-gated delete actions and UI controls for client notes and files (`clientNoteDeleteFormSchema`, `clientFileDeleteFormSchema`, `deleteClientNoteAction`, `deleteClientFileAction`, `modules/clients/detail/page.tsx`). Segment creation now catches `P2002` and returns a friendly duplicate-name error. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build`, and local HTTP render check for `/admin/modules/clients` passed.

  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-09-26]:** All four findings confirmed fixed. `createClientAction` is now create-only — it looks up the email and redirects with an error if it exists, then `client.create` (`modules/clients/actions.ts:244-259`), so an existing CRM record + its consent history are never overwritten. Policy acceptance now **appends**: `updateClientAction` reads the existing history and uses `appendPolicyHistory(existing.policyAcceptanceHistory, acceptedPolicy)` only when newly accepted, else leaves it untouched (`:269-285`). Confirm-gated `deleteClientNoteAction`/`deleteClientFileAction` exist (`:317,385`) — and they correctly use the new `requireAdmin("clients:manage")` enforcement. Segment create catches `P2002`. Clean.
  >
  > **Status: `CONFIRMED`**

  > **ENGINEER - Codex [06-09-26]:** READY-FOR-AUDIT for the remaining Section 6 CRM import/export/merge scope. Added mapped-header CSV import for new client records with duplicate-email skip behavior, invalid-email skip behavior, status/stage normalization, tag sync, preferences, consent flags, and timestamped policy-acceptance history (`modules/clients/actions.ts`, `lib/admin-validation.ts`). Added a full client CSV export route under `/admin/modules/clients/export` covering profile fields, tags, preferences, consent/data request fields, notes/files, appointments, forms, orders, billing docs, messages, testimonials, gallery access/favorite counts, and proofing response counts (`modules/clients/api/export.ts`, `app/admin/(protected)/modules/clients/export/route.ts`). Added confirm-gated duplicate merge that keeps a chosen survivor, fills blank survivor profile fields, unions alternate emails/phones/tags/policy history, moves notes/files/timeline refs/bookings/orders/forms/testimonials/billing/messages/subscribers/gallery/proofing rows, and deletes the duplicate (`modules/clients/actions.ts`, `modules/clients/page.tsx`). Updated module readiness so CSV import/export and duplicate merge are live, leaving portal access and formal consent document versioning as remaining Section 6 gaps (`modules/clients/module.ts`).
  >
  > Verification: `npm run lint`, `npm run prisma:generate`, and `npx tsc --noEmit` passed. `npm run build` compiled successfully but failed during Next type checking in unrelated in-flight Section 14 work at `lib/auth.ts:132` (`rolePermissions[user.role].includes(permission)` parameter inferred as `never`), so the build caveat is not from the Section 6 client files.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** Strong pass — I scrutinized the merge hardest (it deletes a client + relinks all their data) and it's data-safe: it runs in a `$transaction`, and I verified against the schema that it covers **every** `clientId` foreign key. The only `onDelete: Cascade` client-children are `ClientNote`/`ClientFile`/`ClientTag` (all moved/unioned before delete — `actions.ts:638-640,595-607`); every other relation is `SetNull` and explicitly re-pointed to the survivor (`:641-653`), so the final `client.delete` (`:654`) loses nothing. Field union is careful (`fillBlank`/`mergeStringArray`/`mergeJsonArray`, opt-ins OR'd, consent history merged, notes concatenated), and it's confirm-gated + self-merge/both-exist guarded. CSV import uses a proper quote-aware parser (`:77-119`, handles `""` escapes + embedded commas), normalizes headers and aliases the same way (`:121-131`), and correctly **skips** existing emails (`:520-523`) — no overwrite/consent-wipe, which is the right contrast to the create path. Findings:
  > - 🟡 MEDIUM — **Merge discards the duplicate's primary email.** Only the two `alternateEmails` arrays are merged (`:615`); the duplicate's own primary `email` is never folded into `survivor.alternateEmails` before the duplicate is deleted, so that address is permanently lost and a future booking/form/lookup using it won't match the survivor — which defeats part of the point of merging. Add both clients' primary emails into the survivor's `alternateEmails` (excluding the survivor's own).
  > - 🟡 LOW/MEDIUM — **Merge and bulk import aren't audit-logged.** The merge (deletes a client + relinks everything) and the import (bulk client create) are exactly the high-value actions §14's `recordAuditLog` should capture (who merged whom, counts imported). Wire them once §14 audit coverage expands.
  > - 🟢 LOW — Import is sequential per row (a `findUnique` + `create` + `syncClientTags` each) with no row cap — fine for now, slow for very large files; consider batching + a size limit. Merge tag-union drops a duplicate tag's differing `source`/`relatedId` metadata (acceptable).
  >
  > **Status: `READY-FOR-PATCH`** (one MEDIUM worth fixing now — the lost primary email; rest are minor/§14-dependent)

  > **PATCH - Codex [06-09-26]:** READY-FOR-CONFIRM for the Section 6 import/export/merge audit finding. Duplicate merge now preserves the duplicate client's primary email by folding it into the survivor's `alternateEmails` during merge, while excluding the survivor's own primary email and deduping after lowercase normalization (`mergeEmailAliases`, `modules/clients/actions.ts`). Audit logging for import/merge remains intentionally deferred to the Section 14 audit coverage expansion noted by the auditor.
  >
  > Verification: `npm run prisma:generate`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed.
  >
  > **Status: `READY-FOR-CONFIRM`**

  > **🛠 ENGINEER · showrunner-worker-1 [06-13-26]:** Closes the 06-09 🟡 deferral — merge + CSV import/export now audit-logged through the existing §14 `recordAuditLog`. Committed `86795aa`. `modules/clients/actions.ts`: bulk import writes `client.imported` (actor, `before:null`, capped after-snapshots + `truncatedClients` flag, file/header/row/import/skip counts); merge writes `client.merged` (survivor+duplicate before snapshots, merged-survivor after, both ids). `modules/clients/api/export.ts`: export writes `client.exported` (request context, capped client ids, row count). Compact `clientAuditSnapshot` keeps log size bounded.
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 11:10 CDT]:** Confirming directly — this is the right way to close the §14 deferral. Reuses the existing `recordAuditLog` (no parallel log), exactly as §8 testimonials did. Permission-gated: import/merge `clients:manage` (`modules/clients/actions.ts:551,652`), export `clients:export` (`modules/clients/api/export.ts:19`). Record-scoped with no IDOR — merge resolves BOTH operands through `getAccessibleClientWhere` before touching them (`actions.ts:664-667`), export scopes the query the same way (`export.ts:21`); a merge across a scope boundary can't be initiated. Captures actor + target + before/after on every path; snapshots are bounded (`auditSnapshotLimit = 100` + truncation flags, `actions.ts:198,630-631`; `export.ts:175-176`) so a large import/export can't bloat the log, and `clientAuditSnapshot` deliberately omits free-text private notes (`actions.ts:200-220`). Names are plainly human (`clientAuditSnapshot`/`mergeEmailAliases`/`auditSnapshotLimit`) — no AI tropes. Merge stays in its full-FK `$transaction` (`:688-750`); audit metadata is accurate. Finding: 🟢 LOW — the audit write is sequential-after-mutation (`recordAuditLog` runs after the merge tx commits, `:757` vs `:750`); identical to the established §14/§8 pattern, so if the audit write failed the mutation would already be durable. Same cross-cutting forward-work as §8 (same-tx for absolute completeness); not a defect here.
  >
  > **Status: `CONFIRMED` (committed `86795aa`)**

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

  > **🛠 ENGINEER · showrunner-worker-3 [06-13-26]:** §7 forms starter template catalog. Committed `26e8788`. Typed curated catalog `modules/forms/templates.ts` (contact, booking intake, lead capture, photo questionnaire, venue inquiry, product customization, waiver/model-release/agreement acknowledgements, testimonial request); `createFormFromTemplateAction` stamps a selected template into a DRAFT form with editable FormField rows; "Start from template" admin panel + manifest update.
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 06:55 CDT]:** Clean. `createFormFromTemplateAction` is `requireAdmin("forms:manage")`-gated (`modules/forms/actions.ts:266-267`), creates the form as `FormStatus.DRAFT` (`:283`), and builds FormField rows from the template via the EXISTING field model (type/fieldRole/isHidden, `:291-296`) — a curated seed + clone flow, no new form/field engine. Isolated to the forms module. No findings.
  >
  > **Status: `CONFIRMED`**

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

  > **🛠 ENGINEER · showrunner-worker-3 [06-13-26]:** §8 testimonials full moderation audit trail. Committed `46d42ef`. `modules/testimonials/actions.ts` moderation actions now write one `recordAuditLog` entry per actual state change — `testimonial.approved/rejected/archived/featured/unfeatured` + `testimonial.deleted` — with actor, site, target id/label, clientId, and before/after snapshots (status, featured, permission, author, quote preview); reject records the auto-unfeature. Manifest readiness updated. Reuses the §14 `lib/audit.ts` helper (no parallel log).
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 06:35 CDT]:** Strong, confirming directly (only 🟢 notes). Verified: permission-gated via `requireAdmin("testimonials:manage")` (`actions.ts:169,261`); record-scoped — `getAccessibleTestimonialWhere` is applied to the READ and the `updateMany`/`deleteMany` (`:172-174,207-208,264-266,283-284`), so §14b ownership is enforced on the mutation, not just the view (no IDOR). Entries are logged ONLY on real change (status `:224`, featured `:232`), so no spurious entries; before/after + actor + target captured (`:240-255`); reject auto-unfeature is recorded as `testimonial.unfeatured` when it changes (`:232-238`); delete logs the before-snapshot post-delete from the pre-fetched row (`:286-297`). Reuses §14 `recordAuditLog` — no parallel log. Findings: 🟢 the audit write is sequential-after-mutation (not atomic with it), so a crash between leaves an unlogged change — but this is the established §14 logging pattern, not §8-specific; same-tx audit writes for guaranteed completeness is cross-cutting forward-work. 🟢 logs intended change even if `updateMany` hit 0 rows in a rare findFirst→update race (negligible).
  >
  > **Status: `CONFIRMED`**

### 9. Content and SEO Module

Current status: basic homepage content exists.

Next requirements:

- Page blocks: hero, services, gallery preview, product collection, testimonials, FAQ, staff, CTA, pricing, location, contact, featured booking/product.
- Structured data generators: LocalBusiness, Product, Service, ImageObject, FAQ where appropriate, Event/Class, BreadcrumbList.
- SEO controls: title, description, canonical, Open Graph image, robots, sitemap, redirects, and slug manager.
- Local business support: business hours, departments, locations, service area, phone, map link, and seasonal closures.
- Image SEO: descriptive filenames, alt text workflow, captions, lazy loading, responsive images, and sitemap image hints.

  > **🛠 ENGINEER · showrunner-worker-1 [06-13-26]:** §9 Content & SEO. Committed `b9b6fe6`. `lib/seo.ts` canonical + Metadata helpers + schema.org builders (LocalBusiness/WebSite/Product/ImageObject/BreadcrumbList); `components/structured-data.tsx` JSON-LD renderer; dynamic `/sitemap.xml` + `/robots.txt`; metadata/canonical/OG/Twitter on home/shop/product/testimonials/forms; JSON-LD on home + product detail + breadcrumbs.
  >
  > **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 06:50 CDT]:** Strong, confirming directly (clean). The XSS-critical path is correct — `serializeJsonLd` escapes every `<` to `<` before `dangerouslySetInnerHTML` (`components/structured-data.tsx:3-8`), so dynamic content (product/testimonial/business text) can't break out of the `<script type="application/ld+json">` tag. Sitemap is tenancy-correct and leaks nothing private — all queries scoped by `settings.siteId`, filtered public/published only: ACTIVE products/forms, APPROVED testimonials, PUBLISHED+PUBLIC galleries (`app/sitemap.ts:34,57,74-75,93-95`), per-site canonical base. Stayed clear of other agents' surfaces. No findings worth a patch.
  >
  > **Status: `CONFIRMED`**

### 10. Communications Module

Current status: SMTP notifications exist.

Implementation status:

- Message template editor, allowed-token metadata, real outbox delivery visibility, manual delivery notes, scoped suppression-list entries, starter seed data, and admin module registration are audited with fixes applied as of 06-07-26.
- Automatic template rendering/sending is not yet wired into booking/order/form flows beyond the existing booking SMTP path. SMS adapters, provider delivery callbacks, bounce handling, retries, unsubscribe enforcement, and quiet hours remain pending.
- Proposed 06-09-26: adopt `usewaypoint/email-builder-js` for a client-friendly visual email builder if the compatibility spike passes. The repo is MIT-licensed, block-based, JSON-backed, and can render email-builder JSON to HTML; its self-hosting example is Vite + MUI. Caveat: the published `@usewaypoint/email-builder@0.0.9` package currently declares React 16-18 and Zod 1-3 peer ranges, while this app is React 19 and Zod 4, so do a small Next/App Router spike before installing it broadly.

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

- Visual email template library/editor with tokens and preview. Prefer `usewaypoint/email-builder-js` if the spike confirms React 19/Zod 4 compatibility, Next client-only behavior, bundle size, and email-client output quality. Persist the builder document JSON on `MessageTemplate`, generate `htmlBody` for sending, keep `textBody` as a required fallback, and validate every subject/body token against the template's allowed token metadata.
- Template library UX for non-technical clients: starter templates by workflow (booking created, booking confirmed, booking canceled, form submitted, invoice notice, order receipt, gallery access, reminder, review request), clone/customize from library, clear system-vs-custom labeling, version/restore, preview with sample event data, and test send through `EmailOutbox`.
- Automation template picker: replace the current freeform `subjectTemplate`/`bodyTemplate` path for `SEND_EMAIL` rules with an active `MessageTemplate` dropdown filtered by trigger/purpose/token compatibility, e.g. `When appointment booked send [Booking confirmation]`. Keep legacy freeform fields only as migration fallback until existing rows are converted.
- Template delivery wiring: when a trigger fires, queue the selected template through `lib/email`/`EmailOutbox` with sender identity, suppression scope, idempotency key, related record, and token validation instead of creating a parallel mailer.
- Builder safety and QA: restrict or sanitize raw HTML blocks, validate image URLs, preserve unsubscribe/compliance blocks for marketing templates, render mobile and desktop previews, and run smoke sends against Gmail/Apple Mail/Outlook before client-ready status.
- Transactional emails: booking, order, invoice, gallery, form, password/magic link, reminders.
- Marketing email guardrails: opt-in state, unsubscribe link, suppression list, sender identity, and campaign logging.
- SMS adapter: reminders, confirmations, two-way cancellation/reschedule, consent capture, and quiet hours.
- Inbox/log: sent messages, delivery status, bounce, failure retry, and manual resend.
- Notification routing: admin digest, per-staff alerts, assignment-based notifications, and internal notes.

### 11. Billing, Invoices, and Documents

Implementation status:

- Quotes/invoices/contracts admin foundation, collision-resistant document numbers, server-computed line totals, discounts, tax, guarded status transitions, draft-only mutability, document attachments, starter seed data, and module registration are audited with fixes applied as of 06-07-26.
- Public accept/pay links, hosted Stripe checkout handoff, partial payments, and PDF rendering are now built (🔍 AUDITED — see depth block below). Recurring invoices, partial-refund handling, and contract signing/versioning remain pending.

  > **🛠 ENGINEER · showrunner-worker-3 [06-13-26]:** §11 billing depth. `BillingPayment` ledger model + migration `20260613051000_billing_partial_payments`; public `/billing/[token]` accept + pay (amount up to remaining → shared Stripe Checkout helper, success/cancel return); partial payments recorded against `BillingPayment`; webhook reconciles amount+currency, marks PAID/FAILED/REFUNDED, flips the document PAID only when cumulative paid ≥ total; manual admin PAID writes a MANUAL ledger payment for the remaining balance; server-rendered `/billing/[token]/pdf`; dashboard revenue/open-balance now read the payment ledger. Committed `99e0eb9`. Implementation-complete; audit-gated on worker-2's tree tsc-green.
  >
  > **🔍 AUDIT · showrunner-boss [06-13-26 05:40 CDT]:** Audited the money paths end-to-end — strong, no 🔴/🟠. Verified: public pay re-validates `0 < amount ≤ remaining` authoritatively inside the create tx (`lib/commerce/stripe.ts:261-265`), tenancy-scoped by `siteId_publicAccessToken`; webhook settle reconciles `session.amount_total === payment.amountCents` + currency before crediting (`:583-592`) and is idempotent (precise `billingPaymentId` in metadata; `settleBillingPayment` re-mark is a no-op, the sum counts the row once; `lib/billing/payments.ts:40-93`); document flips PAID only at `remainingCents===0` (`payments.ts:71-85`); `markBillingPaymentFailed` won't un-pay a PAID/REFUNDED row (`:102-114`); manual admin PAID writes a MANUAL payment for EXACTLY the remaining balance, no double-count (`lib/billing/status.ts:95-119`); PDF route is token+site-scoped, DRAFT-gated, and PDF-injection-safe via `pdfSafe` escaping (`app/billing/[token]/pdf/route.ts:11-17,55-63`). Findings:
  > - 🟡 MEDIUM — Overpay via concurrent/duplicate PENDING checkouts. `getBillingPaymentSummary` counts only PAID/AUTHORIZED, so PENDING amounts aren't reserved against `remaining`, and `settleBillingPayment` credits the full amount without re-clamping. Two sessions opened/paid concurrently (or a double-submit the payer completes twice) can settle past `totalCents`. Business over-collects (refundable), but it's a ledger-integrity gap. Fix properly: reserve recent PENDING (with a TTL) toward remaining at checkout-create, and/or clamp/reject at settle when the credit would exceed remaining.
  > - 🟢 LOW — `findStripeBillingPayment` documentId fallback returns the OLDEST payment (`orderBy createdAt asc`, `:524`); with multiple partials and missing precise ids it could settle the wrong row. Safe today (metadata always carries `billingPaymentId`); drop the documentId fallback or note the latent risk.
  > - 🟢 LOW — Partial refunds aren't reflected in the ledger (REFUNDED only on full refund / `amount_refunded ≥ amountCents`, `:734`), so paid/remaining overstate after a partial refund. Consistent with §3's forward-work note; track as forward work, not a regression.
  >
  > **Status: `READY-FOR-PATCH`** (the 🟡 overpay reservation/clamp is the one real fix; 🟢s are note/forward-work. worker-3 owns the billing surface → patches its own; billing-only, no collision with worker-2's §2.)
  >
  > **➕ NEW SCOPE · @user [06-13-26]:** payment-provider expansion is now tracked as its own cross-cutting item — see **§15. Payments Platform** below and the two §15 Status Index rows.
  >
  > **🔧 PATCHER · showrunner-worker-3 [06-13-26]:** Patch `3bd6455`. Two-layer overpay fix: `getBillingPaymentSummary(reservePending)` adds a 30-min-TTL PENDING reservation so duplicate checkout-session creation reserves balance (`lib/billing/payments.ts:35-49`), billing checkout creation runs Serializable computing available = total − paid/reserved (`lib/commerce/stripe.ts`); `settleBillingPayment` runs Serializable, is idempotent on already-PAID, rejects terminal FAILED/REFUNDED, and refuses to credit beyond remaining (marks the over-credit attempt FAILED w/ `payment_would_exceed_remaining_balance`).
  >
  > **🔴 VALIDATOR · showrunner-boss [06-13-26 06:10 CDT]:** Core overpay PREVENTION confirmed solid — `settleBillingPayment` is Serializable, idempotent (already-PAID returns summary, no double-credit; `payments.ts:75-77`), terminal-state-safe (`:78-80`), and refuses to mark PAID when `amount > remaining` (`:83`); the checkout-creation reservation closes the duplicate-session window. BUT one new problem: the rejection BOOKKEEPING doesn't persist. The over-credit branch marks the payment FAILED with metadata (`:84-98`) then `throw`s in the SAME `$transaction` (`:100`) — the throw rolls the whole tx back INCLUDING that FAILED update, so a rejected over-credit payment is left PENDING (not FAILED); if it already captured at the provider it's stuck PENDING with no FAILED/metadata trail. Fix: persist the rejection without rolling it back — mark FAILED in a separate committed write (or return a rejection result instead of throwing after the update). Core money-safety is NOT at risk (never credited); this is durable rejection state.
  > - 🟢 forward — a rejected over-credit payment that already captured at the provider needs a refund path (metadata flags it once the FAILED state actually persists).
  >
  > **Status: `READY-FOR-PATCH`** (return to worker-3 — small, billing-only; does NOT block worker-4's §15 commit, which is a separate file set layered on `3bd6455`)
  >
  > **🔧 PATCHER · showrunner-worker-3 [06-13-26]:** Re-patch `0c9b319`. The over-credit branch now marks the payment FAILED + metadata and RETURNS `{rejected:true}` from the Serializable tx (commits the FAILED state) instead of throwing inside it; the error is thrown AFTER the tx resolves (`lib/billing/payments.ts:86-106,145-149`). Committed only `payments.ts`.
  >
  > **✅ VALIDATOR · showrunner-boss [06-13-26 06:30 CDT]:** Confirmed in code. The rejection now persists — `:87-101` writes FAILED + `payment_would_exceed_remaining_balance` metadata, `:103-106` returns `{rejected:true, summary}` so the `$transaction` COMMITS (no in-tx throw on this path), and the throw is moved outside to `:147-149` after the tx resolves. A rejected over-credit is durably FAILED with a metadata trail, not stuck PENDING; the caller still gets the error. Idempotent already-PAID (`:75-79`) and normal settle (`:141-144`) unchanged; Serializable + clamp intact. §11 overpay fix COMPLETE.
  >
  > **Status: `CONFIRMED`**

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

> **READY-FOR-AUDIT · Codex-4 [06-09-26]:** §12 non-webhook executor build is implemented for audit. Live module events now create durable `AutomationRun` rows with payload snapshots, immediately process non-webhook actions, and leave retryable/dead-letter state for failures (`lib/events/emit.ts`, `lib/events/automation-runs.ts`). Implemented executors: `SEND_EMAIL`, `NOTIFY_ADMIN`, `REQUEST_REVIEW` through active email `MessageTemplate` + `EmailOutbox`; `UPDATE_STATUS`; `ADD_TAG` via `ClientTag`; `CREATE_TASK`/invoice-prep task via `AutomationTask`. Added `actionConfig`, `messageTemplateId`, run attempt/replay fields, `DEAD_LETTER`, `AutomationTask`, `ClientTag`, migration `20260609210000_automation_action_executors`, admin template/config UI, dead-letter replay action, recent task table, health warnings, and `npm run automation:process`. Verification: `npm run prisma:generate`, `npx tsc --noEmit`, and `npm run lint` pass.

> **🔍 LINTER · Claude [06-09-26]:** Strong, well-organized engine — durable run rows, per-action executors, exponential backoff (`automation-runs.ts:61-64`), dead-letter after `maxAttempts`, replay that re-queues a fresh run linked via `replayOfRunId`, and email actions correctly reuse `queueEmail`/`queueAdminEmail`/`EmailOutbox` with idempotency keys rather than forking a mailer. Findings in priority order:
> - 🔴 BLOCKER — **`UPDATE_STATUS` bypasses the canonical guarded transitions and their side effects.** For `order` it runs raw `prisma.order.updateMany({ data: { status, placedAt: PAID?now } })` (`automation-runs.ts:381-389`), bypassing `updateOrderStatus`/`assertAllowedOrderStatusTransition` and the provider-confirmed PAID/REFUNDED gate **just confirmed in §3** — so an `UPDATE_STATUS → order/PAID` rule marks an order paid with **no provider confirmation, no inventory decrement, no coupon redemption, no receipt email, and no `order.paid` emit**. For `billing_document` it likewise bypasses §11's `assertAllowedStatusTransition` (PAID/VOID terminal, draft-only) and sets `acceptedAt`/`paidAt` raw (`:366-379`), permitting illegal moves like VOID→PAID. This is both a correctness defeat of two confirmed gates and a direct violation of the modular prime directive (reuse the canonical path). Fix: route `order` through `updateOrderStatus(...)` and `billing_document` through the billing status-transition helper; for `booking` (`:309-323`) call the existing guarded booking-status path rather than a raw `update` (it already correctly fires `queueBookingStatusEmail`). Statuses these helpers refuse (e.g. provider-confirmed PAID) should surface as a run failure, not a silent raw write.
> - 🟠 HIGH — **No atomic claim → double execution under concurrency.** `processAutomationRuns` selects `QUEUED` runs and executes them with no intervening claim/lock (no `RUNNING` state exists in `AutomationRunStatus`), while runs are processed from **two** racing entry points: inline inside the request via `emitModuleEvent` (`emit.ts:319-321`) and the `automation:process` worker. The same run can be picked up by both. Idempotent actions are safe (SEND_EMAIL via idempotencyKey, ADD_TAG via upsert), but `CREATE_TASK`/`REQUEST_REVIEW`/`CREATE_INVOICE` call `automationTask.create` (`:276-288`) and will create **duplicate tasks**; `UPDATE_STATUS` will re-queue duplicate booking-status emails. Claim each run atomically before executing — e.g. `updateMany({ where: { id, status: QUEUED, attemptCount: run.attemptCount }, data: { status: RUNNING, attemptCount: +1 } })` and only execute when `count === 1`.
> - 🟠 HIGH — **`CREATE_INVOICE` does not create an invoice.** It is wired to `executeCreateTask(..., 'Prepare invoice for …')` (`automation-runs.ts:415-416`), so the action advertised as "create invoice" silently produces a reminder *task*, not a `BillingDocument`. That's a band-aid masquerading as a feature. Either implement real invoice creation through the billing module's create path, or remove/label `CREATE_INVOICE` as unsupported in the admin so it isn't presented as wired.
> - 🟠 SIGNIFICANT — **Automations execute synchronously inside the emitting request.** `emitModuleEvent` `await`s `processAutomationRuns` (`emit.ts:319-321`), so every booking/order/form/etc. action now runs its matched automations — emails, status writes, task creates — inline in the user/admin request path. Per-run errors are caught so it won't throw, but it adds unbounded latency (N matched rules × DB/email work) and couples request latency to automation throughput, partly defeating the worker+retry design and creating the race in the finding above. Prefer enqueue-only on emit and let the worker drain, or cap/diagnose the inline path deliberately.
> - 🟡 MEDIUM — **EmailOutbox status compared by string literal.** `outbox.status === "FAILED" | "SUPPRESSED" | "QUEUED"` (`automation-runs.ts:143-144,171,175-176`) instead of the `EmailOutboxStatus` enum (every other enum here is imported). A future enum rename silently breaks outcome detection. Import and use the enum.
> - 🟡 MEDIUM — **Run status diverges from real delivery.** `executeSendEmail` reads the outbox row right after queueing and throws on `FAILED` (`:141-143`); on retry `queueEmail` dedups by idempotencyKey so the same `FAILED` row is re-read and the run dead-letters even though the email pipeline's own backoff may still deliver — and conversely a `QUEUED` row marks the run SUCCEEDED before delivery is known. Treat the run as "dispatched" and let `EmailOutbox` own delivery state, or reconcile from provider events; don't dead-letter a run whose email is still live.
> - 🟢 LOW — `replayAutomationRun` accepts `FAILED` (`:505`) but the engine never sets `FAILED` (only QUEUED/SUCCEEDED/SKIPPED/DEAD_LETTER), so that branch is currently unreachable — harmless, but either remove it or document the intended manual-fail path.
>
> Sidebar (not §12, noticed in passing): the shared-worktree commit problem codex-4 raised is real and needs a coordination fix — see chat.
>
> **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → straight to PATCHER)

> **🔧 PATCHER · Codex-3 [06-09-26]:** Applied the §12 executor fixes for READY-FOR-CONFIRM.
> - `UPDATE_STATUS` now routes `booking` through the shared booking status helper, `billing_document` through the shared billing status-transition helper, and `order` through `updateOrderStatus`, preserving the §3 provider-confirmed PAID/REFUNDED gate and §11 billing transition rules.
> - Added worker-safe shared helpers for booking status and billing status/invoice creation (`lib/bookings/status.ts`, `lib/billing/status.ts`), and updated admin booking/billing status actions to use the same helpers.
> - Added `AutomationRunStatus.PROCESSING` plus migration `20260609213000_automation_run_processing_status`; `processAutomationRuns` now atomically claims each queued run with `updateMany({ id, status: QUEUED, attemptCount })` before executing.
> - `emitModuleEvent` now enqueue-only records non-webhook `AutomationRun` rows; the `automation:process` worker owns execution, removing inline request-path execution and the inline-vs-worker race.
> - `CREATE_INVOICE` now creates a real draft `BillingDocument` with a line item through the shared billing helper, and automation save validation requires invoice amount config instead of silently creating a task.
> - Replaced EmailOutbox string status comparisons with `EmailOutboxStatus`; replay now accepts only `DEAD_LETTER`, matching the statuses the engine actually emits.
> - Verification: `npm run prisma:generate`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. During validation I also removed two unrelated §6 build blockers (`Payment.paidAt` access and missing Prisma type import) so the full tree could build.
>
> **Status: `READY-FOR-CONFIRM`**
>
> **✅ VALIDATOR · Claude [06-09-26]:** All six findings confirmed fixed in code.
> - 🔴 BLOCKER — `executeUpdateStatus` now routes `order`→`updateOrderStatus`, `billing_document`→`updateBillingDocumentStatus`, `booking`→`updateBookingStatus` (`lib/events/automation-runs.ts:326,373,379`), each with **no** `providerConfirmed`, so an automation→order/PAID is rejected by the §3 gate and billing illegal moves are rejected by `assertAllowedBillingStatusTransition` (same one-way table as §11, PAID/VOID terminal — `lib/billing/status.ts:10-30,93`). The helper is real, not a wrapper. (client/form/testimonial/gallery keep raw `updateMany` — acceptable, those have no canonical transition guard to bypass.)
> - 🟠 Atomic claim — `claimAutomationRun` does `updateMany({ id, status: QUEUED, attemptCount })` → `PROCESSING` and only executes when `count === 1` (`automation-runs.ts:471-486,515-521`); double-execution by the inline/worker race is closed.
> - 🟠 `CREATE_INVOICE` — now builds a real DRAFT `BillingDocument` + line item via `createAutomationInvoice` with cents caps, discount/total validation, client-existence check, and totals recompute (`lib/billing/status.ts:115-181`); rule save requires amount config (`automation-runs.ts:396-398`). No more task-masquerading-as-invoice.
> - 🟠 Inline execution removed — `emitModuleEvent` no longer calls `processAutomationRuns` (the old inline call is gone; grep-clean in `lib/events/emit.ts`); the `automation:process` worker owns execution.
> - 🟡 `EmailOutboxStatus` enum used throughout (`automation-runs.ts:158,159,186,190,191`); no string literals remain.
> - 🟢 Replay accepts only `DEAD_LETTER` (`automation-runs.ts:555`).
>
> **Forward-looking (new minor, not blocking):** the claim moves QUEUED→PROCESSING, so a worker crash mid-execution leaves a run stuck in `PROCESSING` (replay only recovers `DEAD_LETTER`). Add a stale-`PROCESSING` reaper (requeue rows in PROCESSING past a timeout) when worker provisioning is finalized. Thanks for using `updateOrderStatus` and extracting shared booking/billing helpers — that's the right modular fix and it de-dupes the admin actions too.
>
> **Status: `CONFIRMED`**

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

> **🛠 ENGINEER · Copilot [06-10-26]:** Added adapter configuration and retention controls to site settings (`prisma/schema/core.prisma`, `modules/settings/{page,actions}.tsx`, `lib/admin-validation.ts`), a reusable public analytics bootstrap/tracker (`components/analytics/tracker.tsx`, `lib/analytics/{config,ecommerce,retention}.ts`, `app/layout.tsx`), canonical ecommerce payloads for `view_item` / `add_to_cart` / `begin_checkout` / `purchase` across the storefront/cart/order paths (`app/shop/[slug]/page.tsx`, `app/shop/page.tsx`, `app/cart/{actions,page}.tsx`, `lib/commerce/{cart,orders}.ts`, `lib/events/emit.ts`), and server-side retention enforcement on emit/admin/export reads (`modules/analytics/{actions,page}.tsx`, `modules/analytics/api/export.ts`). Search Console verification now renders from settings; consent UI and any future server-side ad-network conversion hooks remain separate follow-on work.
>
> **Status: `READY-FOR-AUDIT`**
>
> **🔍 LINTER · Claude [06-10-26]:** Strong, reuse-first slice. The ecommerce layer is canonical GA4 — `view_item`/`add_to_cart`/`begin_checkout`/`purchase` with correct `items[]`/`value`/`currency`/`transaction_id`/`coupon` and cents→currency conversion (`lib/analytics/ecommerce.ts`); the Meta mapping is right (`ViewContent`/`AddToCart`/`InitiateCheckout`/`Purchase`, `tracker.tsx:73-106`); GA4 uses `send_page_view:false` so events drive reporting. Consent is genuinely plumbed end-to-end (cookie `sr_tracking_consent` → `proxy.ts` `x-showrunner-consent` header → `app/layout.tsx` + server `emit.ts:108,224`), and retention is siteId-scoped server-side (`lib/analytics/retention.ts`). Findings, priority order:
> - 🟠 HIGH — **Tracking is default-ON for un-decided visitors.** `PublicAnalyticsBootstrap` only suppresses when `consent === "denied"` (`tracker.tsx:162`); with the consent UI deferred, every visitor's cookie is `"unset"`, so GA4/Google Ads/Meta Pixel load for everyone with no opt-in. For GDPR/ePrivacy the default for analytics/marketing tags should be **deny-until-granted** (GA4 Consent Mode `default: denied`). The hook is in the right place — change the default posture (treat anything other than an explicit `"granted"` as no-load, or wire GA Consent Mode defaults) and ship the consent UI before any EU/production launch. Don't mark §13 done until this lands.
> - 🟡 MEDIUM — **Retention runs inline on the hot emit path.** `enforceAnalyticsRetention` (a `deleteMany` over `AnalyticsEvent`) is invoked on **every** server event emit (`lib/events/emit.ts:173`), not just admin/export reads. On a busy public site every booking/view/add_to_cart fires a retention sweep — write amplification + contention on the conversion path. Throttle it (periodic/probabilistic) or move to a scheduled job like the email cron; keep the admin/export calls.
> - 🟡 MEDIUM — **Adapter IDs are interpolated raw into inline `<Script>` blocks.** `ga4MeasurementId`/`googleAdsTagId`/`metaPixelId` are template-injected into executable inline scripts (`tracker.tsx:170-188`) and only `cleanIdentifier` trims/slices them (`config.ts:5-7`) — no format check. An OWNER/ADMIN could break out of the string literal and run arbitrary JS on every public page (stored script injection). Validate against strict formats (`G-…`/`AW-…`/`GTM-…`/numeric pixel) or escape. Admin-only today, cheap to harden, and the blast radius grows as §14 widens admin roles.
> - 🟢 LOW — **Event de-dupe can drop legitimate repeats.** `TrackAnalyticsEvent` de-dupes on a module-level `Set` keyed by `onceKey || JSON.stringify(event)` (`tracker.tsx:53,196-199`); without an explicit `onceKey`, viewing/adding the same product twice in a session is silently suppressed. Require `onceKey` (e.g. `transaction_id` for purchase) for non-idempotent events.
>
> Build: the §13 core libs read as type-correct in isolation, but a clean tree-wide `tsc` can't be verified right now — the tree carries overlapping in-flight §14b/§2/§1 work from other agents. Re-run a full build once those land.
>
> **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → PATCHER; patches QUEUED — build is on hold per @user until codex usage renews. The 🟠 consent default should be settled with @user since it's a launch-gating compliance posture.)

> **🔧 PATCHER · claude-worker [06-10-26]:** Resolved both assigned non-decision findings.
>
> 🟡 Retention off the hot emit path: removed the per-event `enforceAnalyticsRetention` call from `recordAnalyticsEvent` (`lib/events/emit.ts:173`) — server event emission no longer runs an `AnalyticsEvent` `deleteMany` on every booking/view/add_to_cart. Added `sweepAnalyticsRetention()` (`lib/analytics/retention.ts`), which iterates all sites and enforces each site's configured `analyticsRetentionDays`. Wired it up following the existing email-cron worker pattern: `modules/analytics/api/retention-sweep.ts` (POST handler, `ANALYTICS_WORKER_SECRET || EMAIL_WORKER_SECRET` bearer auth via `lib/api/secrets.ts`), `app/api/internal/analytics-retention/route.ts` (route re-export), `scripts/process-analytics-retention.ts` (CLI for the scheduled job, mirrors `process-email-outbox.ts`), and a new `analytics:process` npm script. `modules/analytics/health.ts` now warns via `envLooksDefault()` if the worker secret isn't configured. The admin-page and CSV-export retention calls (`modules/analytics/{actions,page}.tsx`, `modules/analytics/api/export.ts`) are untouched.
>
> 🟡 Adapter-ID script injection: `lib/analytics/config.ts` no longer passes `ga4MeasurementId`/`googleAdsTagId`/`metaPixelId` through the bare trim/slice `cleanIdentifier`. Each is now checked against a strict allowlist pattern (new `matchIdentifier` helper) — GA4 `^G-[A-Z0-9]{1,16}$`, Google Ads/GTM `^(AW|GTM)-[A-Z0-9]{1,16}$`, Meta Pixel `^[0-9]{1,32}$` — and reduced to `""` if it doesn't match. `PublicAnalyticsBootstrap` (`tracker.tsx`) already treats an empty id as "skip this adapter's script block", so a malformed/malicious value saved in settings never reaches the inline `<Script>` bodies or the GTM `src` URL. `searchConsoleVerification` is unchanged (renders via a JSX `content` attribute in `app/layout.tsx`, not an inline script — not part of this finding).
>
> 🟢 Dedupe-drops-repeats and 🟠 consent-default-ON were not part of this assignment and are untouched (consent default explicitly deferred per @user — clients are US-only for now).
>
> Verification: `npx eslint lib/events/emit.ts lib/analytics/retention.ts lib/analytics/config.ts components/analytics/tracker.tsx modules/analytics/health.ts modules/analytics/api/retention-sweep.ts app/api/internal/analytics-retention/route.ts scripts/process-analytics-retention.ts --max-warnings=0` passes; `npx tsc --noEmit --pretty false` shows no errors in any of these files.
>
> **Status: `READY-FOR-CONFIRM`**

> **✅ VALIDATOR · claude-boss [06-10-26 22:30 CDT]:** Both patches confirmed in code.
> 🟡 Retention off hot path — VERIFIED: `lib/events/emit.ts` has zero `deleteMany`/`enforceAnalyticsRetention`/`retention` references (grep clean), so emit no longer sweeps per event. `sweepAnalyticsRetention()` exists (`lib/analytics/retention.ts:27-37`), iterates all sites and re-normalizes each site's `analyticsRetentionDays`; `enforceAnalyticsRetention` retained for admin/export. Worker route exists (`app/api/internal/analytics-retention/route.ts`) and CLI exists (`scripts/process-analytics-retention.ts`), mirroring the email-cron pattern.
> 🟡 Adapter-ID injection — VERIFIED: `lib/analytics/config.ts:5-7,13-16,31-33` validates each id against strict allowlists (`G-`, `(AW|GTM)-`, numeric) via `matchIdentifier`, dropping non-matches to `""` before they reach the inline `<Script>` sinks; `[A-Z0-9]`-only charset closes the string-literal breakout. `searchConsoleVerification` correctly left as a JSX attribute (not a script sink).
> Forward (non-blocking): the new analytics-retention cron is deployment config to provision (same posture as the email worker). 🟠 consent-default and 🟢 dedupe remain open by decision, tracked in the Status Index.
>
> **Status: `CONFIRMED`** (for the two assigned patches; §13 item stays open on the deferred 🟠 consent posture + 🟢 dedupe)

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

  > **ENGINEER · Codex-3 [06-09-26]:** READY-FOR-AUDIT for the §14 AuditLog + role-enforcement foundation. Added typed `AdminRole` values (`OWNER`, `ADMIN`, `STAFF`, `PHOTOGRAPHER`, `FULFILLMENT`, `ACCOUNTANT`, `VIEWER`) on `AdminUser`, an `AuditLog` model with actor/site/target/request/metadata fields, and migration `20260609224500_admin_roles_audit_log` that safely casts existing role strings to the enum. Seeded admin users are now `OWNER`.
  >
  > Added `lib/audit.ts` with `recordAuditLog()` and request IP/user-agent capture, plus shared permission helpers in `lib/auth.ts` (`AdminPermission`, `hasAdminPermission`, `assertAdminCan`, and optional `requireAdmin(permission)` enforcement). First enforcement/audit surfaces are intentionally narrow: admin sign-in success/failure, settings updates, client CSV export, form CSV export, and confirmed client note/file/segment deletes. Platform foundation status now reports audit/roles as schema-ready while calling out remaining role-table/module-scope/record-ownership work.
  >
  > Verification: `npm run prisma:generate`, `npx prisma validate`, focused ESLint for §14 files, full `npm run lint`, tree-wide `npx tsc --noEmit --pretty false`, and `npm run build` pass. Earlier email-builder/communications blockers were cleared by codex-4 before the final full-tree verification rerun.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** Good foundation — enum `AdminRole` with a clean role→permission matrix (`lib/auth.ts:37-45`), `hasAdminPermission`/`assertAdminCan`/`requireAdmin(permission?)` helpers, `AUTH_SECRET` enforced in prod (`:53-64`), and `recordAuditLog` capturing actor/role/ip(forwarded-for)/ua/target/metadata (`lib/audit.ts:42-64`), seeded OWNER. codex-3 is upfront that enforcement is "intentionally narrow." Findings:
  > - 🟠 HIGH (the gating work, not a defect) — **Roles are defined but not yet load-bearing.** `requireAdmin()`'s permission arg is optional (`lib/auth.ts:141-146`), and nearly every admin action still calls the bare `requireAdmin()` — so a STAFF/VIEWER/ACCOUNTANT session passes the guard on actions it shouldn't (e.g. a VIEWER can still hit product/billing/automation mutations). Enforcement is wired into only ~6 surfaces so far. To make §14 real, every admin action must pass its required permission (ideally flip to default-deny: require an explicit permission and audit the exceptions). This is the bulk of the remaining work before roles mean anything. Also needs a user-management UI to create admins / assign roles (only the seeded OWNER exists today; `users:manage` is defined but unused).
  > - 🟡 MEDIUM — **Login rate limit is still an in-memory `Map`** (`lib/auth.ts:13,70-88`) — the exact reset-on-deploy / not-shared-across-replicas pattern the §8 audit flagged as ineffective in production. §14 is the right place to move it onto the DB-backed `PublicRateLimit`/shared store; the §14 sign-in audit logging now sits on top of a limiter that doesn't actually limit in prod.
  > - 🟡 MEDIUM — **Audit write failures are swallowed** to `console.error` (`lib/audit.ts:61-63`). Right call to not block the action, but for a compliance trail a silently-dropped entry is an undetectable gap — consider a persisted fallback (the `EmailOutbox` failed-row pattern) so audit gaps surface.
  > - 🟢 LOW — Confirm `recordAuditLog` callers consistently pass the resolved actor (role/id) rather than just email, so the trail attributes role/user correctly.
  >
  > **Status: `READY-FOR-PATCH`** — for the MEDIUMs now (DB-backed login limiter, audit-failure fallback). The HIGH (broad permission enforcement + role-management UI) is a sized follow-on §14 item, not a quick patch — track it as the next §14 chunk, don't mark §14 "done" on this foundation alone.

  > **PATCHER · Codex-3 [06-09-26]:** READY-FOR-CONFIRM for the two §14 MEDIUM findings. Replaced the in-memory admin login-attempt `Map` with DB-backed `PublicRateLimit` rows keyed by the default site, `admin_login` scope, normalized email, and request IP; failed attempts increment the persisted window and successful login clears it. Added `AuditLogFailure` plus migration `20260609225500_audit_failure_fallback`; `recordAuditLog()` now writes a bounded fallback row with action/target/actor/error/payload when the primary `AuditLog` insert fails, and only falls back to console if the fallback write also fails.
  >
  > Follow-on §14 chunk opened: broad role enforcement remains intentionally unresolved here. Next §14 work should make permissions load-bearing across all admin actions/routes, preferably default-deny for mutations/exports, and add owner-only admin user management for creating admins and assigning roles.
  >
  > Verification: `npm run prisma:generate`, `npx prisma validate`, tree-wide `npx tsc --noEmit --pretty false`, `npm run lint`, and `npm run build` pass.
  >
  > **Status: `READY-FOR-CONFIRM`**

  > **ENGINEER · Codex-3 [06-09-26]:** READY-FOR-AUDIT for §14 chunk 2 role-management + focused permission enforcement. Added a required `users` admin module with owner-only access (`requireAdmin("users:manage")`) for creating admin users, assigning roles, and confirmed deletion. Role changes/deletes are protected against deleting yourself or removing the last owner, passwords are bcrypt-hashed, and create/role-change/delete actions write audit events. The admin sidebar now hides owner-only modules from roles without `users:manage`, using a shared client-safe permission matrix (`lib/admin-permissions.ts`) while server actions remain the enforcement boundary.
  >
  > Permission coverage was expanded on the highest-risk mutation surfaces: billing actions now require `billing:manage`, products/order commerce actions require `products:manage`, automation/webhook/run actions require `automation:manage`, and settings updates already require `settings:update`. Settings module readiness now reflects that role/audit controls are foundation-live while full coverage and record ownership remain pending.
  >
  > Remaining §14 work: continue the module-by-module permission sweep across lower-risk modules, then add record ownership rules for staff/photographer scoped views. This chunk does not claim §14 is fully done.
  >
  > Verification: `npm run prisma:generate`, `npx prisma validate`, scoped ESLint for §14 touched files, and full `npm run lint` pass. Tree-wide `npx tsc --noEmit --pretty false` is currently blocked by unrelated in-flight §2 scheduling work (`app/book/booking-page-shell.tsx` staffAssignments typing and `lib/scheduling/native.ts` staffId option typing), so `npm run build` is gated on that external blocker rather than this §14 chunk. (Note: codex's §2 reports build green, so that blocker has cleared.)
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** The users module is excellent — every action is owner-gated via `requireAdmin("users:manage")`, passwords are bcrypt(12), and it guards self-delete, self-demote-from-owner, and last-owner removal, with audit logging on create/role-change/delete and a P2002 dup-email guard (`modules/users/actions.ts:20-131`). The client-safe matrix split (`lib/admin-permissions.ts`) for sidebar hiding while keeping server actions as the enforcement boundary is the right call. Verified the sweep landed on billing/products/automation/settings/clients/exports/users. Findings:
  > - 🟠 SIGNIFICANT — **Enforcement is still partial.** forms, testimonials, communications, portfolio, media, and appointments mutation actions are still bare `requireAdmin()` (no permission arg), so a VIEWER/ACCOUNTANT session can still edit forms, moderate testimonials, manage galleries/media, edit comms templates, and manage appointments. Roles are now load-bearing for the high-risk modules but not yet complete — finish the module-by-module sweep across the rest to actually close the §14 enforcement HIGH. (codex-3 flagged this as intended remaining scope; tracking it so §14 isn't called done.)
  > - 🟡 MEDIUM — **Opt-in posture.** `requireAdmin()`'s permission is optional, so a future action added without one silently bypasses roles. Consider default-deny (make the permission required) or a test asserting every admin action passes a permission, so coverage can't regress.
  > - 🟢 Record-level authorization (staff/photographer seeing only their own clients/bookings) remains pending — module-level only so far, as noted.
  >
  > **Status: `READY-FOR-PATCH`** (finish the enforcement sweep on the remaining modules — mechanical, one line each; default-deny is the durable follow-up)

  > **PATCHER · Codex-3 [06-09-26]:** READY-FOR-CONFIRM for the remaining §14 module-level permission sweep. Replaced the bare mutation guards in the remaining audited modules with explicit permissions: forms actions now require `forms:manage`, testimonials require `testimonials:manage`, communications/template/clone/restore/suppression actions require `communications:manage`, portfolio gallery/proofing/access actions require `portfolio:manage`, media upload/update/archive/restore/hero actions require `media:manage`, and appointment status/detail/reschedule actions require `appointments:manage`.
  >
  > This closes the partial-enforcement finding for the named modules and also closes the email-builder clone/restore inheritance gap through the `communications:manage` guard. Durable follow-up remains default-deny coverage/tests and record-level ownership for staff/photographer scopes.
  >
  > Verification: targeted scan confirms no bare `await requireAdmin()` remains in `modules/forms/actions.ts`, `modules/testimonials/actions.ts`, `modules/communications/actions.ts`, `modules/portfolio/actions.ts`, `modules/media/actions.ts`, or `modules/appointments/actions.ts`; tree-wide `npx tsc --noEmit --pretty false` passed and full `npm run lint` passed. Latest `npm run build` is blocked by unrelated active §1 tenancy work in `lib/email/subscriptions.ts:88` after `EmailSubscriber.unsubscribeToken` became site-scoped; not a §14 permission-sweep defect.
  >
  > **Status: `READY-FOR-CONFIRM`**

  > **ENGINEER · Copilot-2 [06-10-26]:** READY-FOR-AUDIT for the remaining §14 default-deny + own-data authz pass. Split authenticated-admin access from explicit permission checks in `lib/auth.ts` (`requireAuthenticatedAdmin()` for the shell only; `requireAdmin(permission)` everywhere else), then added shared query-scope helpers that fail closed for STAFF/PHOTOGRAPHER by matching the signed-in admin email to `StaffMember` rows and constraining bookings/clients at the DB query layer. Applied those scopes across appointments + clients list/detail/action surfaces (`modules/appointments/{page.tsx,detail/page.tsx,actions.ts}`, `modules/clients/{page.tsx,detail/page.tsx,actions.ts}`) so own-data enforcement happens in the server query, not just the UI.
  >
  > Also finished the default-deny sweep on the remaining implicit module entry points: analytics/content/scheduling now use explicit `analytics:read` / `analytics:manage`, `content:manage`, and `scheduling:manage` permissions; all remaining admin pages now require an explicit module permission on direct URL access; the admin shell sidebar now hides modules unless the current role has one of the manifest-declared permissions; and the module manifests were aligned to the real auth permission names so sidebar visibility and server enforcement use the same permission vocabulary.
  >
  > Verification: targeted `npx eslint` over the touched auth/sidebar/module/page/action files passed. Full `npx tsc --noEmit --pretty false` is currently blocked by unrelated pre-existing analytics/settings schema drift (`analyticsRetentionDays`, GA4/meta/search-console fields missing from the generated `SiteSettings` type), not by this §14 access-control pass.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-10-26]:** Well-built core. The auth refactor is right: `requireAuthenticatedAdmin()` is shell-only, `requireAdmin(permission)` carries a now-required permission and `redirect()`s on failure (which aborts the server action) (`lib/auth.ts:162-172`). The scope helpers fail **closed** — `getScopedStaffIds` returns `[]` for a STAFF/PHOTOGRAPHER with no matching `StaffMember`, and `{ staffId: { in: [] } }` matches zero rows (`:174-209`). Record-level enforcement is genuinely at the query layer, not the UI: appointments detail GET + all three mutations re-fetch through `getAccessibleBookingWhere` (and `updateBookingDetailAction` scopes the `updateMany` itself) (`modules/appointments/detail/page.tsx:36`, `actions.ts:26,43-59,71`); clients detail GET + every mutation (note/file add+delete, update, **merge** — both survivor & duplicate dual-scoped) go through `getAccessibleClientWhere` (`modules/clients/detail/page.tsx:67`, `actions.ts:277-279,305,333-336,378,410-413,604-617`); appointments list is scoped too (`page.tsx:35,46,48`). Findings, priority order:
  > - 🟠 HIGH — **Record-level authz only covers bookings + clients, but the constrained roles hold un-scoped permissions over other client data.** Per the role matrix (`lib/admin-permissions.ts:29-30`), STAFF also has `forms:manage` + `testimonials:manage` and PHOTOGRAPHER has `portfolio:manage` + `media:manage` — none of which are own-data scoped. So a STAFF user reads/manages **every** form submission and testimonial in the business (client PII for other staff's clients), and a PHOTOGRAPHER manages **every** gallery/media asset. If §14's "own data" intent stops at bookings/clients this is acceptable — but then it should be stated; if not, these surfaces leak at the record level. Decide scope and either constrain or document.
  > - 🟠 HIGH — **PHOTOGRAPHER own-data is mismodeled.** `usesOwnDataScope` includes PHOTOGRAPHER, but the client scope keys on `bookings.some.staffId` (`lib/auth.ts:222-231`). A photographer's relationship to a client is via `PortfolioGalleryAccess.clientId`/proofing, not bookings, so a photographer who isn't also booking-staff sees **zero** clients (dead `clients:manage`) while their actual primary resource — galleries/media — has no record scope at all (prior finding). Net: the one role whose record scope was added is the one it fits least. Confirm the data model supports per-photographer ownership; if multi-photographer, scope galleries/media; if single-photographer, drop PHOTOGRAPHER from `usesOwnDataScope`.
  > - 🟡 MEDIUM — **Default-deny is convention-enforced, not mechanically.** Splitting `requireAuthenticatedAdmin` (no perm) from `requireAdmin(permission)` is good, but `requireAuthenticatedAdmin()` is still importable and a future mutation could use it and silently bypass roles — exactly the regression the prior §14 audit (line ~1017) asked to guard with "a test asserting every admin action passes a permission." No such test/lint rule was added. Add a coverage test or ESLint rule so default-deny can't regress.
  > - 🟢 LOW — **`updateClientAction`'s `updateMany` re-scopes by `{ id, siteId }` only, not the accessible-where** (`modules/clients/actions.ts:288-289`), unlike `updateBookingDetailAction` which passes the scoped where into the mutation. The preceding scoped find authorizes it so there's no live bypass, but match the appointments pattern for defense-in-depth.
  > - 🟢 LOW — Vestigial `if (permission && ...)` guard in `requireAdmin` (`lib/auth.ts:170`) — `permission` is now always supplied; the short-circuit is dead. Trivial cleanup.
  >
  > Sidebar (not a §14 defect): `modules/clients/actions.ts` hardcodes `DEFAULT_SITE_ID` (e.g. `:253,289,496`) while `clients/detail/page.tsx` uses request-resolved `settings.siteId` — that inconsistency is §1 tenancy work; flagged so it isn't lost. Build: I independently confirmed the tree-wide `tsc` failures are isolated to §13 analytics files (`lib/analytics/*`, `modules/settings/page.tsx`), so copilot-2's "not from this pass" claim holds; a clean tree-wide build can't be re-verified until §13's `SiteSettings` migration lands.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → straight to PATCHER; the two 🟠 are scope-intent decisions — may need @user input before patching)
  >
  > **🧭 DIRECTION · @user via Claude [06-10-26]:** Decision on the two 🟠: **make data-access scope modular and end-user-configurable**, and support **both single-person and team** sites. This reclassifies 🟠#1/#2 from defects in this chunk into the requirement for a new chunk (§14 chunk-4, below): chunk-3's fail-closed query-layer scoping **stands as the foundation** (single-person already works — OWNER is unscoped and sees all). The 🟡 (default-deny regression test) and 🟢 (re-scope `updateClient` mutation; drop vestigial `permission &&`) fold into chunk-4. Chunk-3 itself needs no further patch — its findings live on in chunk-4's scope.

### 14b. Admin Roles — chunk 4: configurable, modular data-access scope

Make "who can see which records" a site-owner setting, not hardcoded, so the same install serves a solo operator or a multi-person team.

- Per-role (and ideally per-staff-member) **data scope** the owner configures per module: `ALL` vs `OWN` (e.g., STAFF→appointments OWN, clients OWN; PHOTOGRAPHER→galleries OWN). Sensible presets for "single-person" (everything ALL) and "team" (constrained roles default to OWN).
- **Modular ownership mapping:** each module manifest declares whether it supports own-data scoping and how a record maps to an owner (booking→staffId, gallery→photographer, etc.), so the scope engine is generic and reused — not per-module hardcoding. (Reuses the §1 manifest concept.)
- Generalize `getAccessible*Where` into a policy-driven helper that reads the configured scope + the module's ownership mapping; extend coverage beyond bookings/clients to forms, testimonials, galleries, and media.
- Fix PHOTOGRAPHER ownership to key on gallery/proofing ownership (`PortfolioGalleryAccess`/gallery owner), not `booking.staffId`, when that role is scoped.
- Carry over from chunk-3: add a regression test/lint rule asserting every admin mutation passes an explicit permission (default-deny can't silently regress); pass the accessible-where into the `updateClient` mutation for defense-in-depth.

  > **🛠 ENGINEER · showrunner-worker-1 [06-13-26]:** §14b chunk-4 — configurable, modular data-access scope. Committed `268e042`. Generic manifest-driven scope engine `lib/data-scope.ts` (per-role/per-module ALL vs OWN, single-person/team presets, staff-field + client-link ownership, PHOTOGRAPHER client ownership via owned galleries/access not `booking.staffId`), `SiteSettings.dataScopeConfig` + migration, owner-configurable scope matrix UI/action in settings, `getAccessibleModuleWhere` generalization + per-module helpers wired across clients/appointments/forms/testimonials/portfolio/media read+mutation+export paths, `updateClientAction` re-scoped, and `scripts/check-admin-permissions.ts` (`npm run auth:check`) default-deny regression scan.
  >
  > **🔍 AUDIT · showrunner-boss [06-13-26 05:20 CDT]:** Audited engine + manifests + wiring end-to-end. Strong, genuinely modular work — both original §14 findings are closed. Verified: engine fail-closed (empty owner list → `{ in: [] }` matches nothing; `lib/data-scope.ts:154-166`); OWNER/ADMIN (not in `scopableRoles`) → ALL, scopable roles default OWN (`:95-101`); PHOTOGRAPHER re-keyed off `booking.staffId` to gallery ownership via owned-galleries + `PortfolioGalleryAccess` (`getOwnedClientIds:119-147`); manifests declare correct ownerKind/ownerField (appointments staff-field/staffId, clients client-link/id, forms+testimonials client-link/clientId, portfolio staff-field/photographerId, media staff-field/uploadedByStaffId); helpers are actually WIRED across all six modules' list + detail (IDOR) + mutation + export paths (grep-confirmed clients/appointments/portfolio/media/testimonials/forms pages+actions+export), so "STAFF sees all submissions / PHOTOGRAPHER manages all galleries" is fixed at the query layer; `auth:check` present. Findings:
  > - 🟠 HIGH — Ownership identity resolves by EMAIL string-match (`getOwnerStaffIds`: `StaffMember.email == AdminUser.email`, case-insensitive; `:104-111`), not a durable FK. The entire record-level model hinges on it: if `StaffMember.email` isn't unique-per-site, one admin can own another's records (over-exposure); if an admin's email diverges from their staff row, OWN-scoped users silently see nothing (lockout). Fix at root: add an explicit `AdminUser → StaffMember` link (FK) and key ownership on it, OR enforce a per-site unique `StaffMember.email` AND keep AdminUser/StaffMember email in sync on invite/edit. Verify the current uniqueness guarantee before shipping team mode.
  > - 🟡 MEDIUM — Ownership materializes ID arrays into `{ id|clientId: { in: [...] } }` (`getOwnerWhereFragment:163-165`). For an owner with many records the `in` list is unbounded → query-size/param limits + poor plans. Prefer relation-based filters (`{ bookings: { some: { staffId: { in: staffIds } } } }`, gallery-access `some`) so the join stays in the DB. Best product, not easiest.
  > - 🟢 LOW — OWN forms/testimonials key on `clientId`, so anonymous submissions (null clientId) are invisible to scoped STAFF (`getAccessibleFormSubmissionWhere:195-202`). Fail-closed, but confirm OWN roles don't need unassigned-lead visibility; if they do, route unlinked records by a different rule.
  > - 🟢 LOW — `getAccessibleModuleWhere` wraps every query in `AND:[siteWhere, extra, {}]` even in ALL mode (`:168-177`) — correct, just noisy.
  > - Note: record-level scope is opt-in per manifest; undeclared modules fall to ALL by design (correct for record-authz; chunk-3 function-level default-deny still gates them).
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → straight to PATCHER; the 🟠 ownership-identity fix is foundational — land it properly, no band-aid. worker-1 owns this surface → patches its own findings; the 🟢s are confirm-with-note unless worker-1 sees value.)
  >
  > **🔧 PATCHER · showrunner-worker-1 [06-13-26]:** Patch `1423de2`. Replaced email-string ownership with a durable `StaffMember.adminUserId` FK; migration `20260613054500` adds the column, backfills from the prior email convention, `UNIQUE(siteId,adminUserId)` + index + FK (`ON DELETE SET NULL`), and BEFORE/AFTER email-sync triggers on StaffMember/AdminUser; added `PortfolioGalleryAccess.client` relation + FK. Replaced materialized owned-client ids with relation filters; forms/testimonials declare `ownerRelationField:"client"`. prisma validate/generate, auth:check, eslint, tsc green.
  >
  > **✅ VALIDATOR · showrunner-boss [06-13-26 05:50 CDT]:** Confirmed in code — root fix, not a band-aid. 🟠 ownership now keys on the durable FK (`getOwnerStaffIds` → `where {siteId, adminUserId: user.id}`, `lib/data-scope.ts:104-111`); the `UNIQUE(siteId,adminUserId)` index (migration `:14`) makes ambiguous ownership impossible at the DB level, FK is `ON DELETE SET NULL`. 🟡 owned-client resolution is now a relation filter — `bookings.some(staffId in)` OR `portfolioGalleryAccesses.some(gallery.photographerId in)` (`:119-130`), and forms/testimonials route through `{ client: <where> }` via `ownerRelationField` (`:146-151`); empty staff still fails closed `{ id:{ in:[] } }`. Email is now only the auto-link convention, enforced 1:1 by the unique index and kept synced by DB triggers (can't be bypassed by an app path). 🟢 forward (not blocking): two staff sharing an email in one site collide on the unique index; the sync triggers are now security-load-bearing (preserve across any schema squash); linkage is email-only with no manual link UI (an admin whose email matches no staff is OWN-locked-out — fail-closed, acceptable). This CONFIRM unblocks the remaining §1 module-action tenancy.
  >
  > **Status: `CONFIRMED`**

- Add booking email template settings, then graduate those settings into the shared template library/editor instead of one-off textareas.

  > **🛠 ENGINEER · 06-09-26:** Built the booking email template settings foundation inside the Communications module. Booking-related system templates now have guarded subject, preview, text body, HTML body, and sender controls while keeping system template keys/status locked (`modules/communications/page.tsx`, `modules/communications/actions.ts`, `modules/communications/booking-templates.ts`). Token extraction is shared through `lib/email/render.ts`, and the Communications manifest now advertises booking template settings as live while leaving the broader visual template editor/library as future work. Verification: `npm run lint`, `npx tsc --noEmit`, and `npm run build` passed. Browser route check was attempted but blocked by the local database server being unavailable at `127.0.0.1:55432`.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** Solid foundation — correctly reuses the shared `parseForm`+`?error=` redirect, locks system template `key`/status, validates the sender identity belongs to the site, and reuses the shared `extractEmailTemplateTokens`/token pattern from `lib/email/render.ts` (no fork) so the used⊆allowed token check matches the renderer exactly. Findings, priority order:
  > - 🟠 HIGH — **Raw `htmlBody` is stored and sent unsanitized.** `renderEmailTemplate` escapes only token *values*, never the `htmlBody` source (`lib/email/render.ts:53-70`); `updateBookingTemplateSettingsAction` writes `input.htmlBody` with only `optionalStoredText` trim — no sanitization, scheme allowlist, or well-formedness check (`modules/communications/actions.ts:220`). Admin-authored so not a *public* XSS today, but it (a) violates the §10 / Quality-Gate "restrict or sanitize raw HTML blocks" rule, and (b) becomes a stored-XSS / email-content-injection vector the moment §14 adds non-owner admin roles (staff/accountant/etc.) that still clear `requireAdmin()`. Secondary: a malformed `htmlBody` silently breaks every send of that booking email — the preview/test-send (`modules/communications/page.tsx:377,386`) is a separate, optional surface, not a mandatory gate before save. Fix properly: sanitize HTML against an allowlist (and/or restrict `htmlBody` editing to the owner role + validate it parses), not a band-aid.
  > - 🟡 MEDIUM — **`body` and `textBody` are written to the same value**, leaving `body` a shadow column (`actions.ts:218-219`). The renderer reads `textBody || body` (`render.ts:64`), so for booking templates `body` is dead-but-duplicated and can desync if any other path treats `body` as canonical. Pick `textBody` as the single source of truth and stop writing `body` (or document `body` as render-fallback only).
  > - 🟡 MEDIUM — **Editing the body never reconciles `requiredTokens`.** The action validates used⊆allowed but never recomputes the required set (`actions.ts:199-211`), while the send-time guard still demands the seeded `requiredTokens` (`render.ts:58-62`). Harmless while the event always supplies those tokens, but `requiredTokens` no longer reflects the template body. Decide intent: treat `requiredTokens` as the immutable event contract (document it) or recompute it from the saved body.
  > - 🟢 LOW — Sender identity is checked for existence but not for verified/active state (`actions.ts:188-197`); a draft/unverified identity can be attached.
  >
  > **Status: `READY-FOR-PATCH`** (no reviewer in this rotation → straight to PATCHER)
  >
  > **🔧 PATCHER · Codex [06-09-26]:** Applied the booking email template settings fixes.
  > - Added `sanitize-html` with a shared email allowlist sanitizer and wired `renderEmailTemplate` to sanitize rendered HTML before queueing sends (`lib/email/sanitize.ts`, `lib/email/render.ts`). Booking template saves now persist sanitized `htmlBody`.
  > - Made `textBody` the booking template source of truth by no longer writing the legacy `body` fallback in `updateBookingTemplateSettingsAction`.
  > - Treated `requiredTokens` as the immutable booking event contract: saves now reject templates that omit required booking tokens, while still allowing only the seeded required/optional token set.
  > - Restricted booking template sender assignment to verified sender identities with verified sending-domain status when a domain is attached, and the UI only offers verified senders.
  > - Verification: `npm run lint` passed with unrelated existing warnings in portfolio/settings files; sanitizer smoke check passed. `npx tsc --noEmit` and `npm run build` are blocked by unrelated `modules/portfolio/actions.ts:288` type error from the active portfolio chunk.
  >
  > **Status: `READY-FOR-CONFIRM`**
  >
  > **✅ VALIDATOR · Claude [06-09-26]:** All four findings confirmed fixed in code.
  > - 🟠 HIGH — New `lib/email/sanitize.ts` runs `sanitize-html` with an email-appropriate allowlist: tables/structural tags, inline `style` via per-property allowlist, schemes limited to http/https/mailto/tel on href/src, `url(`/`expression(`/`javascript:` blocked in CSS, protocol-relative disabled, and `rel="noopener noreferrer"` forced on links (`lib/email/sanitize.ts:3-97`). Critically it runs at **send time** after token substitution — `renderEmailTemplate` returns `sanitizeEmailHtml(renderHtml(htmlSource, tokens))` (`lib/email/render.ts:71`) — and again on save (`modules/communications/actions.ts:217,250`), so both stored and rendered HTML are sanitized (defense in depth). A save whose HTML sanitizes to empty is rejected (`actions.ts:218-220`). Followed the maintained-sanitizer steer; `sanitize-html` + `@types/sanitize-html` are in `package.json:37,46`.
  > - 🟡 MEDIUM — `body` is no longer written; the update persists only `subject/previewText/textBody/htmlBody/senderIdentityId` (`actions.ts:246-252`), making `textBody` authoritative (`render.ts:65` keeps `body` as a legacy fallback for other template types).
  > - 🟡 MEDIUM — `requiredTokens` is now treated as the immutable event contract: saves reject a template that omits any required token (`actions.ts:237-242`) in addition to rejecting unsupported tokens (`:231-235`), and token extraction reads the sanitized HTML so the check reflects what actually sends (`:228-229`).
  > - 🟢 LOW — Sender assignment now requires `isVerified` and a VERIFIED sending domain when one is attached (`actions.ts:196-215`), with both imports present (`EmailSendingDomainStatus` `:4`, `sanitizeEmailHtml` `:18`).
  >
  > **Build note (not a booking-template defect):** I could not get a clean end-to-end `tsc`/`build` because `modules/portfolio/actions.ts:289` (`confirmStatuses.includes(input.status)`) in codex's in-flight §4 proofing-round work is currently red. codex-3's changed files are isolated, import-checked, and lint-clean; the green-build confirmation is gated only on §4 landing. Flagged to @codex.
  >
  > **Status: `CONFIRMED`**
- Add test coverage for availability conflicts, blockouts, buffers, and slug generation.
- Add import/export for services, bookings, clients, and site settings.

### 15. Payments Platform — Multi-Gateway + Wallet Connect

**@user direction [06-13-26]:** Showrunner is deployed to end users who set up their own site (we're emulating a Shopify/Squarespace dashboard). Each SITE OWNER must connect their OWN payment accounts with push-button, log-into-your-account ease, and money settles to THEM — not to a platform account. Support the following, grouped by what they actually are (this grouping is the whole point — be clear, don't over-promise):

**Gateways (merchant accounts — money settles to the owner; these need per-site account connection):**
- **Stripe** — already integrated, but via a single platform key. Migrate to **Stripe Connect** so each site connects its own Stripe account (OAuth onboarding); checkout/refunds/webhooks then run against the connected account.
- **Square** — OAuth "Connect" flow → store the merchant's access token (encrypted); take payments via Square Checkout / Web Payments SDK.
- **PayPal** — onboard sellers with a sign-up button via **Partner Referrals** ("Connected Path"); charge via Orders API v2.

**Wallets / payment methods (ride ON TOP of a connected gateway — NOT separate accounts, no separate login):**
- **Apple Pay** — wallet button; requires domain verification + an underlying gateway (Stripe/Square).
- **Google Pay** — wallet button that tokenizes through the connected gateway.
- **Cash App Pay** — offered THROUGH Square (or Stripe), not a standalone merchant gateway; enable as a method on the connected gateway.
- **Buy-now-pay-later / "pay in 4" (Klarna or Affirm)** — easiest path is enabling them as Stripe payment-method types on Stripe Checkout (no separate integration or merchant account). Pick whichever is the lower lift in Stripe; treat as a method on the Stripe gateway.

Only the gateways need "connect your account" onboarding; the wallets and BNPL are checkout options enabled on whichever gateway is connected. Do not present them as standalone account connections.

**Owner control — every method is individually toggleable [@user 06-13-26]:** the site owner picks exactly which payment options appear at checkout, turning each gateway/wallet/BNPL method on or off independently. Public checkout renders ONLY the methods that are both connected (gateway) / available and explicitly enabled by the owner. Sensible defaults, but the owner has the final on/off switch per method.

**Architecture (modular, reuse-first — do NOT fork checkout per provider):**
- **`PaymentGateway` adapter interface** generalizing the existing `lib/commerce/stripe.ts` + `PaymentProvider` enum: `connect/onboard`, `createCheckoutSession`, `verifyWebhook`, `refund`, `supportedWallets`. Every existing call site (commerce cart/order checkout, §11 billing accept/pay) routes through the adapter, so adding a gateway is a new adapter — never a new checkout path.
- **Per-site connected-credential storage**, encrypted at rest, keyed by site — ties directly into §1 tenancy (the request-resolved site selects the connected gateway). No shared platform key in the multi-tenant path.
- **One-click onboarding UI** in admin settings: a "Connect [Provider]" button per gateway that runs the OAuth/Partner-Referrals flow and returns connected/verified status. Wallet toggles appear only once a compatible gateway is connected (surface Apple Pay domain verification).
- **Per-site checkout-method selection**: the owner enables which connected gateways/wallets appear at checkout; public checkout renders only connected + enabled methods.

**Suggested build chunks (each → READY-FOR-AUDIT):**
1. `PaymentGateway` adapter interface + refactor existing Stripe behind it (no behavior change) + per-site encrypted credential model/migration. → foundation.
2. Stripe single-key → **Stripe Connect** per-site onboarding end-to-end (onboard button, connected-account checkout, webhook on connected account, refund).
3. **Square** gateway adapter + OAuth connect button.
4. **PayPal** gateway adapter + Partner Referrals onboarding.
5. **Wallet + BNPL layer**: Apple Pay (domain verification) + Google Pay + Cash App Pay + Klarna/Affirm (via Stripe payment-method types) as methods on connected gateways, with the per-method on/off checkout-method selection UI.

PCI posture stays SAQ-A: hosted/tokenized collection only, no raw card data stored — same constraint as the current Stripe integration.

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15 chunk-1 foundation (uncommitted — see commit ruling). `PaymentGateway` contract `lib/payments/types.ts`; facade/registry `lib/payments/{registry,checkout,webhooks}.ts`; existing Stripe refactored behind `stripePaymentGateway` in `lib/commerce/stripe.ts` (old exports preserved, adapter delegates) with checkout/webhook entry points (`app/cart/actions.ts`, `app/billing/[token]/actions.ts`, `app/api/webhooks/stripe/route.ts`) routed through the facade; per-site encrypted credential foundation — `PaymentGatewayCredential` model + `PaymentGatewayConnectionStatus` + `PAYPAL` enum, migration `20260613060000`, `lib/payments/credentials.ts` (AES-256-GCM). Foundation only — Stripe stays single-key until chunk-2. tsc/lint/build green.
>
> **🔍 AUDIT · showrunner-boss [06-13-26 06:00 CDT]:** Strong foundation. Verified the security-critical paths: credential encryption is AES-256-GCM with a 32-byte sha256 key, random 12-byte IV per op, auth tag stored + verified on decrypt, versioned `v1:iv:tag:ct` format, prod fail-closed if no secret (`lib/payments/credentials.ts:24-64`); the Stripe refactor is additive (existing `createStripeCheckoutSession*`/`handleStripeWebhookEvent` exports preserved, `stripePaymentGateway` at `stripe.ts:833` delegates); and the webhook signature check is PRESERVED through the facade — `constructPaymentWebhookEvent` → `gateway.verifyWebhook` runs before `handleWebhookEvent`, raw body read for signature, errors → 400 (`app/api/webhooks/stripe/route.ts`, `lib/payments/webhooks.ts`). Per-site credential model keyed `siteId_provider`. Findings:
> - 🟡 MEDIUM — Credential key is `PAYMENT_CREDENTIAL_ENCRYPTION_KEY || AUTH_SECRET` with only a non-empty prod check (`:24-31`); no strength guard, unlike `mediaSigningSecret`'s `isWeakProductionSecret`. A weak/short key would pass in prod. Add the same strength check (and consider HKDF/salt over raw sha256, though sha256 is fine for a high-entropy key).
> - 🟢 LOW — `unknown` at the facade boundary (`handleWebhookEvent(event: unknown)`, `checkout session.order?: unknown`) — acceptable for a multi-gateway seam; tighten as providers land.
>
> **Status: `READY-FOR-PATCH`** (the 🟡 secret-strength guard; worker-4 owns the surface. COMMIT is sequenced behind §11 — see ruling — because `lib/payments/*` depends on the `stripe.ts` adapter export and `stripe.ts`/`app/billing/[token]/actions.ts` are shared with worker-3's in-flight §11 overpay patch.)
>
> **🔧 PATCHER · showrunner-worker-4 [06-13-26]:** Patched the 🟡 in `lib/payments/credentials.ts` — `credentialSecret` now applies the same `isWeakProductionSecret` predicate as `mediaSigningSecret` (rejects empty/<32/replace-with/local-dev/change-me) in production; AES-256-GCM unchanged. tsc/lint/build green. Commit HELD behind §11 per sequencing.
>
> **✅ VALIDATOR · showrunner-boss [06-13-26 06:05 CDT]:** Confirmed in code — `credentialSecret` (`lib/payments/credentials.ts:29-36`) throws in production when the key is empty OR weak via `isWeakProductionSecret` (`:24-27`, identical to the media-signing guard); non-prod keeps the local-dev fallback; encryption path unchanged. Finding closed. NOTE: this CONFIRM is code-verified; the §15 chunk-1 COMMIT is intentionally sequenced AFTER worker-3's §11 lands (shared `stripe.ts` / billing actions) — commit ref to be recorded then.
>
> **Status: `CONFIRMED` (committed `1db81e5`)**

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15 chunk-2 Stripe Connect. Committed `4e6262e`. Stripe Connect OAuth Standard onboarding (signed/expiring/site-bound state, `STRIPE_CONNECT_CLIENT_ID` + optional redirect URI, admin start/callback routes, code exchange, encrypted per-site connected-account credential); Settings → Payments connect/reconnect panel with status; checkout (order + §11 billing) passes `stripeAccount` request options when the site has a connected account, single-key fallback otherwise; webhook stays verify-before-handle and records `event.account`; refund support via the gateway adapter + `lib/payments/refunds.ts`.
>
> **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 06:45 CDT]:** Audited the security-critical paths; strong, confirming directly (only 🟢 notes). OAuth state is CSRF-safe — signed HMAC-SHA256, 10-min TTL, nonce, site-bound, and the siteId is derived FROM the signed state not a forgeable param (`lib/payments/stripe-connect.ts:48-95`), so an attacker can't connect their Stripe account to a victim site; `completeStripeConnectOnboarding` adds an `expectedSiteId` cross-check (`:92-96`). Both routes admin-gated — `requireAdmin("settings:update")` on start AND callback (`app/api/payments/stripe/connect/{start,callback}/route.ts:13`), callback passes the current site as `expectedSiteId`. Per-site account isolation at checkout: `getStripeConnectedAccountId(siteId)` returns the account only when `status===CONNECTED` (`lib/commerce/stripe.ts:56-61`) → `{stripeAccount}` per site, single-key fallback; money settles to the right owner, no cross-tenant leak. Credentials use the audited AES-256-GCM store; webhook verify-before-handle preserved + `event.account` traceability. Findings: 🟢 the new `refundPaymentGatewayPayment` facade requires `siteId` and delegates site-scoping to `gateway.refund`, but is NOT yet wired to an admin action (plumbing only) — when a refund UI lands, gate it (`billing:manage`/`orders:manage`) + pass the resolved site. 🟢 `refresh_token` stored encrypted but no refresh logic yet (Standard OAuth tokens long-lived; defer). 🟢 `STRIPE_CONNECT_CLIENT_ID` is deploy-config.
>
> **Status: `CONFIRMED`**

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15 chunk-5 wallet + BNPL methods. Committed `1bf9478`. `lib/payments/methods.ts` defines the per-site Stripe checkout-method set (Card, Apple Pay, Google Pay, Cash App Pay, Klarna, Affirm) with typed normalization, sensible defaults, and per-site credential-metadata storage; Settings → Payments shows per-method on/off checkboxes once Stripe is connected with a separate save action (`updateStripePaymentMethodsAction`); connected checkout (order + §11 billing) passes `payment_method_types` resolved from owner-enabled methods; Apple/Google Pay are tracked as card-backed wallet preferences (hosted Checkout surfaces them via `card`); Apple Pay enablement attempts Stripe domain registration on the connected account.
>
> **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 11:05 CDT]:** Audited the money/authz paths; sound, confirming directly. Owner control is correctly gated and isolated: `updateStripePaymentMethodsAction` is `requireAdmin("settings:update")`-gated and writes a `settings.payment_methods.updated` audit entry (`modules/settings/actions.ts:94-119`); settings + resolution are per-site and only apply once `status===CONNECTED && externalAccountId` (`lib/payments/methods.ts:121-135,205-238`); checkout reads per `order.siteId` / `document.siteId` so method selection is tenancy-scoped (`lib/commerce/stripe.ts:207,333`). Mapping is correct — card-backed wallets fold into `card`, cashapp/klarna/affirm become independent `payment_method_types`, and a not-connected site returns `payment_method_types: undefined` (Stripe default), never a forged set (`methods.ts:240-262`). "Keep at least one enabled" guard holds (`:210`) and metadata writes preserve sibling keys (`:217-233`, `:142-156`). UI renders toggles only when `stripeConnected` (`modules/settings/page.tsx:72,84-108`). Findings:
> - 🟡 MEDIUM — Apple Pay domain registration derives the domain from the platform `NEXT_PUBLIC_APP_URL` (`appHostname()`, `methods.ts:88-96,165`), NOT the site's own domain. Under the §15/§1 deploy-to-users model each owner serves checkout on their OWN domain, where Apple Pay would then fail to verify against the platform host. Correct while all sites share the platform domain; **must key off the per-site custom domain when that lands** — recorded as a hard dependency, not a bandage. (Code-clean confirm; this is forward infra, not a defect in the chunk as scoped.)
> - 🟢 LOW — Klarna/Affirm/Cash App carry Stripe currency/country eligibility limits; enabling an ineligible method makes `checkout.sessions.create` throw at runtime (owner's explicit toggle; Stripe returns a clear error). Consider surfacing eligibility later; low priority.
> - 🟢 LOW — `supportedWallets` sync records Apple/Google Pay for traceability even though they ride on `card` — accurate, no behavior risk.
>
> **Status: `CONFIRMED` (committed `1bf9478`)** — 🟡 Apple Pay domain → per-site-domain dependency tracked for the custom-domain milestone.

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15 chunk-3 Square gateway + OAuth Connect. Committed `9993024`. Square OAuth Connect (signed/expiring/site-bound state, admin-gated start/callback, token exchange, primary active-location lookup, encrypted per-site credential); `squarePaymentGateway` behind the `PaymentGateway` interface (hosted Payment Link checkout for orders + §11 billing, verified webhook, refund, supported wallets); Square webhook endpoint with HMAC verification over notification URL + raw body and a durable `SquareWebhookEvent` idempotency ledger (stale-PROCESSING reclaim + FAILED retry); per-site `SiteSettings.checkoutProvider` + Settings → Payments provider selector (Square unselectable until connected); checkout facade resolves the site provider before the registry (no new checkout path). PayPal held.
>
> **🔍 AUDIT · showrunner-boss [06-13-26 11:20 CDT]:** Deep money-path/OAuth audit; the security-critical paths are SOUND. OAuth state is CSRF-safe — HMAC-SHA256 signed, 10-min TTL, nonce, site-bound, siteId derived FROM the signed state, `timingSafeEqual` w/ length guard (`lib/payments/square-connect.ts:75-107`); `completeSquareConnectOnboarding` enforces `expectedSiteId === state.siteId` (`:162-166`) and both routes are `requireAdmin("settings:update")`-gated with the callback passing the current site (`connect/{start,callback}/route.ts:13,27-28`) — no victim-site connect. Webhook verify-before-handle is correct: HMAC-SHA256 over `notificationUrl + rawBody`, base64, `timingSafeEqual` w/ length guard (`square.ts:429-441`) — Square's exact spec; signature key is the platform key, notification URL is per-application (correct for Connect). Settlement is guarded: only on `COMPLETED`, and it **reconciles paid amount AND currency against the server-side `Payment`/`BillingPayment` record before marking PAID, throwing on mismatch** (`:595-602,624-631`) — no forged/underpaid settlement. Checkout is per-site/server-priced (site credential + own token via `squareFetch(siteId,…)`, amount from `order.totalCents`, site's own `locationId`; `:199-260,116-122`); refund is site-scoped (lookup requires matching `siteId`, `:740-746,784-791`); idempotency ledger mirrors the Stripe stale/FAILED pattern (`:476-519`); provider selector is admin-gated and blocks selecting Square until CONNECTED (`modules/settings/actions.ts:134-146`). Credentials use the audited AES-256-GCM store; secret-strength guard present (`square-connect.ts:53-65`). Findings:
> - 🟡 MEDIUM — **No connected-status check at provider RESOLUTION → owner can break public checkout.** `resolvePaymentProviderForSite` (`lib/payments/registry.ts:14-23`) returns the stored `checkoutProvider` with no verification it's still connected. The selector guards selection-time connectivity, but if an owner selects Square then later disconnects it (or the credential lapses), public checkout calls the Square adapter, which throws `Connect Square before creating Square checkout` (`square.ts:202`) — a customer-facing checkout outage with **no fallback** to a connected gateway. Stripe masks this via its single-key fallback; Square has none, so the break is real. Fix properly (not a bandage): resolve to a still-connected gateway (or block disconnecting the active provider / surface an explicit admin "payments unavailable" state). 
> - 🟢 LOW — `claimSquareEvent` eventId falls back to `crypto.randomUUID()` when both `event_id` and `data.id` are absent (`square.ts:477`), which would bypass idempotency; Square always sends `event_id`, so defensive only.
> - 🟢 LOW — settlement doesn't assert `event.merchant_id` matches the resolved payment's site credential; the platform-key HMAC + globally-unique Square payment-id binding already prevent cross-tenant settlement, so this is defense-in-depth only.
> - 🟢 LOW — a permanent amount/currency mismatch throws → event FAILED → reclaimable → retried indefinitely (poison event); mirrors the Stripe pattern, low impact.
> - 🟢 NOTE — Square envs + webhook dashboard registration are deploy-config.
>
> **Status: `READY-FOR-PATCH`** (the 🟡 resolution-time connected-gateway fallback; worker-4 owns the payments surface. PayPal stays held until this clears.)
>
> **🔧 PATCHER · showrunner-worker-4 [06-13-26]:** Committed `080ec68`. `resolvePaymentProviderForSite` now re-checks Square connection state (requires `CONNECTED` + a merchant id) before returning Square. If the stored site provider is Square but Square is no longer connected, public checkout resolution falls back to Stripe instead of throwing from the Square adapter; an explicit Square request for a not-connected site fails early with a clear `Square checkout is not connected for this site.` Settings → Payments derives an effective active provider and warns the owner that sessions use Stripe until Square is reconnected.
>
> **✅ VALIDATOR · showrunner-boss [06-13-26 11:35 CDT]:** Confirmed in code — the 🟡 is closed at the resolution layer. `resolvePaymentProviderForSite` (`lib/payments/registry.ts:14-42`) computes `selectedProvider` (explicit › stored › Stripe), and when it is Square it re-queries the credential and only returns Square when `status === CONNECTED && merchantId.trim()` (`:35-38`); otherwise an **explicit** Square request throws the clear error (`:39`) while a **stored**-provider resolution **falls back to Stripe** (`:41`) so public checkout degrades gracefully instead of throwing the customer-facing `Connect Square…`. Selection-time gate (chunk-3) plus this resolution-time gate now both hold. 🟢 fallback targets Stripe unconditionally — fine since Stripe carries its own single-key/connected fallback; if a site has neither, Stripe's own path surfaces the error (pre-existing, unchanged). Finding closed.
>
> **Status: `CONFIRMED` (committed `080ec68`)**

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15 chunk-4 PayPal gateway + Partner Referrals onboarding. Committed `c5bbcb1`. Partner Referrals / Connected Path onboarding (signed/expiring/site-bound state, admin-gated start/callback, `expectedSiteId` cross-check, encrypted per-site merchant credential); `paypalPaymentGateway` behind the `PaymentGateway` interface (Orders API v2 approve-link checkout for orders + §11 billing, connected `payee.merchant_id`, PayPal auth-assertion, refund, settlement); PayPal webhook endpoint verify-before-handle via PayPal's signature-verification API + durable `PayPalWebhookEvent` idempotency ledger (stale/FAILED parity); capture handling (`CHECKOUT.ORDER.APPROVED` → server-side capture, `PAYMENT.CAPTURE.COMPLETED` → amount+currency reconcile → PAID); provider selector gates PayPal until CONNECTED + the resolver falls back to Stripe for a disconnected stored PayPal/Square; Stripe/Square webhook routes now await the async verify facade (behavior unchanged).
>
> **🔍 AUDIT · showrunner-boss [06-13-26 11:55 CDT]:** Deep money-path/OAuth audit; the security-critical paths are SOUND. OAuth state is CSRF-safe + site-bound — HMAC-SHA256 signed, 10-min TTL, `trackingId` nonce, siteId from the signed state, `timingSafeEqual` w/ length guard (`lib/payments/paypal-connect.ts:74-111`); `completePayPalConnectOnboarding` enforces `expectedSiteId === state.siteId` (`:222-225`); both routes `requireAdmin("settings:update")`-gated with the callback passing the current site (`paypal/connect/{start,callback}/route.ts:13,26-31`). Webhook verify-before-handle is REAL: `constructPayPalWebhookEvent` calls PayPal's `/v1/notifications/verify-webhook-signature` with all transmission headers + configured `webhook_id` and **throws unless `verification_status === "SUCCESS"`** before returning the event (`paypal.ts:396-415`); the async facade threads `headers` through and Stripe/Square just await it (`lib/payments/webhooks.ts:4-15`, backward-compatible). Settlement is guarded: capture only on `COMPLETED`, **amount AND currency reconciled against the server-side payment before PAID, throwing on mismatch** (`:545-589`); capture is server-side via the merchant auth-assertion (`:601-631`), not client-trusted. Checkout sets `payee.merchant_id` to the site's connected merchant, server-priced (`:185-186,225-260`); refund is site-scoped (lookup requires matching `siteId`, executes against the site merchant; `:732-790`); idempotency ledger mirrors Stripe/Square (`:438-475`); provider selector + the resolver now gate AND fall back for PayPal too (`lib/payments/registry.ts:16-43`). Credentials use the audited AES-256-GCM store; secret-strength guard present. The `alg:none` auth-assertion is PayPal's documented unsigned-JWT format for third-party calls, not a defect. Findings:
> - 🟡 MEDIUM — **Onboarding trusts the return-URL merchant id without server-side confirmation.** `completePayPalConnectOnboarding` reads `merchantIdInPayPal`/`merchant_id` from the redirect query params and stores it as the connected merchant, gated only on `permissionsGranted`/`consentStatus !== "false"` (`paypal-connect.ts:227-249`). PayPal's documented guidance is NOT to rely on return-URL params — confirm via the Partner Referrals merchant-integrations status API (using the signed `trackingId`) and verify `payments_receivable === true` + `primary_email_confirmed === true` before treating the seller as connected (or key off the `MERCHANT.ONBOARDING.COMPLETED` webhook). State is signed/site-bound so this is NOT a cross-tenant hole (the admin acts on their own site), but storing an unconfirmed merchant means checkout can later route to an account that can't actually receive payments. Fix properly: confirm merchant + receivable status server-side before storing CONNECTED.
> - 🟢 LOW — `claimPayPalEvent` eventId falls back to `crypto.randomUUID()` when `event.id` is absent (idempotency bypass for an id-less event); PayPal always sends `id`, defensive only.
> - 🟢 LOW — settlement resolves the payment by capture/custom/order id (provider-scoped) without an explicit merchant_id match; API-verified webhook + globally-unique ids bound to one site's payment already prevent cross-tenant settlement — defense-in-depth only.
> - 🟢 NOTE — PayPal envs + webhook registration are deploy-config.
>
> **Status: `READY-FOR-PATCH`** (the 🟡 server-side merchant/receivable confirmation; worker-4 owns the payments surface.)
>
> **🔧 PATCHER · showrunner-worker-4 [06-13-26]:** Committed `3f57e17`. `completePayPalConnectOnboarding` no longer trusts the callback `merchantIdInPayPal`; after verifying the signed/site-bound state it queries PayPal server-side via `/v1/customer/partners/{partnerMerchantId}/merchant-integrations?tracking_id=…` (new `getMerchantIntegrationByTrackingId`), requires the integration to match the tracking id + include a merchant id + `payments_receivable === true` + `primary_email_confirmed === true` before storing CONNECTED; the redirect merchant id (if any) is demoted to a consistency check; verified flags/products are recorded in metadata. Added `PAYPAL_PARTNER_MERCHANT_ID`.
>
> **✅ VALIDATOR · showrunner-boss [06-13-26 12:05 CDT]:** Confirmed in code — the 🟡 is closed properly. The stored merchant id is now sourced from the server-verified integration (`integration.merchant_id`, `paypal-connect.ts:286-298`), NOT the return-URL param, which is reduced to a mismatch guard (`:280-284`). `getMerchantIntegrationByTrackingId` (`:239-262`) keys the lookup off the signed `trackingId` (trustworthy — from the verified state, not the URL), requires a merchant id, cross-checks `tracking_id` when present, and **throws unless `payments_receivable === true` AND `primary_email_confirmed === true`** (`:254-259`) before the credential is stored CONNECTED. So an onboarding that didn't actually complete / can't receive payments no longer registers a usable gateway, and a tampered return URL can't substitute a different merchant. Finding closed. 🟢 `PAYPAL_PARTNER_MERCHANT_ID` is deploy-config (status API needs the partner merchant id).
>
> **Status: `CONFIRMED` (committed `3f57e17`)** — §15 payments platform COMPLETE: Stripe Connect, Square, PayPal gateways + wallet/BNPL methods all confirmed.

> **🛠 ENGINEER · showrunner-worker-4 [06-13-26]:** §15/§11 refund admin action (wires the refund facade to a gated UI — the chunk-2 deferral). Committed `a09e5ac`. Durable `refundedCents` on `Payment`+`BillingPayment` (migration `20260613120500`); `refundCommercePaymentAction` (`orders:manage`) + `refundBillingPaymentAction` (`billing:manage`), site-scoped, PAID/AUTHORIZED-only, partial guard `0 < amount <= amountCents - refundedCents`, calls only `refundPaymentGatewayPayment`, records `refundedCents` + REFUNDED-when-full, audit-logs `order.payment_refunded`/`billing.payment_refunded` (actor + amount + before/after); admin refund forms on Products order payments + Billing payment history default to remaining balance.
>
> **🔍 AUDIT · showrunner-boss [06-13-26 12:30 CDT]:** Strong — gated (`orders:manage`/`billing:manage`), site-scoped payment lookup (no IDOR, `modules/products/actions.ts:514-520`), PAID/AUTHORIZED-only, partial guard correct, facade-only (provider passed through, no per-provider path), `refundedCents` clamped (`Math.min`), order→REFUNDED only when fully refunded, audit-logged with before/after. One finding:
> - 🟡 MEDIUM — **Refund guard is check-then-act, not atomic → concurrent over-refund.** The action reads `payment.refundedCents`, calls the gateway, then writes `refundedCents + amount` (`:528-549`). Two concurrent refunds of DIFFERENT amounts (e.g. $60 + $50 on a $100 payment) both read `refundedCents=0`, both pass `amount <= remaining`, and execute against different gateway idempotency keys (`refund_<pid>_<amount>` only dedups IDENTICAL amounts) → $110 refunded, financial loss. Same class as the §11 overpay race. Fix properly with the established reserve-then-call / serializable-guarded pattern: atomically reserve `refundedCents` under a conditional update (or Serializable tx re-reading remaining) BEFORE the gateway call, so concurrent requests can't both pass. Applies to BOTH refund actions. 🟢 single-admin happy path + double-click-same-amount are already safe (idempotency key).
>
> **Status: `READY-FOR-PATCH`** (the 🟡 atomic refund reservation; worker-4 owns payments/billing.)
>
> **🔧 PATCHER · showrunner-worker-4 [06-13-26]:** Committed `2678f67`. Commerce + billing refunds now atomically pre-reserve `refundedCents` via a conditional `updateMany` (guarded by id + site relation + paid/authorized status + `refundedCents <= amountCents - amount`) BEFORE the gateway call; a concurrent refund can only reserve if the balance is still sufficient, else it fails with a reload/retry message. Gateway failure rolls back the reservation; full-refund status/order transitions read fresh post-gateway DB state so cumulative partials still settle.
>
> **✅ VALIDATOR · showrunner-boss [06-13-26 12:40 CDT]:** Confirmed in code — the race is closed at the DB. The reservation `updateMany` (`modules/products/actions.ts:548-558`) gates on `refundedCents: { lte: amountCents - amount }` and applies `increment`, so the guard is re-evaluated atomically under the row lock: a concurrent $60+$50 on $100 → first reserves to 60, second's `lte: 50` sees 60 → `count=0` → throws (`:559-561`), no over-refund. Gateway failure decrements the reservation back (`rollbackCommerceRefundReservation`, `:507-519,570-577`); REFUNDED + order→REFUNDED are driven by the reloaded `refundedCents >= amountCents` (`:579-601`), so concurrent partials reaching full still settle. Billing action mirrors it. Finding closed. 🟢 residual: a crash between reserve and gateway leaves a phantom reservation (blocks re-refund of that slice) — fails SAFE toward not-refunding; a reconciliation sweep could release stuck reservations later.
>
> **Status: `CONFIRMED` (committed `2678f67`)** — refund admin action (all gateways, partial-refund ledger, concurrency-safe) complete.

> **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §2 calendar adapters chunk 1 — ICS feed + add-to-calendar. Committed `0bd49d2`. `CalendarFileAdapter`/`icsCalendarAdapter` in the scheduling boundary (native stays default); HMAC token-protected read-only routes `/api/calendar/feed.ics` (per-site + per-staff upcoming PENDING/CONFIRMED) and `/api/calendar/booking.ics` (single-booking download); tokens scoped by site/staff and site/booking, fail closed on invalid token / missing entity / scheduling disabled; UTC VEVENTs with escaped+folded iCalendar text and status mapping; admin shows absolute feed URLs; booking confirmation renders an Add-to-calendar link. No write path.
>
> **🔍 AUDIT + ✅ CONFIRMED · showrunner-boss [06-13-26 11:35 CDT]:** Audited the access-control + injection surface; sound, confirming directly. Tokens are unguessable + scoped — HMAC-SHA256 over `["calendar-feed","v1",siteId,staffId|"site"]` / `["booking-calendar","v1",siteId,bookingId]` with a server secret (`lib/scheduling/calendar.ts:48-74`), so a site token can't read a staff feed and a booking token binds to one (site,booking); verification is timing-safe via sha256+`timingSafeEqual` (`:52-58`). Both routes fail closed: feed requires `siteId`+valid token → 401, staff is scoped `where {id, siteId}`, and scheduling must be in `enabledModuleIds` → 404 (`app/api/calendar/feed.ics/route.ts:18-36`); the booking route derives siteId FROM the booking record and verifies the token against that real site (`booking.ics/route.ts:20-31`), so no cross-site access. Injection-safe: `icsText` escapes `\`, newlines, `;`, `,` (`calendar.ts:135-141`) so user-controlled name/notes can't break out of a VEVENT field; secret is fail-closed in production (`:39-46`); GET-only, `no-store`, bounded (1000 bookings / 366-day window). Findings (all 🟢): (1) `calendarSecret` lacks the `isWeakProductionSecret` strength guard the payments code uses — a weak non-empty `AUTH_SECRET` would pass; add for consistency. (2) `foldIcsLine` folds at 75 by JS string length, not octets — multibyte UTF-8 could exceed 75 octets/line; most clients tolerate it. (3) Multi-tenant forward-work: feeds are bearer-token URLs over a SINGLE global secret, so a leaked feed URL can't be revoked without rotating the secret for ALL sites — add a per-site feed salt so an owner can rotate independently.
>
> **Status: `CONFIRMED` (committed `0bd49d2`)**

> **🛠 ENGINEER · showrunner-worker-2 [06-13-26]:** §2 calendar chunk 2 — Google Calendar free/busy. Committed `2bb7b5b` (silent — surfaced via git log). Per-site Google OAuth connect (admin-gated start/callback, `expectedSiteId`), `SchedulingCalendarConnection` (SITE + per-STAFF), AES-256-GCM-encrypted access/refresh tokens with auto-refresh, `listGoogleBusyWindows` freeBusy query, and native availability now excludes busy windows + records connection status/lastError.
>
> **🔍 AUDIT · showrunner-boss [06-13-26 12:25 CDT]:** Audited the OAuth + token + availability seams; mostly sound. Callback is `requireAdmin("scheduling:manage")`-gated with `expectedSiteId` cross-check (`app/api/scheduling/google-calendar/connect/callback/route.ts:13,27-28`); tokens are AES-256-GCM (`v1:iv:tag:ct`, weak-secret guard) and `validAccessToken` auto-refreshes on expiry via the stored refresh token (`google-calendar.ts:79-106,323-344`), so routine expiry doesn't degrade; `listGoogleBusyWindows` scopes connections by `siteId` + SITE/STAFF owner (`:388-399`), a real busy window blocks only the overlapping slot, and errors persist `status=ERROR`+`lastError` to the connection (admin-visible). Finding:
> - 🟡 MEDIUM — **Fail-closed on a freebusy hard-error blocks ALL of that owner's public slots.** When the freeBusy call throws (revoked grant, Google outage, API error — not routine expiry, which auto-refreshes), it pushes a `google_calendar_unavailable` reason onto EVERY slot for that owner (`native.ts:330-340`, `google-calendar.ts:427-433`), so a public booker sees zero availability with no explanation. Treating "couldn't check" identically to "fully busy" couples all booking availability to Google's uptime/grant validity. Native bookings remain the source of truth and the admin already gets an ERROR signal — so on a freebusy ERROR, **degrade to native-computed availability (best-effort)** rather than hard-blocking (or make strict-vs-best-effort an owner choice). A real CONFLICT (busy window) must still block. 🟢 the diagnostic message is admin-facing only; ensure the degraded path surfaces the connection error in the admin.
>
> **Status: `READY-FOR-PATCH`** (the 🟡 fail-mode; worker-2 owns scheduling.)
>
> **🔧 PATCHER · showrunner-worker-2 [06-13-26]:** Committed `7157086`. Removed the `CalendarUnavailableScope`/`unavailable` result entirely: `listGoogleBusyWindows` still catches hard freeBusy/token errors and records the connection `ERROR`+`lastError`+`lastVerifiedAt`, but no longer emits a slot-blocking scope; `getSlotDiagnostics` now blocks only on actual Google busy windows, so an unavailable/revoked/erroring connection degrades to native availability. Dropped the dead `google_calendar_unavailable` reason.
>
> **✅ VALIDATOR · showrunner-boss [06-13-26 12:35 CDT]:** Confirmed in code — the 🟡 is closed correctly. `CalendarBusyResult` is now `{ busy }` only; the catch block records `status=ERROR`/`lastError` for admin visibility but pushes nothing to block (`google-calendar.ts:419-433`), and native.ts dropped the loop that turned `unavailable` into `reasons` (`native.ts:327`), keeping only the real-busy-window block. So a freebusy hard-error → admin sees ERROR, public availability degrades to native (not zeroed); a genuine busy window still blocks. Finding closed.
>
> **Status: `CONFIRMED` (committed `7157086`)** — §2 Google Calendar free/busy complete (Cal.com/Outlook still pending).

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

- Visual email template library/editor and automation template picker. Spike `usewaypoint/email-builder-js`; if compatible, add the builder on top of `MessageTemplate`, seed workflow templates, and wire automation `SEND_EMAIL` rules to pick a template from the library.

  > **🛠 ENGINEER · 06-09-26:** Completed the `usewaypoint/email-builder-js` compatibility spike against this app's Next 16, React 19, Zod 4, and TypeScript 6 stack. Direct adoption is blocked: `@usewaypoint/email-builder@0.0.9` fails normal npm peer resolution, forced runtime rendering works only with `--legacy-peer-deps`, its declarations fail against Zod 4 when checked, the visual editor is a Vite/MUI React 18/Zod 3 example rather than a packaged Next-ready builder, and the forced dependency tree reports a moderate `insane` ReDoS advisory. No app dependency, schema change, or editor UI was added. Full spike notes live in `docs/email-builder-compatibility-spike-2026-06-09.md`.
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🛠 ENGINEER · Codex-4 [06-09-26]:** Built the locked VENDOR+FORK path as an internal Next-safe builder rather than installing the incompatible upstream package. Added a constrained builder document schema, safe block renderer, and token extractor (`lib/email-builder/document.ts`, `lib/email-builder/render.ts`), persisted `builderJson` on `MessageTemplate` with migration `20260609213000_message_template_builder_json`, and taught `renderEmailTemplate` to prefer builder JSON while preserving sanitized legacy `htmlBody`/`textBody` fallback (`lib/email/render.ts`). Added a Next-native visual editor in the Communications admin with heading/text/button/image/divider/spacer blocks, verified sender selection, required text fallback, token validation, and builder HTML persistence through `EmailOutbox`-compatible templates (`modules/communications/components/email-template-builder.tsx`, `modules/communications/actions.ts`, `modules/communications/page.tsx`). Communications manifest now marks visual template builder live. Verification: `npm run prisma:generate`, `npx tsc --noEmit --pretty false`, `npm run lint`, and a builder renderer smoke test pass. `npm run build` compiles but fails during type check in unrelated §6 client work at `modules/clients/detail/page.tsx:190` (`payment.paidAt` does not exist on `Payment`).
  >
  > **Status: `READY-FOR-AUDIT`**
  >
  > **🔍 LINTER · Claude [06-09-26]:** Strong and safe — a clean pass with no correctness or security defects. The document schema tightly constrains every value interpolated into HTML: hex-only colors (`document.ts:6-16`), `level`/`align` enums, bounded int widths/heights, a discriminated union of known block types, and a 40-block cap; text is HTML-escaped, URLs pass a scheme allow check (https/mailto/tel or token only — `render.ts:22-28`), and the whole output is run through `sanitizeEmailHtml`. Send path is correct: `renderEmailTemplate` prefers `builderJson`, re-renders it, substitutes tokens (escaping values), then sanitizes again (`lib/email/render.ts:67-78`) — safe ordering, double-sanitized. Save validates tokens against the template's allowed/required metadata and requires a verified sender (`modules/communications/actions.ts:310-331`), and parse is try/caught. Findings are minor:
  > - 🟡 PROCESS — **Deviation from the locked decision (needs ratification).** The agreed approach was VENDOR+FORK the MIT `usewaypoint` renderer; codex-4 instead wrote an in-house ~80-line block renderer and added no upstream dependency. Given the spike found the upstream React19/Zod4-incompatible with a ReDoS advisory, this is defensible and arguably better (we avoid a broken dep), but it changes what we maintain (we now own the renderer outright). Flagging for @user to ratify — see chat. Not a code defect.
  > - 🟡 MEDIUM — **Scope: confirm remaining "library UX" items.** Core builder + the §12 automation MessageTemplate picker + test-send exist. The roadmap's library UX still lists version/restore and clone-from-library as unbuilt — fine to defer, but don't mark the §10/§12 line fully done until those are tracked as remaining.
  > - 🟢 LOW — `builderJson` is re-rendered at every send (`render.ts:73`) rather than reusing the stored sanitized `htmlBody`; harmless (and keeps output current with the renderer) but the stored `htmlBody` becomes vestigial for builder templates and can drift. Consider deriving on read only, or document it.
  > - 🟢 LOW — `body.fontFamily` is the one free-text style value injected raw (`document.ts:89`, `render.ts:37`); contained by the sanitizer's per-property style validation, but could be constrained to a safe charset for belt-and-suspenders. (Audit focused on the server normalize/render trust boundary, which is authoritative; the client editor UX is lower-risk.)
  >
  > **Status: `READY-FOR-PATCH`** (LOW polish only; PROCESS item is a @user decision, not a patch)
  >
  > **🛠 ENGINEER · Codex-4 [06-09-26]:** Patched the visual email builder follow-up and the ratified MJML renderer direction. The owned builder/editor JSON contract remains stable, but `renderEmailBuilderHtml` now maps blocks to MJML and awaits `mjml2html` before the existing `sanitizeEmailHtml` pass; `renderEmailTemplate`, queueing, test-send, preview, and builder-save paths now await that renderer consistently. Constrained `body.fontFamily` to a safe enum and documented that builder JSON is canonical while stored `htmlBody` is a cached admin preview. Added `MessageTemplateVersion`, `builderRenderer`, and `sourceTemplateId` with migration `20260609224500_message_template_versions`; builder saves snapshot prior versions, library rows can clone templates, visual templates expose confirm-gated restore, and preview supports sample event data plus rendered HTML iframe inspection. Verification: `npm run prisma:generate`, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, and MJML renderer smoke test pass. Note: adding `mjml`/`@types/mjml` changes `package.json`/lockfile and `npm install` reports 6 moderate dependency-tree audit findings for follow-up review.
  >
  > **Status: `READY-FOR-AUDIT`**

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
- `Automation`, `AutomationRun`, `WebhookEndpoint`, `WebhookDelivery`; add a `messageTemplateId`/template-key association for `SEND_EMAIL` rules so automations can select a reusable template instead of storing freeform subject/body text.
- `MessageTemplate`, `MessageLog`, `SuppressionListEntry`; extend `MessageTemplate` with email-builder document JSON, builder/version metadata, library/system flags, and optional source-template linkage before adding a separate template-version table.

## Integration Adapter Contracts

Use small contracts so each module can support native and third-party backends.

- Scheduling adapter: list services, get availability, create booking, cancel/reschedule booking, sync external event, receive webhook.
- Payment adapter: create checkout session, verify webhook, refund, create customer portal/session, retrieve payment status.
- Commerce adapter: sync products, create cart, get checkout URL, sync order, sync inventory.
- Media adapter: upload, delete, generate variant URL, sign private URL, list asset metadata.
- Messaging adapter: send email/SMS, template variables, visual template JSON-to-HTML rendering, event-compatible template selection, delivery callback, suppression handling.
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
