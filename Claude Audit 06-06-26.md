# Showrunner — Codebase Audit

**Date:** 06-06-26
**Auditor:** Claude (Opus 4.8)
**Scope:** Full repository at `C:\Users\Abe Tannenbaum\Documents\AdmitScheduling`
**Goal under review:** A modular admin platform reusable across client websites, with easy branding/color swaps and per-client module selection.
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 / Postgres · jose (JWT) · bcryptjs · nodemailer · AWS S3 SDK (Cloudflare R2)

---

## Codex Status Update - 06-07-26

**Resolved or already fixed in code:**
- P0 security/correctness: production `AUTH_SECRET` hard-fails; booking creation revalidates offered slots server-side; scheduling uses `SiteSettings.timezone`; booking writes use a serializable transaction; booking email queue failures are non-fatal.
- P1 reuse/admin: appointments default to upcoming with filters and pagination; shared zod validation covers admin forms and scheduling bounds; login uses a dummy bcrypt hash plus throttling; clients and appointments have search/pagination where noted.
- P2 modular/branding: disabled modules are blocked by direct URL; hardcoded teal/cream chrome has been replaced with theme tokens; primary color derives brand-dark/accent tokens; service editing exists; booking/customer/admin emails use keyed templates.
- This pass additionally removed the route `switch` in favor of `shell/module-pages.ts`, keeping `shell/modules.ts` metadata-only while avoiding circular imports.
- Media upload type/size/alt guards, seed password reset gating, and module-enabled public route guards are already fixed.

**Marked not applicable to this dev workspace:**
- `git init`, private remote setup, folder rename from `AdmitScheduling`, clearing local `.env`/dev logs, and local dev artifacts are operational/repository hygiene items for a real repository handoff, not code defects to resolve inside this temporary dev environment. They remain reminders before first production/private-remote commit.

**Still intentionally pending roadmap work:**
- Multi-tenant `Site`/tenant boundaries, shared/versioned core packaging, audit-log model, admin roles, scoped module CSS, full test suite/CI, public shared-store rate limiting, binding e-signature capture, public widgets/embeds, and production automation execution are larger platform milestones rather than bugs fixed in this pass.

---

## 1. Executive Summary

Showrunner is a clean, legible, single-tenant booking-and-admin template. The bones are good: a scheduling **adapter interface**, a **token-based theme system**, **manifest-described modules**, and **consistent `requireAdmin()` checks on every mutation**. The code reads as genuinely human-written — it is **not** tripped up by AI naming tropes (see §2).

However, against the stated goal — *an industry-leading, modular, reusable, cheaper-to-operate platform* — there are **structural gaps that should be closed before this is used as the basis for multiple client sites**. The most important ones:

1. **Timezone is decorative.** `SiteSettings.timezone` is saved and shown but **never used**. All scheduling math and formatting run in *server-local* time. On a UTC host (Railway default), every non-UTC client's availability and slot labels are wrong. This is the single highest-impact user-facing defect.
2. **The booking creation path trusts the client.** Server-side `createBooking` only checks for conflicts. It does **not** re-validate minimum notice, advance window, business hours, slot alignment, or even that the time is in the future. A crafted request can book 3 AM or a date in the past.
3. **Auth secret silently falls back to a public constant.** Deploy without `AUTH_SECRET` and admin sessions become forgeable by anyone.
4. **The "modular" and "reusable" claims are only half-implemented.** Module rendering is a hardcoded `switch`; all CSS is one 1,132-line global file; and the reuse model is "clone the repo per client" with **no git history, no tests, and no shared core package** — which multiplies maintenance cost rather than reducing it.
5. **Branding swap is incomplete.** The "primary color" control overrides exactly one token; hardcoded teal values bleed through the admin chrome regardless of the client's brand.

None of these are fatal, and most are a focused day or two each. The remediation roadmap in §7 sequences them.

### Severity tally

| Severity | Count | Examples |
|---|---|---|
| **High** | 5 | Timezone ignored · client-trusting booking path · AUTH_SECRET fallback · appointments desk shows oldest records · double-booking race |
| **Medium** | 11 | Validation inconsistency · incomplete branding · no service editing · customer-email content · no pagination · disabled-module access |
| **Low** | 9 | No git/tests · login throttling · seed password reset · dev artifacts in tree · unused config |
| **Positive** | 8 | Adapter seam · consistent authz · token theming · clean schema/indexes · human naming |

---

## 2. AI-Trope / "Looks Human-Made" Review  ✅ PASS

You asked specifically that the code look 100% human-authored. **It does.** This is a real strength and worth stating plainly.

- A scan for the usual LLM tells — `seamless`, `robust`, `comprehensive`, `leverage`, `powerful`, `effortless`, `cutting-edge`, `elevate`, `unleash`, etc. — returns **zero hits in `app/`, `lib/`, `modules/`, `shell/`**. The only matches are inside `node_modules` / `.next` build output (not your code) and one "highest-leverage" in the roadmap doc.
- Comments are sparse, practical, and explain *why* (e.g., `overlaps`, buffer windows), not narrate the obvious. No emoji, no "Here's how…", no apologetic preambles.
- Naming is domain-grounded and consistent: `nativeSchedulingAdapter`, `ServicesPanel`, `BlockoutsPanel`, `generateUniqueServiceSlug`, theme presets `clean` / `editorial` / `warm`. These are the names a human picks, not a model's defaults.

**Minor tells to fix if you want zero fingerprints:**

- **Folder vs. product name mismatch.** The repo folder is `AdmitScheduling` and `package.json` `name` is `showrunner`, while the product is "Showrunner." `AdmitScheduling` looks like a leftover from an "admissions scheduling" origin. Rename the folder and align the name — a mismatched working directory is the kind of thing that reads as "generated from a different template."
- **The roadmap doc (`docs/modular-plugin-roadmap.md`) reads machine-generated** — exhaustive, perfectly-parallel bullet taxonomies and a "What We Might Be Missing" catch-all. It's a *planning* doc so it's low-stakes, but if clients ever see `docs/`, trim it to the decisions you've actually made.
- **Stray prompt file:** `docs/claudeit.txt` contains the audit instructions themselves. Remove it from the repo.

---

## 3. Architecture & Scaling

### 3.1 Single-tenant by construction — the central decision  🔴 High (strategic)
`SiteSettings` is a hardcoded singleton (`id: "site"`, `lib/site.ts:11`, `prisma/schema.prisma:31`). Every model (`Service`, `Booking`, `Client`, `AvailabilityRule`, `BlockedTime`) is global with no tenant boundary. The README confirms the intended reuse model: *"one Railway project, one Postgres database"* per client.

That is a legitimate pattern, **but it works against "easier and cheaper… modular usage":**
- N clients = N deploys, N databases, **N copies of the code**.
- A bug fix or new module must be hand-propagated and redeployed to every client. There is **no shared, versioned core package** — each site is a fork.
- "Swapping branding" means editing settings inside each separate deployment.

**Decision to make explicitly (don't let it stay implicit):**
- **(a) Stay per-tenant-deploy** but extract the reusable core into a **versioned package** (`@showrunner/core`) that client repos depend on, so fixes ship as a version bump; **or**
- **(b) Go multi-tenant** — add `Site` / `SiteDomain` / tenant scoping (your own roadmap §1 calls for exactly this) so one deployment serves many clients and "white-label agency mode" becomes possible.

Either is defensible; the current "fork per client" is the most expensive of the three over time.

### 3.2 Modules aren't actually pluggable  🟠 Medium
The system is described as "manifest-driven," and the *navigation* genuinely is. But **rendering is a hardcoded dispatch**: `app/admin/(protected)/modules/[moduleId]/page.tsx` is a `switch (selectedModule.id)` over statically-imported page components, and `shell/modules.ts` statically imports every manifest. Adding a module means editing **at least three central files** (the switch, the registry imports, the icon map) plus creating routes — i.e., editing core, which is exactly what a plugin system is supposed to avoid.

For the "load modules in and reuse" goal, make the manifest carry its own wiring (a component/loader reference and route list) so a module folder is self-contained and the shell iterates rather than `switch`es. Today's `ShellModule` type (`shell/module-types.ts`) has nav metadata but no contract for routes, Prisma models, settings schema, permissions, or seed/export — all of which your roadmap (§1) lists as the real module contract.

### 3.3 Routing has duplication and a fragile indirection  🟠 Medium
- Two URL shapes coexist: list pages live at `/admin/modules/<id>` (via the dispatch) but **detail pages live at a different root** — `/admin/appointments/[id]`, `/admin/clients/[id]` — not under `/modules`. Inconsistent and confusing to reason about.
- Legacy redirect stubs (`/admin/appointments` → `/admin/modules/appointments`) and `export { default } from "@/modules/..."` re-export stubs add indirection. **This indirection already broke once:** `.dev-server.err.log` shows Next.js rejecting `export { default, dynamic } from …` on the dashboard route (a `dynamic` route-segment value can't be re-exported). It's fixed on disk now, but it illustrates the fragility — the pattern invites the same class of error again.

### 3.4 No version control, no tests  🟠 Medium / 🔴 High for a *reused* platform
- **The project is not a git repository** (`git rev-parse` fails; no `.git`). For something meant to be cloned and deployed repeatedly, this is a serious process gap — no history, no branching, no rollback — and the README literally says "Create a Railway project from this repo."
- **Zero automated tests.** No test script in `package.json`, no runner. The scheduling core (overlap math, buffers, notice/advance windows, slug uniqueness) is precisely the kind of logic that needs tests, and it will be redeployed across every client unverified. Your own roadmap Phase 0 lists this.

### 3.5 Styling is monolithic, contradicting the module contract  🟠 Medium
`app/globals.css` is a single 1,132-line file holding **all** styles, including module-specific ones (booking flow, dashboard, scheduling). `docs/module-system.md` explicitly says *"Raw module CSS should stay scoped to the module folder"* — the code does the opposite. Disabling or removing a module orphans its CSS, and two clients can't diverge stylistically without forking the whole sheet.

### 3.6 Public pages are `force-dynamic`  🟡 Low (cost)
Homepage and `/book` set `export const dynamic = "force-dynamic"`, so every visit server-renders and hits the DB. These are cacheable (ISR/revalidate-on-write). For a platform whose pitch includes "cheaper," public marketing/booking pages are the obvious place to cache.

### 3.7 Scheduling data model is single-resource  🟡 Low (expected)
`AvailabilityRule` and `BlockedTime` are global, not per-service/per-staff. Fine for one provider; it's a migration when multi-staff arrives. Flagging so it's a conscious constraint, not a surprise.

---

## 4. Bandaids, Fragility & Non-Best-Practices

### 4.1 `AUTH_SECRET` falls back to a hardcoded string  🔴 High (security)
`lib/auth.ts:12` — `const secret = process.env.AUTH_SECRET || "dev-secret-change-before-deploying";`
If the env var is missing in production, sessions are signed with a **publicly-known constant**, so anyone can mint a valid `admin_session` JWT and walk into the admin. Convenient for local dev, dangerous as a silent default.
**Fix:** throw when `AUTH_SECRET` is absent and `NODE_ENV === "production"`. Never sign with a literal.

### 4.2 Booking creation re-validates conflicts only — not the rules  🔴 High (security/correctness)
`lib/scheduling/native.ts` `createBooking` checks: service active, policy accepted, and overlap. It does **not** check `minimumNoticeHours`, `maxAdvanceDays`, the weekday/availability window, slot-interval alignment, or that `startsAt` is even in the future. Those rules live **only** in `getAvailableSlots` (the read path the browser calls). Because the public action takes `startsAt` from a hidden form field (`app/book/booking-flow.tsx:308`), a hand-crafted POST can book **any** time — 3 AM, outside business hours, with no notice, or **in the past**.
**Fix:** make `createBooking` authoritative — recompute eligibility server-side and reject anything the availability engine wouldn't have offered.

### 4.3 Double-booking race  🟠 Medium-High
`createBooking` does `findFirst(conflict)` then `create` with no transaction and no DB constraint. Two concurrent requests for the same slot can both pass the check and both insert. The user-facing error string ("That time was just booked") implies this is handled; it isn't.
**Fix:** wrap in a serializable transaction, or add a Postgres `EXCLUDE USING gist (tstzrange(startsAt,endsAt) WITH &&)` exclusion constraint (with a per-resource key when multi-staff lands) and handle the violation.

### 4.4 Email send can fail an already-succeeded booking  🟠 Medium
`createBooking` `await`s `sendBookingEmails` **after** persisting (native.ts:186). If SMTP throws, the whole action throws, the public form shows "Unable to create booking," yet the booking exists — so the customer re-submits and either duplicates or hits a self-conflict.
**Fix:** wrap notifications in try/catch (log on failure) or move them after the success signal; a failed email must not look like a failed booking.

### 4.5 Timezone is never applied  🔴 High (correctness) — *also a user-facing gap, see §5.1*
`SiteSettings.timezone` is written (`modules/settings/actions.ts:23`) and displayed, but **no scheduling or formatting code reads it**. Confirmed across `lib/scheduling/native.ts` (`setHours`, `getDay`), `lib/format.ts` (`Intl` with no `timeZone`), `lib/email.ts` (`toLocaleString`), `app/api/availability/route.ts` (`new Date(\`${date}T00:00:00\`)` → server-local), and `app/book/booking-page-shell.tsx` `getDefaultDate`. Correctness currently depends on the server's clock coinciding with each client's timezone — which cannot hold across multiple clients, and breaks on Railway (UTC).

### 4.6 Validation is inconsistent and unguarded on the admin side  🟠 Medium
The public booking action uses zod (`app/book/actions.ts`). **Every admin action** uses raw `String()/Number()` coercion with no schema — e.g. `Number(formData.get("durationMinutes") || 30)`. `Number("abc")` → `NaN` flows straight into a Prisma `Int`; there are no bounds, no enum checks. `updateBookingStatusAction` does `String(...) as BookingStatus` — an invalid value becomes an ungraceful 500 at the DB.
**Fix:** one shared zod layer for both public and admin inputs.

### 4.7 `durationMinutes = 0` → infinite loop  🟠 Medium (DoS)
In `getAvailableSlots`, `slotInterval = service.slotIntervalMinutes || service.durationMinutes` (native.ts:83). If both are 0, the `for` loop's `minutes += slotInterval` never advances while the condition stays true → **infinite loop / hung request** whenever availability is fetched for that service. The form sets `min="5"`, but that's a browser-only guard; the server action (§4.6) doesn't enforce it.
**Fix:** validate `durationMinutes >= 1` and `slotInterval >= 1` server-side.

### 4.8 Login lacks throttling; allows timing enumeration  🟠 Medium / 🟡 Low
`lib/auth.ts` `verifyAdminLogin` returns immediately when the email is unknown, **skipping bcrypt**, so response timing reveals whether an email exists. There is no rate limit or lockout on `loginAction`, so brute force is only slowed by bcrypt cost.
**Fix:** compare against a dummy hash for unknown users (constant-ish time) and add per-IP/email throttling.

### 4.9 Seed resets the admin password on every run  🟡 Low-Medium
`prisma/seed.ts` `update: { passwordHash: hash(password) }` re-hashes the env/default password each run and **logs it** to the console; default is `"change-me-now"`. Re-running seed against a live DB silently resets credentials.
**Fix:** only set the password on create, or guard with an explicit flag.

### 4.10 Smaller items  🟡 Low
- **Stateless JWT, no revocation** (`lib/auth.ts`): a leaked 7-day token can't be force-logged-out. Acceptable for v1; note it.
- **Media upload has no type allowlist / size cap / required alt** (`lib/media.ts`, `modules/media/actions.ts`). Admin-only, so lower risk, but the roadmap's own quality gate asks for it. (`next.config` caps server-action bodies at 8 MB, which silently rejects larger images with a confusing error.)
- **`next.config.ts` allows `res.cloudinary.com`** though the app uses R2, and homepage images use `unoptimized` (Next image optimization bypassed entirely).
- **Dev artifacts committed to the working tree:** `.env`, `.dev-server.err.log` / `.out.log` (currently full of HMR errors), `.dev-postgres/`, `tsconfig.tsbuildinfo`. They're git-ignored, but since there's no git yet, make sure `.env` is never the first commit.

---

## 5. Edge-Case Gaps Affecting Users

### 5.1 Wrong wall-clock times for any non-server-timezone client  🔴 High
(Root cause in §4.5.) A Chicago salon sets 9:00–17:00; on a UTC server, customers are shown and booked at 9:00–17:00 **UTC** (4:00 AM–12:00 PM Chicago), with slot labels formatted in the wrong zone. DST shifts add a second seasonal error. This will surface immediately on the first real client.

### 5.2 The appointments desk shows the *oldest* 60 bookings  🔴 High
`modules/appointments/page.tsx:11` — `orderBy: { startsAt: "asc" }, take: 60`, with **no status or date filter and no pagination**. Once a client passes 60 historical bookings, the desk fills with ancient/completed/canceled records and **upcoming appointments fall off the end**. (The dashboard does it right with `startsAt: { gte: now }`; the actual working desk does not.)
**Fix:** default to upcoming/non-canceled, sort by soonest, and add status filter + pagination.

### 5.3 A service can be made unbookable by configuration  🟠 Medium
In `app/book/booking-flow.tsx`, the policy checkbox renders **only if `policyText` is non-empty** (line 336), but the submit button is disabled while `requirePolicy && !policyAccepted` (line 356). So a service with **`requirePolicy = true` and blank `policyText`** shows no checkbox and can **never** be submitted — the public simply can't book it, with no visible reason. The seed defaults `requirePolicy` on, so this is easy to hit.
**Fix:** require `policyText` when `requirePolicy` is set (server-validate), or treat "no policy text" as "no acceptance needed."

### 5.4 Services can't be edited after creation  🟠 Medium
`ServicesPanel` offers **Add** and **enable/disable** only — no edit form. Changing a duration, buffer, notice window, intake prompt, or policy on an existing service is impossible through the UI; you'd recreate it (new slug, lost link stability). For day-to-day client self-service this is a notable hole.

### 5.5 The "confirmation" email is really the admin alert  🟠 Medium
`lib/email.ts` builds one admin-oriented message ("`{name}` booked `{service}`… Customer email: …") and sends it to **both** the business and the customer. Meanwhile the success screen promises "Check your email for confirmation details" (`booking-flow.tsx:108`). The customer receives an internal-looking note that even echoes their own email back at them. Split into a customer confirmation and an admin notification.

### 5.6 Branding swap is partial — teal bleeds through  🟠 Medium *(directly undercuts the headline goal)*
`themeToCssVars` overrides only the `brand` token from the "Primary color" picker (`lib/theme/tokens.ts:162`), leaving `brandDark`/`accent` at preset values — so a custom brand color and its derived hover/dark shade can clash. Worse, several chrome colors are **hardcoded hex, bypassing tokens entirely**:
- `.admin-sidebar { background:#162426 }` (globals.css:244) — the entire admin sidebar stays dark teal for every client.
- `.dashboard-card-icon { background:#eef7f5; border:rgba(17,100,102,.16); }` (426) and `.booking-progress-step.active { background:#eef7f5 }` (655) — teal tints regardless of brand.
- `.policy-check { background:#f7f1e6 }` (931), `.booking-footer-summary { background:rgba(255,253,248,.96) }` (816) — fixed cream that only matches the "clean" preset.

A client whose brand is, say, crimson will see crimson buttons but teal sidebar, teal icon chips, and teal active-steps. **The "easily swap colors" promise isn't fully delivered.**
**Fix:** drive *all* chrome from tokens; derive `brandDark`/tints from the chosen primary (HSL math) instead of hardcoding.

### 5.7 No logo / limited brand surface  🟠 Medium
Branding is a CSS square (`.brand-mark`) plus the business-name text. There's **no logo upload** and **no font choice** (all three presets use Inter). For a white-label client platform, a logo is table stakes.

### 5.8 Disabled modules remain reachable by URL  🟡 Low-Medium
The dispatch (`[moduleId]/page.tsx:22`) checks only `status === "active"`, **not** whether the module is in the site's `enabledModuleIds`. A client who disables "Media" in Settings can still open `/admin/modules/media` directly and use it. It's admin-only, but it breaks your own quality gate ("a module can be disabled without orphaning the admin") and is a confusing half-state.

### 5.9 No pagination or search anywhere  🟠 Medium (at scale)
Hard `take` caps with no paging or search: clients `take: 100`, media `take: 60`, blockouts `take: 20`. Records beyond the cap are simply invisible. Fine at launch, a real problem as a client's book grows.

### 5.10 `getDefaultDate` assumes a Mon–Fri business  🟡 Low-Medium
`booking-page-shell.tsx:11` unconditionally skips Saturday/Sunday for the default date, and mixes local `getDay()` with `toISOString().slice(0,10)` (off-by-one near midnight). A weekend-operating client still defaults customers to Monday.

### 5.11 Blank-email client upsert collision  🟡 Low
`createClientAction` upserts on `email` after lowercasing; a blank email becomes `""`, which is `@unique`. Add two clients without an email and the second **overwrites** the first.

---

## 6. What's Genuinely Good (keep these)

- **Authorization is consistent.** *Every* admin mutation calls `requireAdmin()` (settings, scheduling, appointments, clients, content, media). Many Next.js apps forget that server actions are public endpoints; this one didn't.
- **The scheduling adapter seam** (`lib/scheduling/types.ts` → `native.ts`) is a clean, honest interface that will make a Google Calendar / Cal.com backend a drop-in later.
- **Token-based theming is the right foundation** — CSS variables, named presets, applied inline to both public (`.site-shell`) and admin (`.admin-root`) shells. The leaks in §5.6 are fixable without changing the architecture.
- **The Prisma schema is tidy** with thoughtful relations (`Booking → Client onDelete: SetNull`, `ClientNote → Client onDelete: Cascade`) and sensible composite indexes on booking time ranges.
- **Security hygiene basics are present:** bcrypt cost 12, `httpOnly` + `sameSite=lax` + `secure`-in-prod cookies, a generic login error message (no enumeration *in the copy*), zod on public input.
- **Performance instincts are sound:** queries are batched with `Promise.all`; empty states exist everywhere; `prefers-reduced-motion` is honored; the mobile sidebar has proper `aria-controls`/`aria-expanded`/labels.
- **The code is consistent and readable** — same form/action conventions across modules, predictable file layout. A new developer (or another client fork) can navigate it quickly.

---

## 7. Prioritized Remediation Roadmap

### P0 — Before this powers any real client (security & correctness)
1. **Hard-fail on missing `AUTH_SECRET` in production** (§4.1).
2. **Make `createBooking` authoritative** — re-validate notice/advance/hours/alignment/not-in-past server-side (§4.2).
3. **Implement timezone** end-to-end using `SiteSettings.timezone` for all generation, comparison, and formatting (§4.5 / §5.1). Consider a date lib (`date-fns-tz` / `Temporal`).
4. **Prevent double-booking** with a transaction or Postgres exclusion constraint (§4.3).
5. **Make email non-fatal** so a notification failure can't masquerade as a booking failure (§4.4).
6. **`git init`**, commit with `.env` ignored, push to a private remote (§3.4).

### P1 — Make it dependably reusable
7. **Fix the appointments desk query** (upcoming-first, filter, paginate) (§5.2).
8. **One shared zod validation layer** for admin + public; bound numeric inputs; guard `duration ≥ 1` (§4.6, §4.7).
9. **Add a test suite** for the scheduling core (overlap, buffers, notice/advance, slug uniqueness) and run it in CI (§3.4).
10. **Decide the tenancy model** (versioned core package *or* multi-tenant) and write it down (§3.1).
11. **Add login throttling + constant-time unknown-user path** (§4.8).
12. **Add pagination/search** to clients, appointments, media (§5.9).

### P2 — Deliver the modular + branding promise
13. **Complete the theming:** drive all chrome from tokens, derive shades from the primary, kill the hardcoded teal/cream (§5.6); add **logo upload** and optional font (§5.7).
14. **Make a module self-contained:** richer manifest (routes, models, settings, seed, export) so adding one doesn't mean editing the central `switch` (§3.2); **enforce `enabledModuleIds` in the dispatch** (§5.8).
15. **Scope CSS per module** (CSS Modules) to match the documented contract (§3.5).
16. **Add a service edit form** (§5.4); **split customer vs. admin emails** (§5.5).
17. **Housekeeping:** rename `AdmitScheduling` → `showrunner`; remove `docs/claudeit.txt`; clear dev logs; trim/realign the roadmap doc and the `lib/modules.ts` references in docs (the file is actually `shell/modules.ts`) (§2, §3.3).

---

## 8. Doc/Code Drift Noted in Passing
- `docs/module-system.md` and `docs/modular-plugin-roadmap.md` both reference **`lib/modules.ts`**; the registry actually lives at **`shell/modules.ts`**.
- `README.md` says "Create a Railway project from this repo," but the directory is **not a git repository**.
- `docs/module-system.md` says modules scope their own CSS; in practice all CSS is global (§3.5).

---

*Prepared as a point-in-time review of the working tree on 06-06-26. Severity reflects impact on the stated goal of a reusable, multi-client, brandable admin platform. Line references are to the files as read during this audit.*

---

## Resolution Notes - Codex 06-07-26

- **4.4 Email send can fail an already-succeeded booking:** Resolved. Booking and form notifications now enqueue into `EmailOutbox`; queue failures are recorded as outbox rows and do not roll back the user action.
- **5.5 Customer confirmation vs. admin alert:** Resolved. Booking creation now queues separate `booking.created.customer` and `booking.created.admin` templates with different content and recipient routing.
- **4.10 Dev artifacts in working tree:** Dev-environment note. `.env`, `.next`, `.dev-postgres`, logs, and `tsconfig.tsbuildinfo` are local/generated artifacts and should stay ignored before any first commit. `tsconfig.tsbuildinfo` was cleared during verification and will be regenerated by TypeScript as needed.
- **2 Stray prompt file:** Already clear in the current `docs/` directory; no `docs/claudeit.txt` file is present.
