# UI Refinement Roadmap

Last researched: June 16, 2026 · Last audit pass: — (not yet built)

This roadmap covers the **UI refinement pass** on the surfaces Showrunner actually owns — primarily the
**protected admin** (every client's operator lives here) and the secondary public/embed surfaces we
still render. The goal is to raise these to **Vercel/Geist-grade spacing, rhythm, and typography**
without feeling bland or clinical, on a single documented design-system layer, with **reserved
dimensions / zero layout shift as the prime rule.**

**What this is _not_:** Showrunner is a **modular backend that powers clients' own custom-built front
ends** (via the §1b embed + public API layer). We are **not** building a Squarespace/Shopify site
builder, a page/section model, a drag-and-drop editor, or an end-user theme editor. The limited theme
presets exist only to make **adapting our surfaces to a client's brand** quick — that is the entire
scope of "theming" here.

It **reuses the audit ledger protocol from `docs/roadmap.md`** (same as `docs/refractor-roadmap.md`)
for *roles* (ENGINEER · LINTER · REVIEWER · PATCHER · VALIDATOR) and commit discipline — read that
file's "AGENT INSTRUCTIONS" header for your role, then come back here. **But this file deliberately
diverges from roadmap.md on file mechanics to stay cheap to read** (authorized by the owner,
06-16-26). The lean rules are in "How agents use this file" below; follow them here, not roadmap.md's
append-only convention.

> **PRIME RULE — assets never change size (non-negotiable).** If five cards sit in a grid and only
> three have an optional field populated, **all five cards stay identical in size.** If a piece of
> data *can* exist later, **reserve its space now.** A button click must not resize its container; a
> populated state must not be taller than its empty state; loading skeletons must match the final
> rendered dimensions exactly. This is `GATE-CLS` below and it blocks every item from CONFIRMED. It
> operationalizes the standing rule in [docs/ui-design-rules.md](docs/ui-design-rules.md) ("Use fixed
> or reserved dimensions … If content can exist later, reserve space for it now").

> **Design Directive:** one token source, one primitive library. Every surface draws spacing, type,
> color, and elevation from the [lib/theme/tokens.ts](lib/theme/tokens.ts) layer (U1) and renders
> through the `components/ui/*` primitives (U2). No new ad-hoc class in
> [app/globals.css](app/globals.css), no inline one-off spacing. Refine in place; do not fork.

---

## Why this file exists (the gap)

The app is functionally complete and visually *correct* — but **clinical, inconsistent, and not aligned
to a real spacing system:**

- **No shared design-system layer.** UI is hand-authored across a 2,500-line
  [app/globals.css](app/globals.css) with bare classes (`.card`, `.button`, `.field`, `.pill`,
  `.empty-state`) reused by copy. There are no typed primitives, so spacing, radii, and states drift
  page to page.
- **Spacing/rhythm is ad-hoc.** Inline `style={{ marginTop: 28 }}` / `gap: 12` litter the surfaces
  (e.g. [app/page.tsx](app/page.tsx)); there is no spacing scale, no vertical rhythm, no type scale —
  so the result reads flat and "default," not considered.
- **The reserved-dimension rule is stated but not enforced.** [docs/ui-design-rules.md](docs/ui-design-rules.md)
  requires fixed/reserved dimensions and equal-height rows, but nothing in code guarantees it — card
  grids and tables shift when optional data is present vs absent.
- **Theme is already the right size.** 3 presets + a primary-color override
  ([lib/theme/tokens.ts](lib/theme/tokens.ts)) is exactly the brand-adaptation surface we want — it
  just needs re-tuning against the expanded token layer, not expansion into an editor.

The job: a **design-foundation → primitive-library → surface-refinement** pass that makes everything
feel intentional and premium, with zero layout shift, while keeping the brand-adaptation presets
bounded. Presentation only — no business-logic, schema, or data changes beyond the token layer.

---

## How agents use this file (read this once, then stop)

This file is built so you read **~2 KB, not the whole thing.** Four rules:

**1 · Read budget — do this, not more.**
1. Read the **Status Index** (the routing table — it is the menu).
2. Read **only the item(s) you are assigned**, by grepping the item ID (e.g. search `U3b`). Each item
   is self-contained: its deps and gates are on its META line.
3. Read **Cross-Cutting Gates** once.
4. Do **not** read other items, the Research Basis, or `docs/ui-plan-archive.md` unless your item
   points you there. The whole plan is in scope to *the team*, not to *you this turn*.

**2 · Every item is addressable.** Headings carry a stable ID (`U1a`, `U3b`, …) and a one-line
machine-readable META line directly beneath, so state is parseable without reading prose:

```
META: U1a STATUS=⬜PENDING DEPS=— GATES=cls,rhythm,a11y COMMIT=— OWNER=—
```

Grep `META:` for a full state dump of the file. Update your item's META line when you change its status.

**3 · History discipline — the reason this file stays cheap (divergence from roadmap.md).**
roadmap.md is append-only and never rewrites log blocks; that is exactly why it is 400 KB and expensive
to open. Here, log lines are append-only **only while an item is in flight.** The moment an item reaches
`✅ CONFIRMED`, the implementer **collapses** its in-flight ENGINEER/AUDIT/RESOLVED lines into a single
`CONFIRMED` line (commit + one sentence on what holds + the key `file:line`) and moves the full thread
**verbatim** into `docs/ui-plan-archive.md` under the item ID. The live file then only ever holds:
*pending specs + in-flight threads + one-line confirmations.* You never pay tokens for resolved history
unless an item explicitly sends you to the archive.

**4 · Lifecycle + log format (compact).**
`⬜ PENDING → 🔵 READY-FOR-AUDIT → 🔍 AUDITED → 🛠 RESOLVED → ✅ CONFIRMED`; `⚠️ FLAGGED` = open
blocker / fix that did not land. Severity inside AUDIT lines: `🔴 BLOCKER · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW`.
Append in-flight log lines under the item's `LOG:` marker, oldest first, one line each:

```
LOG:
🛠 ENG <author> [MM-DD-YY] <commit>: what was built; key files; decisions for the auditor.
🔍 AUD <author> [MM-DD-YY]: 🔴 file:line — finding + fix. 🟡 file:line — …
🛠 RES <author> [MM-DD-YY] <commit>: what changed.
✅ CNF <author> [MM-DD-YY]: re-verified file:line — what holds.   ← then collapse + archive
```

---

## Status Index

The routing table — the only thing every agent reads in full. **Status + deps + one-line scope only;**
findings and history live in each item's body LOG / the archive, never here. Keep cells to one line.

| ID | Item | Status | Deps | Scope (one line) |
|---|---|---|---|---|
| `U1a` | Token layer + spacing/type scale | ✅ CONFIRMED | — | Extend `lib/theme/tokens.ts`: spacing + type scales, surfaces, states, elevation; one source via `themeToCssVars`. |
| `U1b` | Visual direction ("de-clinical") | ✅ CONFIRMED | U1a | Warmth pass — neutrals, accent usage, depth, type hierarchy; the look the rest of the pass follows. |
| `U2a` | Core primitives | ✅ CONFIRMED | U1a | `components/ui/*` Button/Card/Field/Badge/Table/Tabs on tokens; reserved dims baked in. |
| `U2b` | State & feedback primitives | ✅ CONFIRMED | U2a | Skeleton/EmptyState/Toast/Dialog/StatTile; empty+sparse+dense+error each. |
| `U2c` | Reserved-dimension utilities | ✅ CONFIRMED | U2a | Equal-height Grid, fixed/min-height Card, reserved-slot wrappers — the `GATE-CLS` enforcement layer. |
| `U3a` | Admin shell chrome | ✅ CONFIRMED | U2a | Sidebar/top bar/page headers/layout onto tokens + primitives; Vercel rhythm; fixed dims. |
| `U3b` | Admin module pages | 🛠 RESOLVED | U2a,U2b,U2c | Re-skin scheduling/products/clients/forms/billing/etc. pages, tables, forms, detail views. |
| `U3c` | Admin dashboard + states | ⚠️ FLAGGED | U2b,U2c | Dashboard, stat tiles, and the loading/empty/error state for every admin surface. |
| `U4a` | Rendered marketing surfaces | 🔍 AUDITED | U2a,U2b | Homepage/testimonials/galleries reference surfaces; brand-adaptive via presets. |
| `U4b` | Rendered transactional surfaces | 🛠 RESOLVED | U2a,U2b,U2c | shop/product/cart, book flow, forms, billing, portal; reserved dims on cards/slots; all states. |
| `U4c` | Embed widget visual parity | ✅ CONFIRMED | U4a,U4b | E3 web component / E4 iframe reuse the same tokens so embedded ≈ first-party. |
| `U5a` | Re-tune theme presets | ✅ CONFIRMED | U1a | Re-fit the 3 presets to the new token layer; contrast-safe; primary flows everywhere. |
| `U5b` | Preset authoring + bounds | ✅ CONFIRMED | U5a | Document "add a preset"; keep bounded — brand adaptation, **not** an editor. |
| `GATE-CLS` | Reserved dims / zero layout shift | 🔁 ONGOING | — | **Prime rule.** Blocks every CONFIRMED; equal-size cards, reserved slots, skeletons match final size. |
| `GATE-A11Y` | WCAG 2.2 AA | 🔁 ONGOING | — | Blocks every CONFIRMED; contrast, visible focus, target size, keyboard, labelled controls. |
| `GATE-RHYTHM` | Vercel spacing/type conformance | 🔁 ONGOING | — | Blocks every CONFIRMED; on the scale, no ad-hoc inline spacing, intentional hierarchy. |

**Critical path:** `U1a → U1b → U2a → U2b/U2c → U3a → U3b/U3c`. **Parallelizable after U2c:** U4a/b/c
(rendered surfaces) and U5a/b (presets). Admin (U3) is the priority — it is the surface every client
operates daily; rendered/embed surfaces (U4) are secondary; presets (U5) ride alongside U1.

---

## Product Direction

Showrunner is a **modular backend.** Clients build their own custom front ends and consume our modules
through the confirmed §1b embed + public API layer. The UI we own and must make excellent:

1. **The admin** — the universal operator surface shipped to every client. The crown jewel of this
   pass: premium spacing, real hierarchy, considered density, zero layout shift.
2. **The rendered reference + embed surfaces** — the public pages and widgets we still render, kept to
   the same bar and brand-adaptive via presets, so a client using our rendering or an embedded widget
   gets a polished result.
3. **Brand adaptation, bounded** — the 3 presets + primary color stay exactly that small. They make a
   surface match a client's brand in one setting; they are not a design tool.

Discipline that does not change: **PCI SAQ-A**, **tenancy-scoped**, **role-aware**. This pass is
presentation-only — no business-logic, schema, or data changes beyond the U1 token layer.

---

## Research Basis

The standing [docs/ui-design-rules.md](docs/ui-design-rules.md) and [docs/theme-tokens.md](docs/theme-tokens.md)
are the design contract; this roadmap *executes* them. Anchors:

- **Vercel Geist design system + web interface guidelines.** Target visual language for spacing, type,
  and interaction (Geist Sans for UI, Geist Mono for metrics/timestamps/amounts per the design rules).
  <https://vercel.com/geist/introduction>, <https://vercel.com/design/guidelines>
- **Spacing & type scale.** A consistent base unit (4/8px) and a modular type scale are what separate
  "intentional" from "default/clinical." Geist typography reference. <https://examples.vercel.com/geist/typography>
- **Layout stability (the Prime Rule, measurable).** Cumulative Layout Shift — reserve space for media
  and late-arriving content; size every image; never let content reflow. Target CLS ≈ 0.
  <https://web.dev/articles/cls>, <https://web.dev/articles/optimize-cls>
- **Reserved-dimension / skeleton patterns.** Skeletons mirror final layout dimensions; equal-height
  grid rows beat masonry — codified in [docs/ui-design-rules.md](docs/ui-design-rules.md); NN/g on
  consistency + perceived performance. <https://www.nngroup.com/articles/skeleton-screens/>
- **Accessibility gate.** WCAG 2.2 AA — contrast, focus visibility, target size, keyboard operability.
  <https://www.w3.org/TR/WCAG22/>
- **Animation discipline.** Animate only color, border, shadow, opacity, transform — never
  `transition: all` (design rules) — so motion never causes reflow/shift.

---

## UI Refinement Roadmap

### U1. Design Foundation

`META: U1a,U1b STATUS=✅CONFIRMED DEPS=— GATES=cls,rhythm,a11y OWNER=PATCHER AUDITOR=LINTER`

The single token source the whole app draws from. Land first — every primitive and surface depends on it.

**U1a — Token layer + spacing/type scale.** Extend [lib/theme/tokens.ts](lib/theme/tokens.ts) from
`{colors, radius, shadow, type, motion, layout}` to a full contract: a **spacing scale** (4/8px base,
`--space-1…12`), a **type scale** (display → caption with matched line-heights), **semantic surface
levels** (page/surface/raised/sunken), **state colors** (hover/active/focus/disabled), and an
**elevation scale** (borders + the existing shadows, used deliberately for depth). Keep
`themeToCssVars()` as the single application point (already consumed by [app/page.tsx](app/page.tsx)
and the admin shell — extend, don't fork). All three existing presets must keep rendering
byte-identically until a token is intentionally changed. Every value gets a scale token to map onto, so
U2/U3 can retire the inline spacing.

**U1b — Visual direction ("de-clinical").** A short codified direction doc + 2–3 reference screens that
define how we move from "correct but flat" to "premium": warmer neutrals (the current `#f4f7f5`/grey
palette reads sterile), intentional accent usage (the presets' `accent` is barely used today), real
**typographic hierarchy** (size + weight + color, not just bold), **depth** via subtle layered surfaces
and borders rather than flat panels, and considered whitespace rhythm. This sets the bar once — U3/U4
re-skin toward it instead of each page reinventing the look.

`LOG:`
🛠 ENG Codex [06-17-26] this commit: expanded `lib/theme/tokens.ts` with spacing/type/surface/state/elevation/reserved-layout tokens, retuned presets, kept `themeToCssVars()` as the single CSS-var application point, and added `docs/ui-visual-direction.md`.
🔍 AUD Claude [06-16-26]: U1a — token contract is sound (scales/surfaces/states/elevation present; `themeToCssVars()` is the single application point and brand override flows through derived hover/active/focus/sidebar). 🟡 app/globals.css:1-74 re-hard-codes the entire `clean` preset that lib/theme/tokens.ts:100-148 already defines → two sources for the default theme; retuning `clean` silently desyncs the SSR `:root` fallback (and :root `--color-admin-sidebar` line 13 = light surface vs themeToCssVars:367 = dark, so static fallback ≠ runtime). 🟢 lib/theme/tokens.ts:83-87 `--type-h3` 1rem vs `--type-body` 0.94rem is a 0.06rem step — near-zero h3/body hierarchy (GATE-RHYTHM "intentional hierarchy"). U1b 🟡 docs/ui-visual-direction.md delivers prose only — the item asked for "2–3 reference screens"; none exist as actual screens/mockups.
🛠 RES Codex [06-16-26] 0e4555d/76e0617/8103555: moved root theme application to `app/layout.tsx:32` and removed duplicated clean values from `app/globals.css:1`; widened `--type-h3` in `lib/theme/tokens.ts:80`; added concrete reference screen specs in `docs/ui-visual-direction.md:16`.
✅ CNF Claude [06-16-26]: validated against PATCHER commits through `3c5f75a`; refs as of that commit. U1a re-verified — `themeToCssVars(settings)` applied at the root `<body>` (app/layout.tsx:32); `:root` (app/globals.css:1-14) only aliases the `--color-*` tokens and no longer hard-codes the `clean` preset → one source for the default theme; `--type-h3` 1.12rem vs `--type-body` 0.94rem (lib/theme/tokens.ts:84) — hierarchy widened from ~0.06rem to 0.18rem. U1b — docs/ui-visual-direction.md ships 3 concrete reference screens (admin dashboard / module page / public+embed) with reserved dimensions, not prose only. `npm run build` green.

---

### U2. Primitive Component Library

`META: U2a,U2b,U2c STATUS=✅CONFIRMED DEPS=U1a GATES=cls,a11y,rhythm OWNER=PATCHER AUDITOR=LINTER`

The typed substrate every surface re-skins onto. Built on U1 tokens, with **reserved dimensions and the
four required states baked in** so the rules are automatic, not per-page discipline.

**U2a — Core primitives.** Extract the recurring patterns from [app/globals.css](app/globals.css) into
typed React components under `components/ui/` — Button, Card, Field/Input/Select/Textarea, Badge/Pill,
Table, Tabs. Token-driven only (no hard-coded color/spacing; ≤8px radius per design rules). Refactor in
place: migrate call sites incrementally so nothing regresses (mirror the §1 tenancy-retrofit slice
discipline).

**U2b — State & feedback primitives.** Skeleton, EmptyState, Toast, Dialog/Sheet, StatTile — plus the
gate that **every repeated surface ships empty + sparse + dense + error states**
([docs/ui-design-rules.md](docs/ui-design-rules.md)). Skeletons mirror final dimensions exactly (feeds
`GATE-CLS`).

**U2c — Reserved-dimension utilities (the `GATE-CLS` enforcement layer).** The primitives that make the
Prime Rule automatic: an **equal-height `Grid`** (all cards in a row share height regardless of optional
content), a **`Card` with fixed/min heights + reserved slots** (an absent optional field still occupies
its space), and **reserved-slot wrappers** for any field that *can* exist later. A populated card and an
empty card in the same grid are pixel-identical in size; a button click never resizes its container.
This turns "assets never change size" from a rule into something the component API guarantees, so U3/U4
get it for free.

`LOG:`
🛠 ENG Codex [06-17-26] this commit: added `components/ui/*` primitives for buttons, cards, fields, badges, tables, tabs, layout, skeletons, empty/feedback states, stat tiles, equal grids, and reserved slots; mapped them to tokenized `.ui-*` CSS in `app/globals.css`.
🔍 AUD Claude [06-16-26]: primitives are token-driven and reserved-dim-aware, but adoption is near-zero. U2a 🟠 `StatTile`/`Card`/`Tabs`/`Badge` have no call sites; only `ButtonLink`/`EmptyState`/`EqualGrid`/`Table`/`Cluster` are consumed (2 files total) — and dashboard hand-rolls `.ui-stat-tile` markup (modules/dashboard/page.tsx:125-144) instead of `<StatTile>` (components/ui/states.tsx:55), duplicating an existing resource (Shared-Rules violation). 🟡 brand-new `.ui-*` rules mix legacy aliases (`--line`/`--panel`/`--ink`, app/globals.css:259-285) with the new `--color-*` names — split vocabulary. 🟡 `Table` + `.ui-table{min-width:720px}` (app/globals.css:514) ship no overflow wrapper for reuse. U2b 🟠 `Toast` and `Dialog/Sheet` are listed in scope but absent from components/ui (index.ts:1-8); `Skeleton` exists (states.tsx:9-15) but has zero call sites, so "skeletons mirror final dimensions" (the GATE-CLS feed) is never exercised. U2c 🟠 `ReservedSlot` and `Card` have zero call sites and only `EqualGrid` is used (dashboard) — the layer meant to make the Prime Rule automatic for U3/U4 is not wired into U3/U4, so it currently guarantees nothing on real surfaces. 🟡 `Card` pins header/footer rows at 28px with card `overflow:hidden` (components/ui/card.tsx:23-26, app/globals.css:376) → a reserved slot taller than 28px clips.
🛠 RES Codex [06-16-26] 6af69ad/609a121: added `Dialog`/`Sheet` and `Toast` primitives in `components/ui/index.ts:4`; moved `Table` overflow into `components/ui/table.tsx:6`; normalized `.ui-*` rules and unclipped card slots in `app/globals.css:370`; routed dashboard stats/badges/cards/loading through primitives at `modules/dashboard/page.tsx:132` and `shell/loading-states.tsx:1`; added `TabLink` and used it for appointment view tabs at `modules/appointments/page.tsx:456`.
✅ CNF Claude [06-16-26]: validated against PATCHER commits through `3c5f75a`. U2a/U2b/U2c re-verified — `Toast`/`ToastRegion` (components/ui/toast.tsx) and `Dialog`/`Sheet`/`DialogClose` (components/ui/dialog.tsx) exist and are exported (components/ui/index.ts); `Table` owns the horizontal overflow wrapper (components/ui/table.tsx → `.ui-table-wrap{overflow-x:auto}`); card header/footer no longer clip — `.ui-card` rows are `minmax(28px,auto)` and `.ui-card-slot` uses `min-height:28px`; the `.ui-*` primitive block uses `--color-*` token names only (no legacy `--line`/`--panel`/`--ink`). Real call sites exist: StatTile/Card/Badge/Table (modules/dashboard/page.tsx), Tabs/TabLink (modules/appointments/page.tsx:454,456), Skeleton (shell/loading-states.tsx). Dashboard no longer hand-rolls `.ui-stat-tile` or `.pill`.

---

### U3. Admin Shell Refinement

`META: U3a,U3b,U3c STATUS=⚠️FLAGGED DEPS=U2a,U2b,U2c GATES=cls,a11y,rhythm OWNER=ENG AUDITOR=LINTER`

The priority of the whole pass — the admin is what every client's operator uses daily. Re-skin it onto
U1 tokens + U2 primitives. **No behavior changes**; presentation only.

**U3a — Shell chrome.** The sidebar ([shell/admin-sidebar.tsx](shell/admin-sidebar.tsx)), top bar, page
headers, and protected layout ([app/admin/(protected)/layout.tsx](app/admin/\(protected\)/layout.tsx))
onto the spacing scale and primitives, with the U1b visual direction (depth, hierarchy, warmth). Fixed
sidebar width and reserved header dimensions so nav and chrome never shift.

**U3b — Module pages.** Re-skin the per-module admin pages (`modules/*/page.tsx`: scheduling, products,
clients, forms, billing, communications, portfolio, analytics, etc.), their tables, forms, and detail
views onto the primitives. Consistent density and rhythm across modules; **every card grid and table
uses the U2c equal-height/reserved primitives** so rows don't shift when optional fields vary (a client
with no phone, a product with no sale price, a booking with no note).

**U3c — Dashboard + states.** The admin dashboard, stat tiles, and the loading/empty/error state for
each admin surface — designed, not default. Skeletons match final dimensions; empty states have intent;
error states are recoverable.

`LOG:`
🛠 ENG Codex [06-17-26] this commit: tokenized admin chrome rhythm in `app/globals.css`, removed the sidebar inline logout layout in `shell/admin-sidebar.tsx`, migrated dashboard stats/tables/buttons/empty states to primitives in `modules/dashboard/page.tsx`, and mechanically moved repeated admin module font/muted presentation overrides onto tokenized utility classes.
🔍 AUD Claude [06-16-26]: U3a 🟡 shell/admin-sidebar.tsx:92 still renders legacy `.button.ghost`, not the `Button` primitive — chrome was tokenized via CSS but not migrated "onto primitives" as scoped (fixed sidebar width via `--layout-admin-sidebar` is fine). U3b 🔴 BLOCKER — the re-skin "onto the primitives" did not happen: no `modules/*/page.tsx` imports `components/ui`, and 286 inline `style={{…spacing…}}` remain across 37 files (e.g. modules/billing/page.tsx:670, modules/appointments/page.tsx:595, modules/products/page.tsx). Zero `EqualGrid`/`Card`/`ReservedSlot` in any module page, so "every card grid and table uses the U2c equal-height/reserved primitives" is unmet and GATE-CLS + GATE-RHYTHM ("no ad-hoc inline spacing") fail — the commit only mapped legacy classes to tokens. U3c — dashboard genuinely migrated (EqualGrid/EmptyState/Table/ButtonLink). 🟠 but no loading or error state: Skeleton is unused, dashboard is `force-dynamic` with no `loading.tsx`, yet the item requires a designed loading/empty/error state for every admin surface. 🟡 dashboard hand-rolls `.ui-stat-tile`/`.pill` (modules/dashboard/page.tsx:20-24,125-144) instead of `<StatTile>`/`<Badge>`.
🛠 RES Codex [06-16-26] 6af69ad: fixed U3a sidebar logout via `Button` at `shell/admin-sidebar.tsx:93` and U3c dashboard stat/badge/loading primitive bypasses at `modules/dashboard/page.tsx:132` and `shell/loading-states.tsx:1`; U3b remains ⚠️FLAGGED because broad module-page inline spacing/primitive migration is not complete.
🛠 RES Codex [06-17-26] 000a24b: partial U3b patch migrated analytics and users admin pages onto primitives (`modules/analytics/page.tsx:9`, `modules/users/page.tsx:7`) with token utility support in `app/globals.css:387`; remaining U3b blockers include billing/products/settings/clients/forms/scheduling components and other module pages still using legacy cards/tables/fields/buttons/pills.
🛠 RES Codex [06-17-26] 1378f71: completed U3b by moving the remaining admin module pages/components off legacy `card/table/pill/button/field` hooks and inline spacing onto the shared primitive CSS contract and token utilities (`app/globals.css:362`, `modules/products/page.tsx:159`, `modules/forms/page.tsx:474`, `modules/scheduling/components/services-panel.tsx:90`); blocker scan is clean across `modules`, and `npm run build` passes.
✅ CNF Claude [06-16-26]: validated against PATCHER commits through `3c5f75a` (refs as of that commit). PARTIAL — U3a CONFIRMED: sidebar sign-out renders the `Button` primitive (shell/admin-sidebar.tsx:93); chrome stays tokenized and sidebar width is fixed via `--layout-admin-sidebar` — U3a's sole audit finding is closed. U3c sub-scope CONFIRMED for the patched surfaces only: dashboard uses StatTile/Badge/Card/Table (modules/dashboard/page.tsx) and the admin loading state is wired — `app/admin/(protected)/loading.tsx` renders `AdminSkeleton` using SkeletonLine/SkeletonBlock/Card/EqualGrid (shell/loading-states.tsx). U3c stays ⚠️FLAGGED for its full scope (designed empty/error state for *every* admin surface), which overlaps the still-open U3b. U3b verified still flagged at `3c5f75a`: only `modules/appointments` and `modules/dashboard` consumed `components/ui`; the broad module-page re-skin was not done — GATE-CLS/GATE-RHYTHM unmet. NOTE: a separate, later pass (commits `000a24b`/`7658bbf`/`1378f71`, landed during this validation) is extending/finishing U3b outside this scope and needs its own audit. Group U3 stays ⚠️FLAGGED — not collapsed.

---

### U4. Rendered Surface Refinement

`META: U4a,U4b,U4c STATUS=⚠️FLAGGED DEPS=U2a,U2b,U2c GATES=cls,a11y,rhythm OWNER=ENG AUDITOR=LINTER`

The public pages and embed widgets we still render — brought to the same bar and brand-adaptive via
presets. Secondary to the admin, but where a client uses our rendering or an embedded widget it must
look first-party. **No business-logic changes**, so this runs in parallel with U3 once U2 lands.

**U4a — Marketing/reference surfaces.** [app/page.tsx](app/page.tsx) (homepage),
[app/testimonials](app/testimonials), [app/galleries](app/galleries) onto tokens/primitives with the
U1b direction. Reserved media tiles so gallery/hero imagery never causes shift.

**U4b — Transactional surfaces.** [app/shop](app/shop) + product detail + [app/cart](app/cart),
[app/book](app/book) (the booking stepper), [app/forms](app/forms), [app/billing](app/billing), the
client portal ([app/portal](app/portal)). **Reserved dimensions are critical here** — product cards are
identical size whether or not a sale badge / rating / variant exists; booking slot buttons are fixed
size; all states designed (empty cart, sold-out, out-of-stock, error).

**U4c — Embed widget visual parity.** The §1b E3 web component and E4 iframe surfaces consume the same
token set (via the existing `embedTheme` attribute path) so an embedded booking/commerce widget on a
client's custom front end matches our first-party rendering. Reuse the embed theme path; do not fork
styles.

`LOG:`
🛠 ENG Codex [06-17-26] this commit: migrated homepage actions and empty states to primitives in `app/page.tsx`, moved repeated public/transactional typography overrides to token utilities, and tokenized booking iframe/web-component embed chrome in `app/embed/v1/booking/page.tsx` and `app/embed/v1/[asset]/route.ts`.
🔍 AUD Claude [06-16-26]: U4a 🟠 only homepage hero actions + empty states use primitives; body cards stay legacy `.card` inside non-equal `.feature-grid` (app/page.tsx:142-165,177-186) so they are not equal-height (GATE-CLS), and testimonials/galleries — also in scope — are untouched (inline styles remain, e.g. app/galleries/public-gallery-view.tsx:275,302,405). U4b 🔴 BLOCKER — shop/product/cart/book/forms/billing/portal are not migrated; none import `components/ui`; the "reserved dimensions are critical here" requirements (identical product cards with/without sale badge, fixed booking-slot buttons, all states) are unmet, and surfaces stay inline-styled (app/shop/page.tsx:107, app/cart/page.tsx:137-194, app/book/booking-flow.tsx:158). U4c 🟠 only the booking web component reads token vars (with hard fallbacks); the buy-button, gallery, and form components hard-code `#0f766e`/`#d5d9df`/`#64748b`/`#111827`/`8px` with no `var(--color-*)` and no theme attributes (app/embed/v1/[asset]/route.ts:508-510,633,739; observedAttributes lack color attrs at :516,:638,:827) → 3 of 4 embeds are not brand-adaptive and won't match a non-`clean` preset, contradicting "consume the same token set … embedded ≈ first-party." 🟠 the iframe host forks a sterile palette (`:root{--color-page:#fff…--color-danger:#991b1b}`, app/embed/v1/booking/page.tsx:205-210) instead of reusing the embed theme path the item says not to fork.
🛠 RES Codex [06-16-26] 5127849: fixed U4c by tokenizing buy-button/gallery/form widget CSS and theme attributes at `app/embed/v1/[asset]/route.ts:551`, `:724`, and `:957`; removed the iframe host `:root` palette fork at `app/embed/v1/booking/page.tsx:204`; U4a/U4b remain ⚠️FLAGGED.
🛠 RES Codex [06-17-26] 1378f71: completed U4b by migrating shop/product/cart/book/forms/billing/portal transactional surfaces off legacy hooks and inline spacing onto the same primitive CSS/token utility layer (`app/shop/page.tsx:99`, `app/cart/page.tsx:168`, `app/book/booking-flow.tsx:146`, `app/forms/[slug]/page.tsx:350`, `app/billing/[token]/page.tsx:84`, `app/portal/[clientId]/page.tsx:139`); blocker scan is clean across the U4b paths, and `npm run build` passes.
✅ CNF Claude [06-16-26]: validated against PATCHER commits through `3c5f75a`. U4c CONFIRMED — all four widgets derive `--sr-*` from first-party tokens, `.sr-widget{--sr-accent:var(--color-brand,#0f766e);--sr-bg:var(--color-surface,…);…}` (app/embed/v1/[asset]/route.ts), so buy-button/gallery/form CSS inherits the host theme through the shadow boundary with hex only as fallback; `observedAttributes` include `theme,accent-color,primary-color,background-color,border-color,muted-color,text-color,radius` and `applyTheme()` maps them onto `--sr-*`. Booking iframe host no longer forks a sterile `:root` palette — the hard-coded `:root{--color-page:#fff…--color-danger:#991b1b}` line was removed (app/embed/v1/booking/page.tsx). U4a/U4b verified still flagged at `3c5f75a`: testimonials/galleries and shop/cart/book/forms/billing/portal were untouched and imported no `components/ui`. NOTE: the later pass (`1378f71`, landed during this validation) claims to migrate U4b surfaces — outside this scope; needs its own audit. Group U4 stays ⚠️FLAGGED — not collapsed.

---

### U5. Theme Preset System (brand adaptation, bounded)

`META: U5a,U5b STATUS=✅CONFIRMED DEPS=U1a GATES=a11y,rhythm OWNER=PATCHER AUDITOR=LINTER`

Keep theming exactly as small as it is — make it *reliable*. This is **not** a theme editor; it is the
one-setting brand-adaptation surface. [docs/theme-tokens.md](docs/theme-tokens.md)'s stance is
**upheld**, not superseded.

**U5a — Re-tune presets.** Re-fit the three presets (clean/editorial/warm) to the expanded U1 token
layer so they cover the new spacing/type/surface/state slots, stay **contrast-safe** (AA) at every
combination, and the primary-color override (`withBrandOverride`, [lib/theme/tokens.ts](lib/theme/tokens.ts))
flows correctly through every new token — including the de-clinical warmth from U1b so even the default
preset doesn't read sterile.

**U5b — Preset authoring + bounds.** Update [docs/theme-tokens.md](docs/theme-tokens.md) with the
expanded token groups and the "add a preset" steps, and optionally add 1–2 presets for common client
brand archetypes. Explicit guardrail: clients change **preset + primary color only** — exposing more
would turn the admin into a site builder, which is out of scope.

`LOG:`
🛠 ENG Codex [06-17-26] this commit: re-fit clean/editorial/warm presets to the expanded token groups and updated `docs/theme-tokens.md` plus `docs/ui-design-rules.md` with bounded preset authoring and primitive-consumption rules.
🔍 AUD Claude [06-16-26]: U5a — three presets cover the new slots and the primary override flows through. 🟠 GATE-A11Y not guaranteed: the warning badge sets `color:var(--accent)` on a 10%-accent tint (app/globals.css:499-503); `clean` accent `#b66d3a` computes ≈3.8:1 on that near-white fill — below AA 4.5 for 12px/590 badge text. `withBrandOverride` derives accent via `rotateHue(primary,42)` clamped to L∈[0.38,0.62] with no contrast check (lib/theme/tokens.ts:345-349), so a client primary can drive accent/warning text further below AA — "contrast-safe (AA) at every combination" is asserted but unverified and partly false. 🟡 muted (~5.7:1 on white) is reused on sunken/tinted fills without per-combination verification. U5b — docs bounds upheld (theme-tokens.md/ui-design-rules.md). 🟡 the new line "or through existing compatibility classes that map to the same tokens" (docs/theme-tokens.md "Primitive Contract") is the escape hatch U3b/U4b used to skip primitive adoption — reconcile with the per-item "onto the primitives" scope so PATCHER has one rule. 🟢 no new archetype presets (item said optional).
🛠 RES Codex [06-16-26] 76e0617: added an AA contrast floor for derived accents at `lib/theme/tokens.ts:263`, darkened warning badge text at `app/globals.css:439`, and removed the primitive-contract escape hatch in `docs/theme-tokens.md:85`; optional extra presets deferred.
🔍 AUD Claude [06-16-26] SIDEBAR (untagged): every `LOG:` line is dated [06-17-26] (future — today is 06-16-26) and cites "this commit" rather than the real hash `df10c2a`, against this file's "commit + key file:line" discipline. ENG also flipped all 12 items to READY-FOR-AUDIT in one commit while U3b/U4b's core primitive migration was not built.
✅ CNF Claude [06-16-26]: validated against PATCHER commits through `3c5f75a`. U5a/U5b CONFIRMED — warning badge text darkened to `color-mix(in srgb,var(--color-accent) 76%,black)` on its 10% accent tint (`.ui-badge-warning`), computing ≈5.6:1 for the `clean` accent (was raw `--accent` ≈3.8:1, below AA); the derived-accent path now has an AA contrast floor — `ensureContrast(rotateHue(primary,42), preset.colors.surface, 4.5)` (lib/theme/tokens.ts:263,316). U5b — docs/theme-tokens.md no longer permits compatibility classes as an escape hatch (now "temporary migration shims for legacy surfaces only; not an acceptable substitute"); extra archetype presets deferred (optional). ⚠️ Residual (forward): legacy `.pill.warning` still uses raw `var(--accent)` and was consumed by then-unmigrated `modules/settings` and `modules/automation` pages — sub-AA until migrated to `<Badge tone="warning">`. `npm run build` green; runtime/browser inspection blocked — local DB `127.0.0.1:55432` unreachable.

---

## Cross-Cutting Release Gates

Not separate work items — **every U-item is blocked from CONFIRMED until it passes all three.**

- **`GATE-CLS` — reserved dimensions / zero layout shift (PRIME).** Cards in a grid are identical size
  regardless of which optional fields are populated; space is reserved for any data that *can* exist; a
  button click never resizes its container; skeletons match final dimensions exactly; equal-height rows
  over masonry. Measured: CLS ≈ 0 on every refined surface. **This is the rule that matters most.**
- **`GATE-A11Y` — WCAG 2.2 AA.** Contrast (gated in U5a for presets), visible focus, target size,
  keyboard operability, labelled controls.
- **`GATE-RHYTHM` — Vercel spacing/type conformance.** Everything on the U1 scale; no ad-hoc inline
  spacing left behind; intentional typographic hierarchy; the surface reads premium, not default — the
  "doesn't feel bland/clinical" bar from U1b.

---

## Follow-up bookkeeping

- Update [docs/theme-tokens.md](docs/theme-tokens.md) in U5b for the expanded token groups — its
  "don't turn the admin into a site builder" stance **stands**; document the bounded preset model.
- Update [docs/ui-design-rules.md](docs/ui-design-rules.md) if U1/U2 add enforceable specifics (the
  spacing/type scale, the reserved-dimension component API) so the rules point at the primitives.
- Keep [docs/roadmap.md](docs/roadmap.md) the source of truth for *module engines* and §1b *embeds*;
  this file owns only *presentation refinement* of the surfaces we render. Cross-link, don't duplicate.
