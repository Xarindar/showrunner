# Site Builder & UI Roadmap

Last researched: June 16, 2026 · Last audit pass: — (not yet built)

This roadmap covers the **heavy UI pass**: turning Showrunner from a fixed-route, lightly-themeable
app into a **Squarespace/Shopify-style portal** — a visual site builder where a site owner composes
pages from sections, restyles the theme, and manages navigation, all bound to the modules that are
already built and confirmed in `docs/roadmap.md`.

It **reuses the audit ledger protocol from `docs/roadmap.md`** (same as `docs/refractor-roadmap.md`)
for *roles* (ENGINEER · LINTER · REVIEWER · PATCHER · VALIDATOR) and commit discipline — read that
file's "AGENT INSTRUCTIONS" header for your role, then come back here. **But this file deliberately
diverges from roadmap.md on file mechanics to stay cheap to read** (authorized by the owner,
06-16-26). The rules that keep it lean are in "How agents use this file" below; follow them here, not
roadmap.md's append-only convention.

> **Prime Directive (unchanged):** modular design is non-negotiable. Every section, block, theme
> control, and editor surface must **bind to existing module logic, not fork it.** Services come from
> `lib/scheduling`, products from `lib/commerce`, galleries from `modules/portfolio`, forms from
> `modules/forms`, testimonials from `modules/testimonials`. The builder is a *presentation and
> composition* layer over confirmed data engines — it adds no second source of truth.

---

## Why this file exists (the gap)

Every business module is built and CONFIRMED, and the embed/public-API layer (§1b E1–E6) can mount
those modules on a customer's own site. But the **site the owner gets from us is still hardcoded**:

- The public homepage is hand-written JSX driven by five `SiteSettings` string fields
  (`heroHeadline`, `heroSubheadline`, `introTitle`, `introBody`, `heroImageUrl`) — see
  [app/page.tsx](app/page.tsx) and [modules/content/page.tsx](modules/content/page.tsx). There is no
  page model, no second page, no section reordering, no per-page layout.
- Theme is **3 fixed presets + one primary color** — see [lib/theme/tokens.ts](lib/theme/tokens.ts).
  [docs/theme-tokens.md](docs/theme-tokens.md) deliberately stops short of a builder ("Exposing every
  token to clients would turn the admin into a site builder"). **This roadmap supersedes that
  decision** per the owner's direction — with guardrails so clients still can't break layout (see U5).
- Public surfaces (`/shop`, `/book`, `/galleries`, `/forms`, `/cart`, `/billing`, `/portal`) are
  cohesive but hand-styled against a 2,500-line [app/globals.css](app/globals.css); there is no shared,
  documented component layer for a builder to render into.

The job is to add the **composition + styling + storefront-polish layers** on top of the confirmed
spine, following the §1 "theme contract" and "embed layer" intent already written into
`docs/roadmap.md`.

---

## How agents use this file (read this once, then stop)

This file is built so you read **~2 KB, not the whole thing.** Four rules:

**1 · Read budget — do this, not more.**
1. Read the **Status Index** (the routing table — it is the menu).
2. Read **only the item(s) you are assigned**, by grepping the item ID (e.g. `grep "^### U3c"` or just
   search `U3c`). Each item is self-contained: its deps and gates are on its META line.
3. Read **Cross-Cutting Gates** once.
4. Do **not** read other items, the Research Basis, or `docs/ui-plan-archive.md` unless your item
   points you there. The whole plan is in scope to *the team*, not to *you this turn*.

**2 · Every item is addressable.** Headings carry a stable ID (`U0`, `U1a`, `U3c`, …) and a one-line
machine-readable META line directly beneath, so state is parseable without reading prose:

```
META: STATUS=⬜PENDING DEPS=U0,U1a GATES=a11y,sec COMMIT=— OWNER=—
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
| `U0` | Builder architecture spike | 🔵 READY-FOR-AUDIT | — | In-house section model + renderer chosen; Puck/dnd-kit limited to later canvas evaluation. |
| `U1a` | Token contract expansion | ⬜ PENDING | U0 | Grow `lib/theme/tokens.ts` to per-surface token slots + scales; presets render identically until changed. |
| `U1b` | Primitive component library | ⬜ PENDING | U1a | Extract `components/ui/*` from globals.css; 4 states each; ui-design-rules gates. |
| `U2a` | Page & nav data model | ⬜ PENDING | U0,U1a | `Page`/`NavMenu`/`PageVersion` + shared Zod section registry; draft/published JSON. |
| `U2b` | Public renderer | ⬜ PENDING | U2a,U1b,U3a | Dynamic route walks `publishedContent` → U3 sections → U1 components. |
| `U2c` | Homepage migration | ⬜ PENDING | U2b | Seed home `Page` from current SiteSettings; point `/` at renderer; no content lost. |
| `U3a` | Content sections | ⬜ PENDING | U2a,U1b | Hero/text/image/CTA/FAQ/nav/footer — self-contained, no module deps. |
| `U3b` | Module-bound sections | ⬜ PENDING | U3a | Services/products/galleries/forms/testimonials — bind to confirmed modules, no fork. |
| `U3c` | Render trust boundary | ⬜ PENDING | U3a | 🔴-class: sanitize+escape owner HTML; reuse sanitize-html + structured-data escaper. |
| `U4a` | Editor shell | ⬜ PENDING | U2b,U3b | Three-pane: layers + live canvas + schema-driven settings panel. |
| `U4b` | Accessible reorder | ⬜ PENDING | U4a | Drag (dnd-kit) **+** up/down/move-to alt — WCAG 2.2 SC 2.5.7 gate. |
| `U4c` | Autosave/undo/versions/publish | ⬜ PENDING | U4a | Debounced autosave, session undo, restorable `PageVersion`, audit-logged publish. |
| `U4d` | Device preview | ⬜ PENDING | U4a | Desktop/tablet/mobile preview of one responsive tree (no per-breakpoint store v1). |
| `U5a` | Theme editor controls | ⬜ PENDING | U1a | Owner-facing colors/type/radius/spacing; presets as starting points; live preview. |
| `U5b` | Theme guardrails | ⬜ PENDING | U5a | Bounded ranges + AA contrast check that blocks an unreadable publish. |
| `U6a` | Storefront depth | ⬜ PENDING | U1b | Re-skin shop/product/cart on U1; cart drawer, collection pages, all states. |
| `U6b` | Service/portal surfaces | ⬜ PENDING | U1b | Re-skin book/galleries/forms/portal/billing on U1; nav from U2; mobile nav. |
| `U7` | Starter templates + onboarding | ⬜ PENDING | U2c,U5a | Per-site-type kits seed Page+theme+modules; reuse forms-template + installation helpers. |
| `GATE-A11Y` | WCAG 2.2 AA gate | 🔁 ONGOING | — | Blocks every item's CONFIRMED; keyboard + SC 2.5.7 + contrast + SR announcements. |
| `GATE-PERF` | CLS / media / reserved-dims gate | 🔁 ONGOING | — | Blocks every item's CONFIRMED; near-zero CLS, sized `Image`, bounded trees. |
| `GATE-SEC` | Tenancy / trust-boundary gate | 🔁 ONGOING | — | Blocks every item's CONFIRMED; siteId-scoped, `site:design`-gated, no draft leakage. |

**Critical path:** `U0 → U1a → U1b → U2a → U2b → U3a → U3b → U4a → U4c`. **Parallelizable after U1b:**
U5a/b (theming) and U6a/b (re-skin). **Last:** U7 (consumes U2c + U5a).

---

## Product Direction

The owner is building "our own Squarespace/Shopify." Concretely that means three owner-facing
capabilities that Showrunner does not have yet, layered on the confirmed module spine:

1. **Compose** — add/reorder/remove page *sections* on a live canvas, across multiple pages, with
   draft/publish and version history. (Shopify "sections everywhere"; Squarespace Fluid Engine.)
2. **Style** — restyle the whole site from a controlled **theme editor** (colors, type, spacing,
   button/card style) without touching code and without being able to break layout.
3. **Sell/serve** — storefront and client-portal surfaces that look and behave at Shopify/Squarespace
   grade (product cards, cart drawer, mobile nav, responsive media, polished empty/loading/error states).

The platform stays **PCI SAQ-A** (checkout still hands off to the gateway), **tenancy-scoped** (every
page/section/theme is `siteId`-bound), and **role/scope-aware** (builder access gated by a new
`site:design` permission, consistent with §14).

---

## Research Basis

UI/builder-specific anchors (general design anchors stay in [docs/ui-design-rules.md](docs/ui-design-rules.md)
and [docs/theme-tokens.md](docs/theme-tokens.md)):

- **Sections-and-blocks data model.** Shopify Online Store 2.0: every JSON template contains sections;
  every section contains blocks; the editor manipulates the JSON, not code; "app blocks" let modules
  inject without code changes; bounded (≤25 sections/template, ≤50 blocks/section); draft vs published.
  This is the model U2/U3 adapt. <https://help.shopify.com/en/manual/online-store/themes/theme-structure/sections-and-blocks>,
  <https://shopify.dev/docs/storefronts/themes/architecture>
- **Grid/section editor UX.** Squarespace Fluid Engine: grid-based drag-and-drop, blocks don't reflow
  each other, separate desktop/mobile layouts, per-section editing, "upgrade section" migration path —
  informs U4 canvas + device preview. <https://support.squarespace.com/hc/en-us/articles/6421525446541-Edit-your-site-with-Fluid-Engine>
- **Embeddable React editor + clean JSON schema.** Puck (MIT, Next.js-friendly, exports pages as
  portable JSON, native CSS grid/flex in 0.18) and Craft.js (modular DnD page-editor framework) are the
  build-vs-adopt candidates for the U4 canvas. <https://github.com/puckeditor/puck>, <https://github.com/prevwong/craft.js>
- **Accessible drag-and-drop (release gate).** WCAG 2.2 SC 2.5.7 *Dragging Movements* (AA): any
  drag function must also be doable with a single non-drag pointer action — so reorder needs
  up/down + "move to position" alternatives alongside drag. <https://www.w3.org/TR/WCAG22/#dragging-movements>
- **Draft/publish, version history, autosave, undo/redo.** Standard builder expectations (autosave to
  draft, session undo/redo, restorable named versions, publish gate) — informs U2 (model) + U4 (editor).
  <https://www.builder.io/c/docs/history>
- **Reusable cross-site widgets / encapsulation.** MDN Web Components — already the basis of the §1b
  embed widgets; section renderers that ship to embeds reuse that path. <https://developer.mozilla.org/en-US/docs/Web/Web_Components>
- **Responsive media (performance gate).** Next.js `Image` automatic optimization + Cloudflare Images
  variants for the media-heavy storefront/gallery sections. <https://nextjs.org/docs/app/api-reference/components/image>
- **Render trust boundary.** User-authored rich text and any HTML-bearing block must be sanitized
  (reuse the project's `sanitize-html` dep + the XSS-safe escaper pattern already used in
  [components/structured-data.tsx](components/structured-data.tsx)) — OWASP XSS prevention.
  <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>

---

## UI Architecture Roadmap

### U0. Builder Architecture Spike

`META: U0 STATUS=🔵READY-FOR-AUDIT DEPS=— GATES=— OWNER=Codex`

A short, code-light spike that produces one decision document and unblocks U2/U4. **No production
code ships from U0** beyond a throwaway proof; its output is a `CHECKPOINT` block here plus a 1-page
ADR appended below.

**Decisions to resolve (recommendation in bold):**

- **Section data shape.** A page is a tree: `Page → Section[] → Block[]`, each node `{ type, id,
  props, children? }`, stored as validated JSON. **Recommend** modeling this in Postgres via Prisma
  (a `Page` row + a typed JSON `content` column validated by a Zod registry), *not* a per-block table —
  it keeps reads single-row for the renderer and matches how the project already stores typed JSON
  (`SiteSettings.enabledModules`, `SiteApiKey.allowedOrigins`, form conditional logic).
- **Build vs adopt the canvas (U4).** **Recommend in-house section model + renderer** (so sections
  bind directly to confirmed module data, theme tokens, tenancy, and the data-scope engine — no
  foreign abstraction over our security model), and **evaluate Puck only for the editor *canvas* drag
  layer**, behind our own schema. Forking the whole builder onto Puck/Craft.js would put a second
  component model next to the module system (violates the Prime Directive); pulling in `dnd-kit` for
  the reorder interaction alone is the lower-risk reuse. Reuse the drag pattern already proven in the
  admin calendar (`rescheduleBookingFromCalendarAction`, [modules/appointments](modules/appointments)).
- **Where the builder lives.** A new **`site-builder` module** (`modules/site-builder`) following the
  `ShellModule` manifest contract in [shell/module-types.ts](shell/module-types.ts), with permission
  `site:design`, `dependencies: ["settings", "media", "content"]`, and `widgetRoutes` for the renderer.
  It **absorbs the existing `content` module's scope** (which today only edits 5 SiteSettings fields)
  rather than competing with it — `modules/content` becomes the seed source, see U2.

`CHECKPOINT:` U0 chooses the in-house page/section/block schema and renderer as the platform boundary. U2
should add `Page`, `NavMenu`, and `PageVersion` rows scoped by `siteId`; U3 should register section
schemas/renderers in app code; U4 may evaluate Puck or dnd-kit only as canvas/reorder plumbing behind
that owned schema. No production code ships in this spike.

`LOG:`
🛠 ENG Codex [06-16-26]: Completed the U0 architecture spike as an ADR only; confirmed no builder/DnD dependency exists today, `ShellModule` can own a `site-builder` module, and `site:design` must be added before U2/U4 protected routes/actions ship. Status: `READY-FOR-AUDIT`.

**ADR — U0 Builder Architecture**

**Decision.** Build Showrunner's site builder around an owned `Page -> Section[] -> Block[]` document
model stored on site-scoped Prisma rows, not around a third-party builder's component model. A page
document is validated JSON with stable node ids and bounded depth:

```ts
type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: BuilderNode[];
};

type PageDocument = {
  schemaVersion: 1;
  sections: BuilderNode[];
};
```

U2 should persist that contract as `Page.draftContent` and `Page.publishedContent`, with `PageVersion`
snapshots for restore and `NavMenu` rows for header/footer composition. Keep reads single-row for public
rendering, and validate every write through the shared Zod section registry before it reaches Prisma.
This follows the repo's existing typed-JSON pattern (`SiteSettings.enabledModules`,
`SiteApiKey.allowedOrigins`, form conditional logic, and email `builderJson`) while keeping ownership,
versioning, and publish state explicit in relational rows.

**Renderer boundary.** The production renderer is in-house. It maps registered section types to
Showrunner components and existing module data sources: scheduling from `lib/scheduling`, commerce from
`lib/commerce`, galleries from `modules/portfolio`, forms from `modules/forms`, testimonials from
`modules/testimonials`, and media through the existing media delivery path. A section may store display
choices and references, but it must not fork or denormalize module records into a second source of truth.
U3c owns the HTML trust boundary: rich text is sanitized, interpolated text is escaped, and JSON-LD uses
the existing `<` escaping pattern from `components/structured-data.tsx`.

**Editor boundary.** U4 can evaluate Puck or `dnd-kit` for canvas interactions, but only behind the owned
document contract. Do not let a package become the source of truth for page data, permissions, module
bindings, or public rendering. If a dependency is added later, it should be for reorder/selection UX only,
with accessible non-drag controls still required by GATE-A11Y.

**Module home and auth.** Add a `site-builder` module under `modules/site-builder` using the existing
`ShellModule` manifest shape, `layout: "fullscreen"`, and dependencies on settings/media/content. It
absorbs the current `content` module's homepage-copy scope during U2c rather than competing with it.
Builder routes and actions must be guarded by a new `site:design` permission, which is not present in
`lib/admin-permissions.ts` yet; add it before shipping any protected builder surface. Public rendering
uses only `publishedContent`; draft reads, autosaves, publish, and restore stay admin-only and
audit-logged.

**Consequences.** The approach keeps the builder aligned with the module system and tenancy model, avoids
a second component/runtime abstraction, and leaves room to adopt focused editor tooling after the schema
is stable. The tradeoff is that U1-U4 must build more of the editor shell themselves, but the public
runtime stays smaller, inspectable, and bound to the confirmed module engines.

---

### U1. Design System Foundation

`META: U1a,U1b STATUS=⬜PENDING DEPS=U0 GATES=perf,a11y OWNER=—`

The substrate everything renders into. Must land before the builder so sections compose from a
documented, token-driven, reserved-dimension component set — not ad-hoc globals.css classes.

This is the §1 "theme contract" promise made concrete: *"per-module token slots for cards, booking
flows, gallery grids, commerce badges, and form controls."*

**U1a — Token contract expansion.** Extend [lib/theme/tokens.ts](lib/theme/tokens.ts) from
`{colors, radius, shadow, type, motion, layout}` to a full contract: a typographic scale (display →
caption), a spacing scale, semantic surface levels (page/surface/raised/sunken), state colors
(hover/active/focus/disabled), per-surface token slots (card, button, field, table, badge, section
padding), and an optional dark scheme. Keep `themeToCssVars()` as the single application point (it's
already consumed by [app/page.tsx](app/page.tsx) and the admin shell — extend, don't fork). All three
existing presets must keep rendering byte-identically until a token is intentionally changed.

**U1b — Primitive component library.** Extract the recurring patterns currently living as bare classes
in [app/globals.css](app/globals.css) (`.button`, `.card`, `.field`, `.pill`, `.empty-state`,
`.page-header`, tables, skeletons) into typed React primitives under `components/ui/` — Button, Card,
Field/Input/Select/Textarea, Table, Badge, Tabs, Dialog/Sheet, Toast, Skeleton, EmptyState.
**Hard gates from [docs/ui-design-rules.md](docs/ui-design-rules.md):** ≤8px radius, reserved/fixed
dimensions (no layout shift on click), skeleton loaders that mirror final dimensions, no
`transition: all`, and **every repeated surface ships empty + sparse + dense + error states.**
This is a refactor-in-place: migrate the admin shell and public pages onto the primitives
incrementally so nothing regresses (mirror the §1 tenancy-retrofit slice discipline).

**Chunks:** U1a token contract → U1b primitives. U1a first (primitives consume the tokens).

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U2. Page & Navigation Data Model

`META: U2a,U2b,U2c STATUS=⬜PENDING DEPS=U0,U1 GATES=sec,perf OWNER=—`

The composition layer's source of truth. Adapts Shopify's "sections everywhere" to our stack.

**U2a — Schema.** Add `Page` (`siteId`, `slug`, `title`, SEO meta, `status: DRAFT|PUBLISHED`,
`draftContent` JSON, `publishedContent` JSON, `template` enum), `NavMenu`/`NavItem` (header + footer
navigation), and `PageVersion` (immutable snapshots for restore). All `siteId`-scoped with composite
unique `(siteId, slug)` — match the existing site-scoped uniqueness pattern (`Product.slug`,
`Form.slug`). Section/block trees are validated by a **Zod section registry** (the shared contract the
renderer *and* the editor *and* the public API all read — one schema, no divergence, exactly like the
forms `conditional-logic.ts` evaluator is shared server+client).

**U2b — Public renderer.** A dynamic route (`app/[[...slug]]` or a `/p/[slug]` catch-all, decided in
U0) loads a `Page` by `(siteId, slug)`, walks `publishedContent`, and renders each section via the
U3 registry into the U1 components, wrapped in `themeToCssVars(settings)`. Draft preview renders
`draftContent` behind `site:design` auth. **The existing fixed routes (`/shop`, `/book`, etc.) stay
as-is** — pages compose *around* them and link *into* them; the renderer is additive.

**U2c — Homepage migration.** Seed a default home `Page` whose section tree reproduces today's
[app/page.tsx](app/page.tsx) exactly (hero + intro + module showcase), reading the current
`SiteSettings` fields as initial block props so **no live content is lost**. Then point `/` at the
renderer. `modules/content` is rewritten to launch the builder for the home page instead of editing 5
raw fields; the old fields remain as the migration seed + embed fallback.

**Decisions for the auditor:** (1) JSON tree in a single column (U0 decision) keeps the renderer a
one-row read. (2) bounded like Shopify — cap sections/page and blocks/section in the Zod schema to keep
render cost and editor UX sane. (3) `publishedContent` is what the public + sitemap + embeds read;
`draftContent` is never public — the publish action copies draft→published atomically and writes a
`PageVersion`.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U3. Section / Block Library

`META: U3a,U3b,U3c STATUS=⬜PENDING DEPS=U2 GATES=sec,a11y OWNER=—`

The actual building blocks. Each section = `{ schema (Zod), renderer (RSC), editorFields, defaults,
previewThumbnail }` registered in one catalog the editor reads.

**U3a — Content sections (self-contained):** Hero, Rich text, Image / image+text, Gallery strip,
Feature grid, CTA banner, FAQ/accordion, Logo strip, Spacer/Divider, Header/Nav, Footer. These hold
their own props; no module dependency.

**U3b — Module-bound sections (bind, don't fork):** Services list / booking CTA (→ `lib/scheduling`
active services), Product grid / featured collection (→ `lib/commerce` catalog), Gallery embed (→
`modules/portfolio` published+public galleries), Form embed (→ `modules/forms` active forms +
existing public submit path), Testimonials wall (→ `modules/testimonials` approved+featured). Each
section **queries the confirmed module exactly as `app/page.tsx` already does today** (e.g. the
homepage's `prisma.form.findMany`/`portfolioGallery.findMany`/`testimonial.findMany` calls move into
section renderers) and respects module-enabled flags + tenancy. No new data engines.

**U3c — Render trust boundary (security gate).** Any section that renders owner-authored HTML/rich
text must sanitize on the way in *and* escape on the way out. Reuse the project's `sanitize-html`
dependency and the XSS-safe escaping already shipped in
[components/structured-data.tsx](components/structured-data.tsx) (the JSON-LD `<`→`<` pattern).
Block props are Zod-validated; URLs are validated against an http(s) allowlist (reuse the embed
origin-normalization helper in [lib/embed](lib/embed)); no `dangerouslySetInnerHTML` without the
shared sanitizer. **This chunk is a 🔴-class gate** — the builder turns owners into content authors,
so stored-XSS is the headline risk.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U4. The Editor Shell

`META: U4a,U4b,U4c,U4d STATUS=⬜PENDING DEPS=U2,U3 GATES=a11y,sec OWNER=—`

The visible "Squarespace/Shopify" surface — a new admin route under the `site-builder` module
(`layout: "fullscreen"` per the `ShellModule` contract).

**U4a — Three-pane editor.** Left: page picker + section **layers/tree** (select, see structure).
Center: live **canvas** rendering `draftContent` through the U3 registry (the real renderer, not a
mock), with hover affordances to add/select/remove sections. Right: **settings panel** driven by the
selected section's `editorFields` schema (auto-generated from the Zod registry — one definition feeds
both validation and the form). An "add section" inserter shows the U3 catalog with thumbnails.

**U4b — Accessible reorder (WCAG 2.2 SC 2.5.7 gate).** Section/block reordering supports drag **and**
a non-drag alternative: up/down move buttons and a "move to position" control on every section, plus
full keyboard operability and screen-reader announcements. Drag uses `dnd-kit` (U0 decision) reusing
the calendar drag pattern; the keyboard/button path is **not optional** — it is the AA release gate.

**U4c — Autosave / undo-redo / versions / publish.** Autosave `draftContent` on a debounce (no
explicit "save" needed); session-scoped undo/redo stack; **draft vs publish** with an explicit publish
action that snapshots a restorable `PageVersion`; named version history with one-click restore. Mirror
the patterns the team already trusts: optimistic concurrency (like cart `recoveryAttemptCount`),
audit-logged publish/restore (`recordAuditLog`, `site.page.published`/`reverted`), `site:design`-gated
and record-scoped — no IDOR onto another site's pages.

**U4d — Device preview.** Desktop/tablet/mobile preview toggle on the canvas (responsive preview, not
a separate layout store in v1 — single responsive tree, matching how the public site already responds).
Forward note: per-breakpoint overrides (Squarespace's separate mobile layout) is a later chunk, not v1.

**Chunks:** U4a shell → U4b reorder → U4c persistence → U4d preview. U4a needs U2+U3 confirmed.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U5. Theme Editor

`META: U5a,U5b STATUS=⬜PENDING DEPS=U1 GATES=a11y OWNER=—`

The "Style" capability — exposes the U1 token contract as controlled, owner-facing styling, finally
answering the open question in [docs/theme-tokens.md](docs/theme-tokens.md) ("exposing every token …
would turn the admin into a site builder"): **we now want that, with guardrails so layout can't break.**

**U5a — Controls.** Brand colors (primary/accent/surfaces), font pairing (heading + body from a
curated set), type scale, corner radius, button/card style, section spacing density. Presets
(clean/editorial/warm + new ones) become **starting points**, not the only choice. Live preview against
the U2 renderer; draft/publish the theme like a page.

**U5b — Guardrails (the reason this was deferred before).** Bounded ranges (radius/spacing within the
ui-design-rules envelope), automated **contrast checks** (WCAG AA text/background) that block a publish
that would make text unreadable, and tokens chosen so a bad value degrades gracefully rather than
breaking layout (reserved dimensions from U1 absorb most of it). Persist into the existing
`SiteSettings.themePreset`/`themePrimary` plus a new `themeTokens` JSON, all flowing through the single
`themeToCssVars()` entry point — no parallel theming path.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U6. Storefront & Public-Surface Re-skin

`META: U6a,U6b STATUS=⬜PENDING DEPS=U1 GATES=a11y,perf OWNER=—`

Make the surfaces that already work *look and feel* Shopify/Squarespace-grade on the U1 system. This
is polish + depth on confirmed functionality — **no business-logic changes**, so it can run in parallel
once U1 lands.

**U6a — Storefront depth (commerce).** Re-skin [app/shop](app/shop), product detail, and
[app/cart](app/cart) on the U1 primitives; add the storefront patterns customers expect: product
cards with reserved media tiles, collection/category pages, a cart **drawer/mini-cart**, quantity
controls, and a polished checkout hand-off. Responsive images via Next `Image`. All states designed
(empty cart, out-of-stock, sold-out, error).

**U6b — Service & portal surfaces.** Re-skin [app/book](app/book), [app/galleries](app/galleries),
[app/forms](app/forms), [app/testimonials](app/testimonials), the client portal
([app/portal](app/portal)), and billing ([app/billing](app/billing)) on U1 — cohesive nav/header/footer
(driven by U2's `NavMenu`), mobile navigation, consistent empty/loading/error states, and the booking
flow stepper polished to match. The booking widget and embed (§1b E3) reuse the same U1 visual language
so embedded and first-party surfaces match.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

### U7. Starter Templates & Onboarding

`META: U7 STATUS=⬜PENDING DEPS=U2c,U5a GATES=sec,a11y OWNER=—`

The Squarespace "pick a template" entry point — what makes the builder usable on day one.

Per-site-type starter kits (service business, photographer/studio, product shop, venue/events,
portfolio brand, membership — the six target types in `docs/roadmap.md`). Each kit seeds a `Page` tree
(U2) + a theme (U5) + a sensible set of enabled modules, in one action. **Reuse the existing patterns:**
the forms starter-catalog approach (`modules/forms/templates.ts` + `createFormFromTemplateAction`) and
the module-installation helpers in `lib/modules/installation.ts` — a template is a typed catalog entry
that stamps draft content, not a new engine. An onboarding flow walks a new owner: pick type → name +
brand color → land in the U4 editor on a pre-filled home page.

`LOG:` — _(empty; append in-flight lines per chunk, collapse to one `✅ CNF` on confirm, then archive.)_

---

## Cross-Cutting Release Gates

These are not separate work items — **every U-section is blocked from CONFIRMED until it passes them.**

- **Accessibility (WCAG 2.2 AA).** Keyboard operability and a non-drag alternative for every drag
  (SC 2.5.7), visible focus, contrast (gated in U5b), labelled controls, screen-reader announcements
  on canvas actions. The editor itself must be operable without a mouse.
- **Performance / layout stability.** Reserved dimensions (U1) → near-zero CLS; responsive `Image`
  with width/height on every media tile; skeletons that match final size; bounded section/block counts
  (U2) keep render cost predictable.
- **Security / tenancy.** Every page/section/theme `siteId`-scoped and `site:design`-gated; render
  trust boundary (U3c) enforced; publish/restore audit-logged; no `draftContent` leakage to public or
  embed surfaces.
- **Embed parity (§1b).** Sections that can appear in embeds reuse the E2–E6 public API + Web Component
  path; the builder must not create a second, unscoped public render path.

---

## Follow-up bookkeeping

- Update [docs/theme-tokens.md](docs/theme-tokens.md) once U5 lands — its "we intentionally don't
  expose every token" stance is superseded; document the guardrail model instead.
- Update [modules/content/module.ts](modules/content/module.ts) `readiness`/`capabilities` and the
  `site-builder` manifest as chunks confirm, so the in-app module status reflects reality.
- Keep `docs/roadmap.md` as the source of truth for the *module* engines; this file owns the
  *composition, styling, and storefront-presentation* layer only. Cross-link, don't duplicate.
