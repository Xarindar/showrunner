# Modular Deployment Refactor Roadmap

Last researched: June 8, 2026 · Last audit pass: June 8, 2026

This roadmap follows up on `showrunner_refractor.md` (Codex, 06-08-26). That pass consolidated
cross-cutting *helpers* (env parsing, FormData, CSV, URL validation) and split route mounting from
endpoint behavior. It did not touch the **structural module-ownership** seams that decide whether a
module can be dropped into — or pulled out of — a client front end without editing central files.

This file tracks closing those seams. It reuses the audit ledger protocol from `docs/roadmap.md`.

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
| 1 | Convention-based module page loader (drop the hand-maintained loader list) | 🔵 READY-FOR-AUDIT | RSC/Turbopack trade-off documented; needs audit re-verify | 06-08-26 |
| 2 | Single-source module icons (collapse the type↔map duplication) | 🔵 READY-FOR-AUDIT | — | 06-08-26 |
| 3 | Module-owned health checks + events (retire the central if-ladder and catalog) | 🔵 READY-FOR-AUDIT | parity of warning/event output needs audit re-verify | 06-08-26 |
| 4 | Co-locate each module's API surface inside `modules/<id>/api` | 🔵 READY-FOR-AUDIT | central `api/` tree removed; needs audit re-verify | 06-08-26 |
| 5 | Real deployment boundary (`ModuleInstallation`/`ModuleSetting`, build-time selection) | 🔵 READY-FOR-AUDIT | install records + build-time exclusion live; ⚠️ pre-existing migration drift flagged | 06-08-26 |
| 6 | Per-module Prisma schema split (`prismaSchemaFolder`) | 🔵 READY-FOR-AUDIT | folder split done; migrations unchanged; needs audit re-verify | 06-08-26 |

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
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — (1) confirm dual-write keeps the JSON column and
> installation rows in agreement, and that disabling the install table (drop) cleanly falls back. (2) Decide
> whether to retire `SiteSettings.enabledModules` once installations are authoritative. (3) `visibleToPublic`,
> `beta`, and `ModuleSetting` are persisted but not yet read by any UI — wire or defer explicitly.
> (4) Tenant/site scoping (multi-site) is still out of scope; installations are single-site. (5) Build-time
> exclusion makes modules inert but does not yet tree-shake their code out of the bundle — true per-client
> bundle slimming is a follow-up.

### Remaining beyond P1–P6

- **Tenant/site boundary** (`Tenant`, `Site`, `SiteDomain`) and composite uniques — see `docs/roadmap.md`
  foundation items and the per-module tenancy notes. Prerequisite for true multi-site.
- **Migration pipeline reconciliation** — resolve the drift FLAG above so `prisma migrate deploy` reproduces
  the schema from zero.
- **Bundle tree-shaking** — make build-time exclusion actually drop module code from the compiled output.

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
> Relations cross files freely (Prisma merges the folder). Verified: `npx prisma validate` → "schemas are
> valid"; `npx prisma generate` → client generated; `npx tsc --noEmit` clean; `npm run build` passed.
> **🔵 READY-FOR-AUDIT · Claude [06-08-26]:** Audit focus — (1) confirm `prisma migrate status` shows no
> drift against a real DB (content-identical split should be a no-op). (2) Spot-check that every model/enum
> from the old monolith landed in exactly one file (90 blocks in, 90 out). (3) The manifest `dataModels`
> field is now *organizationally* true but still not read by code — making it load-bearing is folded into P5.
