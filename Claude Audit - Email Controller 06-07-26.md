# Showrunner — Email Controller Audit

**Date:** 06-07-26
**Auditor:** Claude (Opus 4.8)
**Scope:** `lib/email/*` (handler/core), `scripts/process-email-outbox.ts`, `app/api/internal/email-outbox/route.ts`, the `Email*` models in `prisma/schema.prisma`, and migration `20260607130000_email_core`. Reviewed against the design spec in `docs/email-core.md`.
**Stack:** Next.js 16 (App Router) · Prisma 7 / Postgres (pg adapter) · nodemailer · transactional-outbox pattern

---

## 1. Executive Summary

This is the **best-engineered subsystem in the repo**. It is a real transactional-outbox: render-at-enqueue snapshots, `FOR UPDATE SKIP LOCKED` row claiming, unique `idempotencyKey` enqueue dedup, retry/backoff, suppression *scopes*, sender identities/domains, and a clean provider seam. It closely tracks its own design doc (`docs/email-core.md`). Naming is human and clear — no AI tropes, **no rename suggestions**.

The problem is not the design — it's **wiring and a handful of correctness bugs**. As deployed today, **no email is actually delivered**, and several of the safety nets (bounce suppression, unsubscribe) are dead code:

1. **Nothing drains the outbox.** No cron/worker is provisioned, so every booking/form email is enqueued and sits as `QUEUED` forever.
2. **Enqueue failures are swallowed to `console`.** A paused/missing template (the §10 Communications coupling) makes the send throw, and the booking flow silently continues with no row, no log, no retry.
3. **Hard bounces are suppressed as `MARKETING` only**, so transactional mail keeps hitting dead addresses — and the code that would do even that is **unreachable** (no provider-webhook route).
4. **Unsubscribe/subscribe are orphaned**, and resubscribe never clears the suppression it created.

None are design-fatal; most are a focused hour or two each. The architecture is right.

### Severity tally

| Severity | Count | Examples |
|---|---|---|
| **Critical** | 2 | Outbox never drained (no scheduler) · enqueue errors swallowed → silent email loss |
| **High** | 4 | Hard bounce suppressed as MARKETING only · provider-event handler unwired (no sig/idempotency) · unsubscribe/subscribe orphaned + resubscribe doesn't clear suppression · missing-recipient produces nothing (spec wants SUPPRESSED row) |
| **Medium/Low** | 4 | Retry backoff off-by-one (5-min tier dead) · at-least-once double-send on crash · SMTP transport rebuilt per send · timing-unsafe secret compare / dead `skipped` counter / duplicated helpers |
| **Positive** | — | Outbox-as-source-of-truth · SKIP LOCKED claim + stale reclaim · idempotency-key dedup · suppression scopes · verified-sender marketing gate · human naming |

---

## 2. AI-Trope / "Looks Human-Made" Review  ✅ PASS

A scan of `lib/email/` for the usual tells (`seamless`, `robust`, `orchestrate`, `pipeline`, `leverage`, `comprehensive`) returns nothing. Function names are concrete and behavioral: `queueEmail`, `claimRows`, `nextAttemptDate`, `resolveSender`, `getAdminRecipients`, `suppressionReason`, `recordProviderEvent`, `renderEmailTemplate`. This reads as genuinely human-authored. No renames recommended.

---

## 3. Critical

### 3.1 🔴 Nothing drains the outbox — queued mail is never sent
Bookings/forms enqueue to `EmailOutbox` (`lib/scheduling/native.ts:211`, `modules/appointments/actions.ts:32`, `modules/forms/actions.ts:265`), but the only callers of `processEmailOutbox` are the `email:process` script and `app/api/internal/email-outbox/route.ts` — and **neither is scheduled**. `railway.json` runs only `prisma:deploy && start`; there is no cron service. `docs/email-core.md:499` explicitly calls for "a cron service that runs the script on a schedule and exits cleanly" — it was specced and never provisioned.

**Effect:** every booking confirmation sits in `EmailOutbox` as `QUEUED` indefinitely (in dev too — the console fallback only fires when the processor runs).

**Fix:** provision the Railway cron running `npm run email:process` (the script already disconnects Prisma and exits — `scripts/process-email-outbox.ts:16-18`). Add `EMAIL_WORKER_SECRET` and `EMAIL_WORKER_LIMIT` to `.env.example` — neither is documented, and the trigger route fails closed with `503` without the secret (`route.ts:7-11`).

### 3.2 🔴 Enqueue failures are swallowed to `console` — emails vanish with no trace
`events.ts:62-68` wraps every emitter in `logQueueError`, which catches and only `console.error`s. If `queueEmail` throws — paused/missing template, render missing-token, unverified marketing sender — the booking/form action **succeeds** and produces **no outbox row, no log, no retry, no admin signal**.

This is the consumer end of the §10 Communications coupling: pausing the `booking.created.customer` template in the Communications admin flips `isActive=false`, and `queueEmail` throws `"Email template not found"` (`queue.ts:61-71`) because it resolves templates with `where: { key, isActive: true }`. The throw is then swallowed here → bookings silently stop emailing.

**Fix:** on enqueue failure, still write a `FAILED`/`SUPPRESSED` `EmailOutbox` (or `MessageLog`) row so the failure is visible and queryable. Don't let send-time errors disappear into stdout.

---

## 4. High

### 4.1 🟠 Hard bounces are suppressed as `MARKETING` only — transactional mail keeps hitting dead addresses
`provider-events.ts:55-68` upserts the suppression with `scope: MARKETING` for **both** `BOUNCED` and `COMPLAINED`. But `suppressionReason` (`queue.ts:33-43`) only blocks transactional mail when scope is `ALL`/`TRANSACTIONAL` (and the column default is `MARKETING` — `migration.sql:43`). So a hard-bounced address still receives booking confirmations → repeated bounces → sender-reputation damage.

**Fix:** bounces should suppress `ALL` (or at least `TRANSACTIONAL`); only complaints map cleanly to `MARKETING`.

### 4.2 🟠 The bounce/complaint/delivered handler is dead code
`recordProviderEvent` has **zero callers** — there is no provider-webhook route under `app/api` (only `availability` and `internal/email-outbox` exist). So all deliverability tracking and auto-suppression in `provider-events.ts` never runs. When you wire it, the route must:
- **Verify the provider signature.** Otherwise anyone can POST a fake `BOUNCED` event to suppress an arbitrary address (abuse/DoS).
- **Be idempotent.** Providers retry webhooks, and `EmailProviderEvent` has no unique constraint (`migration.sql:295-301`) — retries duplicate rows and re-write outbox state. Key off a provider event id + `(providerMessageId, eventType)`.
- **Guard empty `providerMessageId`.** `findFirst({ where: { providerMessageId }, orderBy: createdAt desc })` (`provider-events.ts:14-17`) mis-correlates a `""` id to the most recent empty-id row. Note nodemailer returns the SMTP `Message-ID` as `providerMessageId` (`provider.ts:60`), which may not match what an ESP references in webhooks — confirm correlation before relying on it.

### 4.3 🟠 Unsubscribe + subscribe are orphaned, and resubscribe doesn't clear suppression
`unsubscribeByToken` and `subscribeToList` have **no callers** — there is no unsubscribe route/page, so the `List-Unsubscribe` header (`queue.ts:26-30`) would be a dead link if marketing were ever enabled. The logic is also inconsistent: `subscribeToList` (`subscriptions.ts:35-54`) sets a re-subscriber to `ACTIVE` but **never removes the `MARKETING` `SuppressionListEntry`** that `unsubscribeByToken` created (`subscriptions.ts:103-116`). A re-subscribed contact is "active" yet still suppressed.

**Fix:** add the unsubscribe route; clear (or downgrade) the marketing suppression on resubscribe so consent state and suppression state agree.

### 4.4 🟠 Missing admin recipient produces *nothing* — spec wants a SUPPRESSED row
`docs/email-core.md:349,521` require: "If no recipient exists, record a suppressed outbox item with the reason `no_recipient`." The implementation instead does `Promise.all([])` (`queue.ts:108-125` + `recipients.ts:50`) and silently creates no row — an invisible non-send.

**Fix:** follow the spec so a misconfigured recipient group is auditable rather than silent.

---

## 5. Medium / Low

### 5.1 🟡 Retry backoff is off-by-one; the 5-minute tier is unreachable
`process.ts` increments `attemptCount` *before* indexing `retryDelaysMinutes` (`[5,30,120,720,1440]`), so the first retry waits **30 min** and the `5` is never used (`process.ts:6,23-28,109-117`). You also get 4 retries, not the 5 the array implies. Index by the pre-increment count.

### 5.2 🟡 At-least-once with no provider-side dedup → double-send on crash
The send happens *outside* the claim transaction (`process.ts:83-106`). A crash after `provider.sendEmail` succeeds but before the `SENT` update leaves the row `SENDING`; the 15-min reclaim (`process.ts:44-46`) resends it. `idempotencyKey` dedups *enqueues*, not *sends*. Pass a deterministic idempotency key / `Message-ID` to the provider, or accept and document at-least-once.

### 5.3 🟡 SMTP transport is recreated per email
`provider.ts:49` calls `nodemailer.createTransport` inside `sendEmail`, so a 50-row batch opens 50 connections — no `pool: true`, no `connectionTimeout`/`socketTimeout`. A hung server stalls the whole batch (and can push it past the 15-min reclaim window → 5.2). Build one pooled transport.

### 5.4 🟡 Smaller items
- **Timing-unsafe secret compare** in the worker route (`route.ts:14`) — use `crypto.timingSafeEqual`.
- **`result.skipped` is always 0** — dead counter (`process.ts`); the doc lists "skipped" as a reported count.
- **`normalizeEmail` is copy-pasted** in three files (`queue.ts:8`, `recipients.ts:9`, `subscriptions.ts:13`); header helpers (`plainHeaders`/`jsonHeaders`) are near-duplicates. Centralize.
- **`booking.delayed.customer` template is never triggered** by any emitter; `delayReason` is hardcoded `""` (`events.ts:58`). Either wire a delay emitter or drop the seeded template.

---

## 6. What's Good (keep)

- **Outbox-as-source-of-truth** with render-at-enqueue snapshots (`queue.ts` renders, `process.ts` only ships) — matches `docs/email-core.md:368-369`.
- **Correct concurrency:** `FOR UPDATE SKIP LOCKED` claim + stale-`SENDING` reclaim (`process.ts:35-62`). Concurrent workers won't double-claim.
- **Idempotency-key enqueue dedup** with a unique index (`migration.sql:268`); `createOutboxRow` swallows `P2002` cleanly (`queue.ts:45-55`). Event keys are well-designed (`booking:<id>:created:customer`, etc.).
- **Suppression scopes** and the **marketing verified-sender gate** (`sender.ts:33-35`), `List-Unsubscribe` + `List-Unsubscribe-Post` headers (`queue.ts:26-30`).
- **Dev console fallback** when `SMTP_HOST` is unset, with a production guard (`provider.ts:34-47`).

---

## 7. Spec Deviations vs `docs/email-core.md`

The design doc is strong and the code mostly honors it. Deviations worth reconciling:

1. **Cron worker specced (`:499`) but not provisioned** → §3.1.
2. **Missing recipient should be a SUPPRESSED `no_recipient` row (`:349,521`)** → produces nothing → §4.4.
3. **"Move Communications delivery table to read from `EmailOutbox`… do not write both" (`:161`)** → the manual `MessageLog` and the real `EmailOutbox` still coexist (see the §10 Communications audit).
4. **Marketing path is schema + helpers only** — `EmailCategory.MARKETING` is never used in source; `EmailCampaign` has no sender. The verified-sender gate, `List-Unsubscribe`, and unsubscribe handler are therefore untested end-to-end (consistent with the roadmap marking these pending, but the breadth is worth stating).

---

## 8. Suggested Remediation Order

1. **Provision the cron** + add `EMAIL_WORKER_SECRET`/`EMAIL_WORKER_LIMIT` to `.env.example` (§3.1) — without this nothing else matters.
2. **Stop swallowing enqueue errors** (§3.2) and decouple the Communications "Pause" from system templates (§10 cross-ref).
3. **Bounce → `ALL` scope** (§4.1) and **resubscribe clears suppression** (§4.3) — small, high-value correctness fixes.
4. **Backoff off-by-one** (§5.1) and **pooled transport** (§5.3) — self-contained.
5. When building provider callbacks: **signed + idempotent webhook route** and the missing-recipient SUPPRESSED row (§4.2, §4.4).

Low-risk, self-contained fixes I can apply now on request: the backoff off-by-one (§5.1), bounce→`ALL` scope (§4.1), and adding the worker env vars to `.env.example` (§3.1).

---

## 9. Resolution Notes - Codex 06-07-26

- **3.1 Outbox drain:** Deployment/config item, not a local-code bug. Added `EMAIL_WORKER_SECRET`, `EMAIL_WORKER_LIMIT`, and `EMAIL_PROVIDER_WEBHOOK_SECRET` to `.env.example`; documented the Railway cron service requirement in `README.md` and `docs/client-handoff-checklist.md`. Railway cron schedule still has to be configured as a separate Railway service because the current `railway.json` describes only the web service.
- **3.2 Enqueue failures swallowed:** Resolved. `queueEmail` now records a failed `EmailOutbox` row for missing templates, inactive templates, render errors, missing recipients, and other queue failures instead of leaving only stdout.
- **4.1 Hard bounces suppressed as marketing only:** Resolved. Provider bounces now create `ALL` suppressions; provider complaints remain marketing suppressions.
- **4.2 Provider-event handler dead code:** Resolved for the current generic internal path. Added `POST /api/internal/email-provider-events`, protected by `EMAIL_PROVIDER_WEBHOOK_SECRET`, with idempotent provider-event recording via `EmailProviderEvent.eventKey`. Provider-specific signature verification remains future adapter work.
- **4.3 Subscribe/unsubscribe orphaned and resubscribe suppression mismatch:** Resolved. Added `POST /api/newsletter/subscribe`, added `GET/POST /unsubscribe/[token]`, and `subscribeToList` now clears marketing suppressions when explicit consent is captured again.
- **4.4 Missing admin recipient produces no row:** Resolved. `queueAdminEmail` now writes a suppressed `EmailOutbox` row with `no_recipient`.
- **5.1 Retry backoff off-by-one:** Resolved. The first retry now uses the 5-minute tier.
- **5.2 Crash after provider acceptance can double-send:** Mitigated and documented. The processor now sends a deterministic Message-ID based on the outbox row and stores that as fallback provider id. SMTP still remains at-least-once after provider acceptance; exact provider-side idempotency needs an API provider.
- **5.3 SMTP transport recreated per email:** Resolved. SMTP sending now reuses a pooled transport with connection/message limits and timeouts.
- **5.4 Smaller items:** Timing-safe secret comparison added to the worker route; shared email/header/error helpers added; `skipped` now reflects claimed rows that cannot be loaded after claim. The `booking.delayed.customer` template remains a future-feature seed until a delay action/UI exists.
- **Codex follow-up 06-07-26:** The internal HTTP worker route now honors `EMAIL_WORKER_LIMIT`, matching the CLI worker, and `processEmailOutbox` returns an explicit `suppressed` count in its typed result for parity with `docs/email-core.md`.
