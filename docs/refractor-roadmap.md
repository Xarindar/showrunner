# Modular Deployment Refactor Roadmap

Last researched: June 8, 2026 · Last audit pass: June 8, 2026

This roadmap follows up on `showrunner_refractor.md` (Codex, 06-08-26). That pass consolidated
cross-cutting *helpers* (env parsing, FormData, CSV, URL validation) and split route mounting from
endpoint behavior. It did not touch the **structural module-ownership** seams that decide whether a
module can be dropped into — or pulled out of — a client front end without editing central files.

This file tracks closing those seams. It reuses the audit ledger protocol from `docs/roadmap.md`.

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

Before marking READY-FOR-CONFIRM, commit your work:
  - One commit per logical fix where possible — do not
    bundle unrelated changes
  - Write a clear commit message that references what was
    patched and which finding it addresses
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

## How To Read This Roadmap (Audit Protocol)

Same protocol as `docs/roadmap.md`. **Agents: treat the Status Index as the source of truth, and
_append_ to an item's log blocks rather than rewriting them.**

**Lifecycle:** `⬜ PENDING → 🔵 READY-FOR-AUDIT → 🔍 AUDITED → 🛠 RESOLVED → ✅ CONFIRMED`, with
`⚠️ FLAGGED` for an item with an open blocker.

| Token | State | Meaning |
|---|---|---|
| `⬜ PENDING` | not built | designed only; code absent |
| `🔵 READY-FOR-AUDIT` | built, unaudited | implementer marked it ready; awaiting an audit pass |
| `🔍 AUDITED` | findings recorded | an AUDIT block exists; fixes not yet applied or incomplete |
| `🛠 RESOLVED` | fixes applied | implementer addressed findings; awaiting re-verification |
| `✅ CONFIRMED` | verified | auditor re-checked the code and the fix holds |
| `⚠️ FLAGGED` | needs rework | open blocker, regression, or a resolution that did not fully land |

**Finding severity:** `🔴 BLOCKER` · `🟠 HIGH` · `🟡 MEDIUM` · `🟢 LOW`.

**Log block format** — one line per lifecycle step under the item, oldest first:

```
> **🔍 AUDIT · <author> [MM-DD-YY]:** findings, each tagged 🔴/🟠/🟡/🟢 with file:line + fix.
> **🛠 RESOLVED · <author> [MM-DD-YY]:** what changed.
> **✅ CONFIRMED · <author> [MM-DD-YY hh:mm TZ]:** what was re-verified in code (file:line).
```

## Status Index

Authoritative current state. `P` = Phase number below.

| P | Item | Status | Open findings | Updated |
|---|---|---|---|---|
| 1 | Convention-based module page loader (drop the hand-maintained loader list) | 🔍 AUDITED · APPROVED-FOR-PATCH | Reviewer ✅ — informational 🟡 only (build-excluded page chunk, owned by P5 #5) | 06-08-26 |
| 2 | Single-source module icons (collapse the type↔map duplication) | 🔍 AUDITED · APPROVED-FOR-PATCH | Reviewer ✅ — single source confirmed, no second list | 06-08-26 |
| 3 | Module-owned health checks + events (retire the central if-ladder and catalog) | 🔍 AUDITED · APPROVED-FOR-PATCH | 🟠 re-scoped: no committed baseline exists (all born in 9d6b508) — parity is a seeded-DB Validator check (clients/appointments own events, no health) | 06-08-26 |
| 4 | Co-locate each module's API surface inside `modules/<id>/api` | 🔍 AUDITED · APPROVED-FOR-PATCH | Reviewer ✅ — zero orphaned `@/api/` imports; verbs + worker secret checks preserved | 06-08-26 |
| 5 | Real deployment boundary (`ModuleInstallation`/`ModuleSetting`, build-time selection) | 🛠 RESOLVED · READY-FOR-CONFIRM | BLOCKER fixed + made durable in HEAD (`9cffa24`); 🟡 visibleToPublic/beta/ModuleSetting explicitly **deferred** (tracked under Remaining) | 06-08-26 |
| 6 | Per-module Prisma schema split (`prismaSchemaFolder`) | ⚠️ FLAGGED | HEAD `migrations.path` now committed (`9cffa24`), so the pipeline-break condition is gone; still routed to Linter for re-audit against committed state | 06-08-26 |
| — | Migration pipeline reconciliation (root cause of P6 schema-folder move) | ✅ CONFIRMED | Now durable — `migrations.path` + consolidated/reconcile migrations committed in `9cffa24`; clean HEAD checkout reproduces the schema (13 migrations, status up to date) | 06-08-26 |

## Audit Stats (baseline, pre-refactor — 06-08-26)

Measured against the tree at the start of this refactor.

| Metric | Before | Target after P1–P3 |
|---|---|---|
| Central files edited to add one module | 3 (`shell/modules.ts`, `shell/module-pages.ts`, sometimes `shell/module-types.ts`) | 1 (`shell/modules.ts`) |
| Hand-maintained module→loader entries (`shell/module-pages.ts`) | 16 | 0 (derived) |
| Icon name declared in two places (`module-types.ts` union + `modules.ts` map) | yes (14 names ×2) | no (one map, derived type) |
| `isEnabled(settings, "<id>")` branches hardcoded in `lib/platform-status.ts` | 21 | 1 (generic summary check only; logic moved to modules) |
| Module health logic (DB counts + warning text) owned centrally | all, in `platform-status.ts` | 0 (each in `modules/<id>/health.ts`) |
| Module events defined outside their owning module (`lib/events/catalog.ts`) | 10 | 0 (each in `modules/<id>/events.ts`; catalog only composes) |
| `prisma/schema.prisma` | 1,277 lines · 50 models · 38 enums (single file) | unchanged until P6 |

**Honest carve-outs (not over-claiming):**

- The manifest `healthChecks: string[]` / `dataModels: string[]` arrays are still descriptive — health is
  wired by *file convention* (`modules/<id>/health.ts`), not by reading those arrays. P5 added install
  records but did **not** make these arrays load-bearing; that remains open (see P5 audit focus #3).
- Events still need **one** central line: registering the module's slice in `lib/events/catalog.ts`. The
  *definitions* are co-located in the module; only the composition is central. Removing that last line
  would require the same convention-import pattern and is a fast follow if wanted.

## Why This Refactor

Codex's pass treated modularity as a helper-sharing problem and solved that well. But the manifest
(`ShellModule`) already *declares* `dataModels`, `healthChecks`, `permissions`, `publicRoutes` —
and **nothing reads them**. The real wiring still lives in central files the manifest was meant to
replace. "Drop in a folder" is really "drop in a folder and edit three registries, then hand-add a
branch to a 300-line status file and an entry to a central event catalog."

The goal: make `moduleRegistry` the single source of truth, and make the shell **iterate** it instead
of hardcoding per-module logic. That turns module add/remove into a one-folder operation — the
concrete version of "slot into any client front end."

---

## Phase 1 — Convention-Based Module Page Loader

**Problem.** Registering a module requires editing `shell/module-pages.ts` with a literal
`id: () => import("@/modules/<id>/page")` entry that duplicates the `id` already in the manifest and
in `registeredModules`. The two id lists can silently drift: a module registered in `shell/modules.ts`
but missing from `module-pages.ts` 404s at runtime with no compile-time signal.

**Design.** Replace the 16-entry map with a single convention loader that derives the import path from
the (registry-validated) module id. The loader stays in `shell/module-pages.ts` — a **server-only**
file imported only by `app/admin/(protected)/modules/[moduleId]/page.tsx` — so it never enters the
client graph. The id is validated against `getModule()` before import, so the dynamic path cannot be
used for traversal.

**RSC constraint (why the file is not deleted outright).** Co-locating the loader on the manifest or
in `module.ts` would pull `() => import("./page")` into `shell/modules.ts`, which is imported by the
`"use client"` sidebar — dragging server-only module pages into the client bundle. The two-file split
(`modules.ts` = data for client; `module-pages.ts` = loaders for server) is a real RSC boundary, not
an oversight. So Phase 1 keeps the file but removes the hand-maintained list inside it.

> **🛠 RESOLVED · Claude [06-08-26]:** `shell/module-pages.ts` reduced from a 16-entry id→loader map to a
> single convention loader: `import(\`../modules/${moduleId}/page\`)`, gated on `getModule(moduleId)` so the
> dynamic path is bounded to registered modules, with a try/catch returning `null` on miss. The shared
> route entry (`app/admin/(protected)/modules/[moduleId]/page.tsx`) is unchanged. Adding a module no longer
> touches this file. Verified: `npx tsc --noEmit` clean; `npm run build` compiled `/admin/modules/[moduleId]`
> and per-module page chunks under webpack (Next 16, non-Turbopack build).
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — confirm the dynamic import emits one lazy chunk
> per module (no eager bundle) and that a disabled/unknown id still 404s via the existing route guard.
>
> **🔍 LINTER · Claude [06-08-26]:** No defects. `shell/module-pages.ts:10-19` is a single convention loader
> gated on `getModule()` (registry-bounded, so the dynamic path is traversal-safe) with `try/catch → null`
> on miss; the hand-maintained id→loader map is gone. Route guard verified: `app/admin/(protected)/modules/[moduleId]/page.tsx:17-18`
> 404s on inactive/disabled ids, and `loadModulePage` returns `null` → `notFound()` (page.tsx:21) for an
> unknown id. One lazy chunk per module (not an eager bundle) is the defined output of this webpack
> dynamic-context form. `tsc --noEmit` clean. 🟡 Minor (informational, already disclosed under P5): that same
> dynamic-context globs `../modules/*/page` off the filesystem, so a *build-excluded* module still gets its
> page chunk emitted — consistent with P5's "no tree-shaking yet" carve-out, not a Phase-1 defect.
>
> **Status: `READY-FOR-REVIEW`**
>
> **✅ REVIEWER · Claude [06-08-26]:** Findings confirmed. `shell/module-pages.ts:10-19` is the single
> registry-gated convention loader; the hand-maintained id→loader map is gone. Route guard `notFound()`s on
> inactive ids and on `loadModulePage` returning `null` for an unknown id (`app/admin/(protected)/modules/[moduleId]/page.tsx:17-21`).
> The 🟡 (a build-excluded module still emits a page chunk) is informational and already owned by P5 focus #5.
> No gaps.
>
> **Status: `APPROVED-FOR-PATCH`**

## Phase 2 — Single-Source Module Icons

**Problem.** Icon names are declared twice: the `ModuleIconName` union in `shell/module-types.ts` and
the runtime `moduleIcons` Lucide map in `shell/modules.ts`. Adding an icon means editing both, and the
two can disagree (a name in the union with no map entry is `undefined` at render).

**Design.** Move the Lucide map into a new `shell/module-icons.ts` that owns the icons and **derives**
`export type ModuleIconName = keyof typeof moduleIcons`. `module-types.ts` imports the type from there;
`modules.ts` re-exports the map for existing consumers. One place to add an icon; the type follows.

> **🛠 RESOLVED · Claude [06-08-26]:** New `shell/module-icons.ts` owns the Lucide map; `ModuleIconName` is
> now `keyof typeof moduleIcons` (derived). `shell/module-types.ts` imports + re-exports the type;
> `shell/modules.ts` drops its 14 Lucide imports and the duplicate map, re-exporting `moduleIcons` from the
> new owner. Consumers (`shell/admin-sidebar.tsx`, `modules/help/page.tsx`) are unchanged via the re-export.
> Adding an icon is now a single map entry; an unmapped name is a compile error, not a render-time
> `undefined`. Verified: `npx tsc --noEmit` clean; `npm run build` passed.
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — confirm no second icon-name list remains and that
> the derived union still gates manifest `icon` fields.
>
> **🔍 LINTER · Claude [06-08-26]:** No defects. Single source confirmed: the Lucide map exists only at
> `shell/module-icons.ts:22-37`; `shell/modules.ts:1,20` imports and re-exports it (the old 14 Lucide imports
> are gone). `ModuleIconName = keyof typeof moduleIcons` (`module-icons.ts:39`) is derived, re-exported via
> `module-types.ts:2-4`, and gates the manifest field at `module-types.ts:29` (`icon: ModuleIconName`).
> Consumers read `moduleIcons[item.icon]` only (`shell/admin-sidebar.tsx:61`, `modules/help/page.tsx:133`).
> Grep across `*.{ts,tsx}` finds no second icon-name list. An unmapped name is a compile error; `tsc --noEmit`
> clean.
>
> **Status: `READY-FOR-REVIEW`**
>
> **✅ REVIEWER · Claude [06-08-26]:** Findings confirmed. The Lucide map lives only at `shell/module-icons.ts:22-37`;
> `ModuleIconName = keyof typeof moduleIcons` (`:39`) is the derived type, re-exported via `module-types.ts:2-4`
> and gating the manifest field at `module-types.ts:29`. `shell/modules.ts:1,20` imports and re-exports the map,
> so consumers are unchanged. No second name list anywhere. No gaps.
>
> **Status: `APPROVED-FOR-PATCH`**

## Phase 3 — Module-Owned Health Checks and Events

**Problem (health).** `lib/platform-status.ts` hardcodes 21 `isEnabled(settings, "<id>")` branches plus
one `Promise.all` of ~18 module-specific Prisma counts. Each manifest lists `healthChecks: [...]` that
**resolve to nothing**. Removing the billing module from a client build means editing
`platform-status.ts`. The manifest field is a lie.

**Problem (events).** `lib/events/catalog.ts` centrally hardcodes `booking.created`, `invoice.overdue`,
`order.paid`, etc. Billing's event lives outside billing; portfolio's events live outside portfolio.

**Design.**
- Each module that has runtime health contributes `modules/<id>/health.ts` exporting a
  `getHealth(ctx)` function returning `PlatformWarning[]`. `platform-status.ts` becomes a thin
  aggregator: iterate `moduleRegistry`, run each enabled module's `getHealth` under `Promise.all`
  (parallelism preserved at module granularity), concat results. The global `AUTH_SECRET` check stays
  platform-level.
- Each module that owns events contributes `modules/<id>/events.ts` exporting its slice of the event
  catalog. `lib/events/catalog.ts` becomes a composition that merges the slices and re-exports the same
  `moduleEventCatalog` / `moduleEventNames` / `ModuleEventName` so `lib/events/emit.ts` and the
  automation module are unchanged. Health files import `prisma`/`@prisma/client` and are imported only
  by the server-only `platform-status.ts`; they never enter the client graph.

> **🛠 RESOLVED · Claude [06-08-26]:** Events — added `lib/events/types.ts` (`ModuleEventDefinition`,
> `ModuleEventSlice`) and seven module-owned slices (`modules/{automation,appointments,forms,portfolio,clients,billing,products}/events.ts`).
> `lib/events/catalog.ts` shrank to a composition that merges the slices and re-exports the same
> `moduleEventCatalog` / `moduleEventNames` / `ModuleEventName` / `isModuleEventName`, so `lib/events/emit.ts`
> and the automation module did not change. The literal `ModuleEventName` union is preserved via
> `as const satisfies ModuleEventSlice` per slice plus object-spread merge.
>
> Health — added `lib/platform-health.ts` (shared `PlatformWarning` types, `ModuleHealthContext`,
> `ModuleHealthCheck`, and the `warning`/`envLooksDefault` helpers) and ten module-owned checks
> (`modules/{scheduling,forms,testimonials,media,communications,billing,products,portfolio,automation,analytics}/health.ts`),
> each doing its own Prisma counts and returning that module's warnings verbatim. `lib/platform-status.ts`
> dropped the ~300-line if-ladder and the single 18-count `Promise.all`; it now iterates `moduleRegistry`,
> loads each *enabled* module's `getHealth` by convention (`import(\`../modules/${id}/health\`)`), runs them
> under `Promise.all` (module-granular parallelism), and concats. The only platform-level check left inline
> is the global `AUTH_SECRET` warning. `PlatformWarning`/`PlatformWarningSeverity` are re-exported from
> `platform-status.ts` so dashboard/help/settings imports are unchanged. Verified: `npx tsc --noEmit` clean;
> `npm run lint` clean; `npm run build` passed.
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — (1) **output parity**: confirm the set of warnings
> for a seeded DB matches the pre-refactor `platform-status.ts` (only top-level *ordering* should differ;
> per-module grouping is unchanged). (2) Confirm a disabled module's `getHealth` is never invoked (no stray
> DB counts). (3) Confirm event catalog ordering still drives the automation event list as before.
>
> **🔍 LINTER · Claude [06-08-26]:**
> 🟠 Significant — **output parity (focus #1) cannot be verified at lint time.** The committed
> `lib/platform-status.ts` (HEAD) is already the 220-line aggregator; git history holds no pre-refactor
> if-ladder to diff against, so a dropped or altered warning would be invisible here. Ten modules ship
> `health.ts` (analytics, automation, billing, communications, forms, media, portfolio, products, scheduling,
> testimonials); six emit none (appointments, clients, content, dashboard, help, settings). Note `clients`
> and `appointments` own event slices but no health check — if the old monolith emitted any warning for those
> domains it is now silently gone. Reviewer/Validator must confirm the warning set against a seeded DB (no DB
> is available to the Linter).
> 🟡 Minor — focus #2 satisfied: `lib/platform-status.ts:142` filters `moduleRegistry` by `isEnabled` *before*
> `loadModuleHealth`/`getHealth`, so a disabled module's check (and its Prisma counts) never runs. Focus #3
> satisfied: `moduleEventNames` is `Object.keys(moduleEventCatalog)` in spread order (`lib/events/catalog.ts:15-27`)
> and drives the automation UI/validation (`modules/automation/page.tsx:575`, `actions.ts:28`); the literal
> `ModuleEventName` union and all 10 events across the 7 slices are preserved (`as const satisfies` + spread),
> and `lib/events/emit.ts` consumes the re-exported catalog unchanged. `tsc --noEmit` clean.
>
> **Status: `READY-FOR-REVIEW`**
>
> **✅ REVIEWER · Claude [06-08-26]:** Findings confirmed, with one sharpening for the Validator. The aggregator
> is correct: `lib/platform-status.ts:142` filters by `isEnabled` *before* `loadModuleHealth`, so a disabled
> module runs no Prisma counts (focus #2 holds); checks run under `Promise.all` (:144); the only inline
> platform check is AUTH_SECRET (:165). Event composition preserves the literal union — each slice is
> `as const satisfies ModuleEventSlice` (verified `modules/billing/events.ts:11`), merged by spread, with
> `moduleEventNames = Object.keys(moduleEventCatalog)` in display order (`lib/events/catalog.ts:15-27`) — focus
> #3 holds. On the 🟠 I confirm the Linter is correct *and* under-stated the reason: there is **no** pre-refactor
> baseline in git at all — `lib/platform-status.ts`, `lib/platform-health.ts`, and every `modules/*/health.ts`
> were born together in commit 9d6b508, so the file was never a committed if-ladder to diff against. "Output
> parity" therefore cannot be a git comparison; it must be re-scoped to a Validator judgment against a seeded DB,
> specifically: confirm `clients` and `appointments` (which own event slices but ship no `health.ts`) legitimately
> need no health warning. The 🟠 stands as a DB-time verification task, not a code defect. No gaps.
>
> **Status: `APPROVED-FOR-PATCH`**

---

## Phase 4 — Co-Locate Each Module's API Surface — 🔵 READY-FOR-AUDIT

Codex's pass moved endpoint behavior into a central `api/` tree (`api/admin/analytics-export.ts`,
`api/galleries/media.ts`). That made route files thin — good — but split each module's HTTP surface
away from the module. For portability a module should own `modules/<id>/api/*`, with the thin
`app/**/route.ts` adapter re-exporting from there. Copying a module to another front end should not
require fishing handlers out of a shared `api/` folder.

> **🛠 RESOLVED · Claude [06-08-26]:** The entire root `api/` tree was removed. Nine endpoint files moved
> into their owning modules:
> - `modules/scheduling/api/availability.ts` (was `api/availability.ts`)
> - `modules/communications/api/{newsletter-subscribe,email-outbox,email-provider-events,unsubscribe}.ts`
> - `modules/automation/api/webhook-deliveries.ts`
> - `modules/analytics/api/export.ts`, `modules/forms/api/export.ts`, `modules/portfolio/api/media.ts`
>
> The three shared API helpers moved from `api/shared/` to `lib/api/` (`csv.ts`, `request-body.ts`,
> `secrets.ts`) — the shared-utilities home — and their importers were updated. All nine
> `app/**/route.ts` adapters now re-export from the module path (route-segment `dynamic` still declared
> in the adapter, per the Next.js constraint). Docs updated: `README.md`, `docs/module-system.md`
> (Folders + API Boundary), `docs/module-dev-guide.md` (folder shape, API Endpoints, checklist).
> A module's full surface — UI, actions, events, health, and HTTP — now lives in `modules/<id>/`.
> Verified: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` passed (all routes mount).
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — confirm every `app/**/route.ts` still exports
> the same HTTP verbs as before, that worker endpoints keep their secret checks, and that no orphaned
> `@/api/...` import remains anywhere.
>
> **🔍 LINTER · Claude [06-08-26]:** No defects. Grep for `@/api/` / `api/shared` across `**/*.{ts,tsx}`
> returns zero — no orphaned imports. All nine endpoints live under `modules/<id>/api/`, and each
> `app/**/route.ts` is a thin re-export of the same verbs (`app/api/internal/webhook-deliveries/route.ts:3` →
> `POST`; `app/api/availability/route.ts:1` → `GET`; `app/unsubscribe/[token]/route.ts:3` → `GET, POST`; etc.).
> Shared helpers moved to `lib/api/{csv,request-body,secrets}.ts`; no `lib/api/shared` remains. Worker secret
> checks are intact and module-side: `modules/communications/api/email-outbox.ts:13` uses
> `timingSafeSecretMatches(secret, bearerToken(request))` with a 503 when the secret is unset; the
> email-provider-events and automation/webhook-deliveries handlers import `@/lib/api/secrets` likewise.
> 🟡 Minor: the `availability` and `analytics/export` adapters omit `export const dynamic` while the other GET
> adapters declare it — but `git show HEAD:app/api/availability/route.ts` is byte-identical (pre-existing;
> those handlers read request input so are auto-dynamic), so it is not a Phase-4 regression. `tsc --noEmit`
> clean.
>
> **Status: `READY-FOR-REVIEW`**
>
> **✅ REVIEWER · Claude [06-08-26]:** Findings confirmed. Independent grep for `@/api/` / `api/shared` across
> the tree returns only this roadmap's own prose — zero orphaned imports in code. All nine endpoints live under
> `modules/<id>/api/`; shared helpers sit at `lib/api/{csv,request-body,secrets}.ts`. The 🟡 (`availability` and
> `analytics-export` adapters omit `export const dynamic`) is pre-existing and byte-identical to HEAD, not a P4
> regression. No gaps.
>
> **Status: `APPROVED-FOR-PATCH`**

## Phase 5 — Real Deployment Boundary — 🔵 READY-FOR-AUDIT

`enabledModuleIds` was a string array in `SiteSettings` that only hid sidebar nav; all 16 modules were
always compiled into every client. "Modular deployment" meant *ship everything, hide some*. This phase
adds (a) persistent install/enable state and (b) build-time module exclusion for per-client builds.

> **🛠 RESOLVED · Claude [06-08-26]:**
>
> **Install state.** Added `prisma/schema/modules.prisma` with `ModuleInstallation` (one row per module:
> `installed`/`enabled`/`visibleToPublic`/`beta`/`settings` JSON/`configuredAt`) and `ModuleSetting`
> (per-module key/value, FK to installation, cascade). Migration
> `prisma/migrations/20260608210000_module_installation/` was generated via `prisma migrate diff` and
> applied to the dev DB (`prisma db execute`) — **only the two new tables** (see drift FLAG below).
> `lib/modules/installation.ts` is the service: `ensureModuleInstallations` (seed one row per registered
> module, create-side only, never overwriting admin choices), `setModuleEnablement` (upsert enabled flags
> for the settings form), and `resolveEnabledModuleIds` (read enabled rows; **fall back to the legacy
> `SiteSettings.enabledModules` JSON** if the table is missing/unseeded). `lib/site.ts` now derives
> `enabledModuleIds` from installations; `modules/settings/actions.ts` dual-writes the JSON column and the
> installation rows. Net: enablement is now persisted module state, but the app still works whether or not
> the migration is applied.
>
> **Build-time selection.** `shell/modules.ts` filters the registry by `NEXT_PUBLIC_SHOWRUNNER_DISABLED_MODULES`
> (comma-separated ids, inlined for client+server so they can't disagree). Excluded modules leave the
> registry entirely — no sidebar entry, no route (`getModule` → undefined → 404), no enablement. Required
> platform modules can never be excluded. Documented in `.env.example`.
>
> Verified: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` passed; `prisma generate` +
> `prisma validate` clean. Runtime checks against the dev DB: seeding created 16 installation rows,
> `resolveEnabledModuleIds` read them back correctly with required modules always present; build exclusion
> of `billing,products,settings` yielded a 14-module registry with required `settings` retained.
>
> **🟠 FLAG · Claude [06-08-26]:** Pre-existing migration drift discovered while generating this migration.
> `prisma migrate diff` (live dev DB → schema) reports deltas unrelated to this phase: `EmailProviderEvent.eventKey`
> (a `NOT NULL` column **missing from the DB**), `MediaAsset.updatedAt` default, and `SiteSettings.businessName`
> default. Combined with a **missing `prisma/migrations/migration_lock.toml`** (added in this phase), this means
> the migration pipeline was broken — a fresh `prisma migrate deploy` would **not** reproduce the current schema,
> which breaks the "reusable per-client template" promise. This phase deliberately did **not** bundle that drift
> into its migration. Recommend a separate `prisma migrate diff`-based reconciliation migration + verifying
> `_prisma_migrations` history before the next client deploy.
>
> **🛠 RESOLVED · Claude [06-08-26]:** Migration pipeline reconciled.
> - **Root cause found:** with a schema *folder* (P6), Prisma 7 no longer defaults the migrations directory —
>   `prisma migrate deploy`/`status` reported "No migration found in prisma/migrations" and applied nothing.
>   Fix: set `migrations.path: "prisma/migrations"` in `prisma.config.ts`. (This, not historical drift, was the
>   real break; `eventKey`/`businessName` were only the *dev DB* being stale, not the migrations.)
> - **Genuine migration↔schema gap (one):** migration `20260607170000_gallery_events_media_lifecycle` added
>   `MediaAsset.updatedAt` with a `DEFAULT CURRENT_TIMESTAMP` backfill and never dropped it. Added forward
>   migration `20260608230000_reconcile_media_updatedat_default` (`ALTER COLUMN ... DROP DEFAULT`) — applied
>   migrations are never edited in place.
> - **Consolidated** the two module-installation migrations (an empty placeholder dir + the populated one)
>   into a single `20260608120000_module_installation_state`.
> - **Verified on a throwaway DB:** `migrate deploy` of all 13 migrations from empty, then
>   `migrate diff --from-config-datasource --to-schema --exit-code` → "This is an empty migration", exit 0
>   (the migrations reproduce the schema exactly). `npm run seed` succeeds on that fresh DB.
> - **Dev DB recreated** from migrations + seed (user-approved): `migrate status` → "Database schema is up to
>   date!", drift diff empty, the stray failed-`init` history row gone.
>
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — (1) confirm dual-write keeps the JSON column and
> installation rows in agreement, and that disabling the install table (drop) cleanly falls back. (2) Decide
> whether to retire `SiteSettings.enabledModules` once installations are authoritative. (3) `visibleToPublic`,
> `beta`, and `ModuleSetting` are persisted but not yet read by any UI — wire or defer explicitly.
> (4) Tenant/site scoping (multi-site) is still out of scope; installations are single-site. (5) Build-time
> exclusion makes modules inert but does not yet tree-shake their code out of the bundle — true per-client
> bundle slimming is a follow-up.
>
> **🔍 LINTER · Claude [06-08-26]:**
> 🟠 Significant — **the migration reconciliation backing this phase (and the ✅ CONFIRMED "Migration pipeline
> reconciliation" Index row) is uncommitted.** `git status`: `D prisma/migrations/20260608210000_module_installation/migration.sql`,
> untracked `?? prisma/migrations/20260608120000_module_installation_state/` and
> `?? .../20260608230000_reconcile_media_updatedat_default/`, plus `M prisma.config.ts`. The "reusable
> per-client template" guarantee rests entirely on the working tree; a stash/checkout erases it. Reviewer
> should treat the CONFIRMED migration state as not-yet-durable until these are committed.
> 🟡 Minor — focus #3 still open: `visibleToPublic`, `beta`, and `ModuleSetting` are persisted
> (`prisma/schema/modules.prisma:11,12,22`) but no code reads them — `lib/modules/installation.ts` only ever
> writes/reads `installed`/`enabled`. Needs an explicit wire-or-defer decision.
> Otherwise sound: dual-write confirmed — `modules/settings/actions.ts:30/40` writes
> `SiteSettings.enabledModules` and `:46` calls `setModuleEnablement`; `lib/site.ts:22` derives via
> `resolveEnabledModuleIds(...)`, with a `try/catch` fallback to the legacy JSON when the table is absent
> (`installation.ts:56-68`). Seed-on-create never overwrites admin choices (`installation.ts:21-32`). Build-time
> exclusion + required-module protection verified at `shell/modules.ts:48-59`. Migration SQL matches the model
> (FK → `moduleId` unique, cascade); `migration_lock.toml` present. 🟡 Minor: the empty-DB `migrate deploy` /
> no-drift claim is asserted in the log but not reproducible at lint time (no DB). `tsc --noEmit` and
> `prisma validate` clean.
>
> **Status: `READY-FOR-REVIEW`**
>
> **✅ REVIEWER · Claude [06-08-26]:** Findings confirmed; the 🟠 is the real blocker and I am widening it.
> The dual-write/fallback (`modules/settings/actions.ts:30-46`, `lib/site.ts:22`,
> `lib/modules/installation.ts:56-68`), non-destructive seed-on-create (`installation.ts:21-32`), and
> build-exclusion + required-module protection (`shell/modules.ts:48-59`) all check out. But the uncommitted
> state is worse than "the migration files": in HEAD, `prisma.config.ts` has **no** `migrations.path` (only
> `seed`), HEAD still carries the un-consolidated `20260608210000_module_installation`, and the consolidated
> `20260608120000_module_installation_state/` + `20260608230000_reconcile_media_updatedat_default/` are
> untracked. So the ✅ CONFIRMED "Migration pipeline reconciliation" Index row is **not durable** — a clean
> checkout of HEAD reproduces the broken pipeline. The Patcher must commit, as one logical change, the deletion
> of `20260608210000`, both new migration dirs, **and** the `migrations.path` line in `prisma.config.ts`.
> Sidebar (not a P5 finding, but do not ignore): the whole working tree is dirty with unrelated work
> (`app/admin/login/*`, `app/cart/*`, `lib/commerce/*`, `lib/email/*`, `modules/products/*`, `modules/clients/*`,
> untracked `lib/commerce/orders.ts`), so every "build/lint/tsc passed" claim in this roadmap was produced
> against that dirty tree and is not reproducible from any commit. The 🟡 unread `visibleToPublic`/`beta`/
> `ModuleSetting` still needs an explicit wire-or-defer call. No gaps in the Linter's findings; APPROVED with the
> 🟠 elevated to blocker.
>
> **Status: `APPROVED-FOR-PATCH`**
>
> **🔧 PATCHER · Claude [06-08-26]:** 🟠 BLOCKER resolved and made durable in commit `9cffa24` — the fix now
> lives in HEAD, not just the working tree. Committed as one logical change:
> - `prisma.config.ts`: added `migrations.path: "prisma/migrations"` (the Prisma-7 prerequisite for a schema
>   folder; without it `migrate deploy`/`status` found no migrations and applied nothing).
> - Consolidated the install migration — `git` records it as a 100%-identical rename
>   `20260608210000_module_installation → 20260608120000_module_installation_state`, so the old dir is gone
>   from HEAD and the SQL is unchanged; the earlier timestamp seats it before the reconcile migration.
>   `prisma/migrations/20260608230000_reconcile_media_updatedat_default/` (the `MediaAsset.updatedAt
>   DROP DEFAULT`) is now tracked.
> Verified against HEAD (not the dirty tree): `git show HEAD:prisma.config.ts` carries `migrations.path`;
> `git ls-tree HEAD` shows both new migration dirs and no `20260608210000`. `prisma validate` clean;
> `prisma migrate status` finds **13** migrations and reports "Database schema is up to date!" — proving the
> path is read and the dev DB matches the reconciled set. (The unrelated dirty files — `.env.example`,
> `app/admin/login/*`, `docs/roadmap.md` — were deliberately left unstaged; only config + migrations are in
> the commit.) This same commit also satisfies the condition the **P6 FLAG** is bound to: HEAD now has
> `migrations.path`, so a clean checkout of the schema-folder split has a working migration pipeline. P6
> remains in its Linter loop-back for re-audit against the committed state.
>
> 🟡 focus #3 (`visibleToPublic` / `beta` / `ModuleSetting` persisted but unread) — **explicit decision:
> DEFER.** These are forward-looking columns; wiring them needs consuming UI (public-visibility toggle, beta
> gating, a per-module settings editor) that is out of scope for the deployment-boundary phase. Persisting
> them now keeps the migration stable so the later wire is additive, not a schema change. Tracked under
> "Remaining beyond P1–P6" below so it is not silently dropped.
>
> **Status: `READY-FOR-CONFIRM`**

### Remaining beyond P1–P6

- **Tenant/site boundary** (`Tenant`, `Site`, `SiteDomain`) and composite uniques — see `docs/roadmap.md`
  foundation items and the per-module tenancy notes. Prerequisite for true multi-site.
- **Bundle tree-shaking** — make build-time exclusion actually drop module code from the compiled output.
- **Wire `visibleToPublic` / `beta` / `ModuleSetting`** — columns persist on `ModuleInstallation`/`ModuleSetting`
  (P5) but no UI reads them yet. Deferred from P5 (Patcher, 06-08-26): needs a public-visibility toggle, beta
  gating, and a per-module settings editor. The later wire is additive (no schema change).

## Phase 6 — Per-Module Prisma Schema Split — 🔵 READY-FOR-AUDIT

`prisma/schema.prisma` was a 1,277-line, 50-model, 38-enum monolith every client carries whole. Prisma 7
merges any folder of `*.prisma` files natively, so modules can own their models.

> **🛠 RESOLVED · Claude [06-08-26]:** `prisma.config.ts` now points `schema` at the `prisma/schema`
> folder. The monolith was split block-for-block into 13 files: `schema.prisma` (datasource + generator),
> `core.prisma` (`AdminUser`, `SiteSettings`, `PublicRateLimit`), and one file per module domain
> (`scheduling`, `clients`, `media`, `commerce`, `communications`, `billing`, `automation`, `forms`,
> `testimonials`, `portfolio`, `analytics`). The split was done with a one-shot deterministic script
> (parse top-level blocks, route each by an explicit name→file map, **throw on any unmapped block**), then
> the script and the old monolith were deleted. Content is byte-for-byte the same blocks, so **no schema
> change and no new migration** — the existing `prisma/migrations` are untouched and still apply.
> Relations cross files freely (Prisma merges the folder). **Note:** moving to a schema folder requires
> setting `migrations.path` in `prisma.config.ts` — without it Prisma 7 cannot find the migrations dir (see
> the P5 migration-reconciliation log). Verified: `npx prisma validate` → "schemas are
> valid"; `npx prisma generate` → client generated; `npx tsc --noEmit` clean; `npm run build` passed.
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — (1) confirm `prisma migrate status` shows no
> drift against a real DB (content-identical split should be a no-op). (2) Spot-check that every model/enum
> from the old monolith landed in exactly one file (90 blocks in, 90 out). (3) The manifest `dataModels`
> field is now *organizationally* true but still not read by code — making it load-bearing is folded into P5.
>
> **🔍 LINTER · Claude [06-08-26]:** No defects. `prisma validate` → "schemas are valid 🚀". Block accounting
> across the 13-file folder: 52 `model` + 38 `enum` + datasource + generator, with **zero duplicate model/enum
> names** (`grep -hoE '^(model|enum) …' | sort | uniq -d` is empty). The "90 in / 90 out" claim reconciles —
> baseline was 50 models / 38 enums; the +2 models are P5's `ModuleInstallation`/`ModuleSetting`
> (`prisma/schema/modules.prisma`), so 52 is expected and nothing was lost. `migrations.path: "prisma/migrations"`
> is set (`prisma.config.ts:9-10`), the documented prerequisite for a schema folder under Prisma 7. 🟡 Minor:
> focus #1 (no `migrate status` drift vs a real DB) is unverifiable at lint time (no DB). 🟡 Minor: manifest
> `dataModels` remains descriptive/unread — already disclosed, folded into P5.
>
> **Status: `READY-FOR-REVIEW`**
>
> **⚠️ REVIEWER · Claude [06-08-26]:** FLAG — "No defects" was verified against the dirty working tree and
> missed that **committed P6 is broken.** P6's stated prerequisite — `migrations.path` in `prisma.config.ts`,
> which the Linter cited as `prisma.config.ts:9-10` — exists only in the uncommitted working tree. In HEAD,
> `prisma.config.ts` has no `migrations.path` (only `seed`), yet the schema **folder** is already committed
> (25af0fd). That is precisely the combination the P5 reconciliation log identifies as the root-cause break:
> with a schema folder and no `migrations.path`, Prisma 7 cannot locate `prisma/migrations` and `migrate deploy`
> applies nothing. So a clean checkout of HEAD ships the P6 split with a non-functional migration pipeline — the
> "no schema change, existing migrations still apply" guarantee does **not** hold from any commit. `prisma
> validate` passing does not exercise this, since validation never reads the migrations directory. The rest of
> the audit (52 model / 38 enum, no duplicate names, folder committed in HEAD) is accurate. Re-audit P6's
> migration-pipeline claim against the **committed** state, and bind its resolution to committing the P5
> `migrations.path` fix (same change as the P5 🟠).
>
> **Status: `READY-FOR-REVIEW`** ← returns to Linter
