# Admin tokens: developer guide

This is the maintained implementation guide for the Shopify-inspired Showrunner admin. It covers all `/admin` routes, including login. [DESIGN.md](../DESIGN.md) defines the visual direction; [PRODUCT.md](../PRODUCT.md) defines product behavior. The CSS source is authoritative for exact values. Historical UI plans and audit results are not instructions for new work.

## Start here

Single-choice native selects use `appearance: base-select` where supported. The shared control recipe styles the open picker with input corner tokens, popover elevation, inset rounded options and neutral selected/hover states. Multiple and expanded listbox selects keep their native presentation. Browsers without customizable-select support retain their native picker; keyboard navigation, required/disabled states and form submission stay browser-owned.

Open select menus match their trigger's border-box width. Select values and options stay on one line, clipping long labels with ellipsis instead of making mobile controls taller. Custom select popovers follow the same width rule.

Customizable native selects explicitly use a horizontal flex layout with the picker arrow at the trailing edge. Vertical alignment alone does not establish a flex layout in every browser. Selects and their options center their contents vertically at both desktop and touch heights.

`Select compact` uses the shared `ui-select-compact` recipe for short numeric values: tokenized minimum width, trigger/option padding and picker padding, a thin picker scrollbar and selected background without a checkmark that would consume value space. It preserves the usual desktop/touch control heights and native keyboard/validation behavior. Package duration uses H/M display units with full Hours/Minutes accessible labels.

Field groups use `align-content: start` so taller neighbours in an equal-column grid do not stretch labels or single-line controls. Search/filter fields reuse the shared input recipe and its 44px mobile minimum; module styles must not reduce that height.

All admin dialog titles use `ui-dialog-title`: the existing section type tokens (22px, weight 500, 28px line height), including custom onboarding and email editor shells. Do not apply panel-label type or module-specific font sizes to modal headings. Long titles wrap beside a non-shrinking close button. Headers form a black band with white titles, 8px vertical padding and 16px horizontal padding. Close controls are 28px white circles with a black X, with 30px desktop and 44px touch hit targets, aligned to the same 16px right inset as footer actions. Public proofing and booking retain tenant styling.

Shared `Dialog` measures the actual `.admin-main` bounds when opened and observes workspace resizing, including sidebar collapse and mobile layouts. Its native top-layer bounds and maximum dimensions stay inside that workspace. Login/public dialogs without an admin workspace keep their original behavior. Module CSS must not guess sidebar offsets. Full-workspace viewers use a zero `--dialog-workspace-inset`; ordinary dialogs reserve the shared 16px inset.

Shared `Modal` dialogs keep the rounded outer shell and header stationary. The inset `.ui-dialog-body` owns vertical scrolling, with `min-height: 0` so long content fits inside the viewport. Keep task-specific content inside that body; do not put scrolling back on the outer `.ui-modal` shell or add another competing scroller.

The shared modal shell enforces its 16px inset even when a module supplies a dialog class. Body layout defaults use low specificity so module flex layouts can keep their action footer visible. Do not remove the shell inset or add padding workarounds to individual titles and footers. Keep content and footer edges on this same inset. Shared modal scroll regions place symmetrical tracks within the existing shell inset, preserving content width and centering. Mark independently scrolling form or picker regions with `ui-dialog-scroll`; the shared body uses the same recipe when it owns scrolling. Do not add competing padding or scrollbar fixes in modules. Module CSS owns width, height and task layout, not header typography, shell corners or duplicate header/body insets. The full-screen email editor, dark photo viewer and gallery settings drawer intentionally keep their workspace geometry, with the same title scale and aligned inner edges. Appointment detail and blog formatting popovers remain nonmodal. Session status confirmation uses the same native `Modal` for focus trapping, Escape and backdrop dismissal.

Workspaces with a shared module or product studio header have no top padding on `.admin-main`. The opaque sticky header starts at the workspace edge so scrolling content cannot show through a gap above it. Side and bottom page insets remain unchanged.

End-of-page resource lists use viewport-sized pagination. Mark the list boundary with `data-viewport-table`; shared `Pagination` measures visible rows and reserves space for filters, headings, pagination and any list footer. Client lists supply `onPageSizeChange`; server lists parse `pageSize` with `tablePageSize` and pass it to `Pagination`. Mobile card rows use `data-viewport-row`. Capacity updates on window and layout changes, keeps the current first record in view, and is bounded to 1–100 rows. The table frame fills spare space below the rows while reserving room for pagination, footers and the workspace inset. Mark mobile card frames with `data-viewport-table-frame`. Sparse and empty lists never add filler records. Embedded tables and independently scrolling dialogs keep their existing pagination.

All module tables use `ResponsiveTableFrame`, directly or through `Table`. It owns content measurement and the shared `data-table-layout` display state. Columns size to their content inside the actual workspace; a single tokenized mobile row recipe activates only when the measured table cannot fit. Sessions, Clients and the other modules keep the same records and controls in one table DOM tree at every width. Module-specific mobile lists and fixed table breakpoints are removed. Tables stay measurable through an inert, short-lived sizing probe; the probe has no IDs, names or form associations and never receives focus. The shared compact cell inset and mobile grid/gap tokens live in `design-tokens.css`. Modules may style their content and density, but must not provide alternate table display logic.

1. Reuse a component from `components/ui/` before writing a control or panel.
2. Use the semantic tokens in `app/admin/design-tokens.css` for appearance.
3. Put task-specific layout beside its module, preferably in a CSS Module.
4. Keep public branding and the Content website iframe independent of admin styling.
5. Run the scope checks and exercise the affected desktop/mobile flow before shipping.

There is no token build step, generated theme package, Shopify SDK requirement, or dependency on the old `jazz/shopify-design` extraction. Tokens are ordinary CSS custom properties maintained in this repository. Use the installed Geist fonts and system fallbacks; do not copy proprietary fonts or assets.

## Ownership and loading

| Layer | Source | Responsibility |
| --- | --- | --- |
| Document reset | `app/globals.css` | Box sizing, body margins, inherited control fonts, image bounds and screen-reader utility. No palette or module styling. |
| Admin boundary | `app/admin/layout.tsx` | Imports admin styles and wraps children in `.showrunner-admin`. Includes login and protected routes. |
| Token definitions | `app/admin/design-tokens.css` | Primitive values, semantic roles and compatibility aliases. The single source of admin appearance values. |
| Import manifest | `app/admin/design-system.css` | Loads foundation, shared recipes, shell and module layouts in explicit order. No override pile. |
| Foundation | `app/admin/base.css` | Typography, native surface defaults, focus, selection and reduced-motion handling. |
| Shared recipes | `components/ui/styles/` | Controls, fields, surfaces, tables, overlays, settings, editor and dashboard structures. |
| Navigation | `shell/admin.css` | Sidebar, drawer, responsive frame and page insets. |
| Workspace layout | CSS beside `modules/<name>/` | Calendar geometry, editor composition, media grids and other task-specific layouts. |
| Loading and feedback | `app/admin/loading.css`, `notifications.css` | Admin skeletons and notification presentation; imported after the manifest. |
| Public branding | `components/public/theme.tsx`, `theme.css`, `lib/theme/tokens.ts` | Tenant presets and public controls, applied by public route layouts. |

The root `app/layout.tsx` supplies Geist font variables and the document reset. It does not fetch tenant theme settings or import admin styles. `app/proofs/layout.tsx` and `app/uploads/layout.tsx` use `PublicTheme`. External client websites and the Content iframe own their own CSS.

Every global admin selector must begin with `.showrunner-admin`. The foundation has deliberate `html:has(.showrunner-admin...)` exceptions for document font sizing and scrolling. CSS Modules stay local, but their tokens still require an admin ancestor. Do not move token definitions to `:root` or `body`.

CSS file boundaries are ownership boundaries, not lazy-loading guarantees: the admin manifest imports the listed workspace styles for admin routes. Prefer CSS Modules for new local layouts. For a necessary global module stylesheet, scope every selector, place it beside the module, and register it once in the manifest. Review selector specificity and import order; a later module rule must not reskin a shared control.

## How the token names work

There are three kinds of names in one admin source:

- **Primitives and explicit roles:** `--sd-space-16`, `--sd-radius-container`, `--sd-color-focus`, `--sd-shadow-input`. These define the reference scale and special states.
- **Semantic aliases:** `--space-4`, `--radius-card`, `--color-surface`, `--color-text`. Prefer these when their meaning matches the UI.
- **Existing consumer vocabulary:** `--admin-*`, `--workspace-*`, `--data-table-*`, `--catalog-*`, and short aliases such as `--ink`. These preserve existing consumers while resolving to the same admin source. They are not another theme. Prefer descriptive semantic names in new code.

For example, `--radius-card` resolves to `--sd-radius-container`, which is `1.25rem`. Tenant presets also expose some semantic names, but admin redefines its own values at `.showrunner-admin`; changing a client's primary color must not change the admin.

Do not infer scale values from an alias suffix: `--space-4` means **16px**, while `--sd-space-4` means **4px**, at the admin's 16px root size.

## Token reference

Values below describe the current implementation at a 16px root size. Update the matching rows when changing the source; do not paste this table into a second CSS definition.

### Color and state

| Purpose | Use |
| --- | --- |
| Working canvas / panel | `--color-page`, `--color-surface` |
| Quiet inset surface | `--color-surface-sunken` |
| Main / secondary text | `--color-text`, `--color-muted` |
| Divider | `--color-border` |
| Primary action / hover / text | `--color-brand`, `--color-brand-dark`, `--color-brand-contrast` |
| Link / hover | `--sd-color-link`, `--sd-color-link-hover` |
| Keyboard focus | `--color-focus` or `--sd-color-focus` |
| Disabled text | `--color-disabled` |
| Neutral hover / selected surface | `--color-hover`, `--color-active` |
| Status fill and text | Matching `--sd-color-success-*`, `--sd-color-info-*`, `--sd-color-warning-*`, `--sd-color-caution-*`, `--sd-color-critical-*` pairs |
| Destructive action | `--sd-color-critical-action` |
| Navigation | `--admin-sidebar-*` aliases; shell owns application |
| Photo canvas and viewer | `--sd-color-media-canvas`, `--sd-color-media-viewer`, `--sd-color-media-surface`, `--sd-color-media-text`, `--sd-color-media-muted`, `--sd-color-media-border` |
| Dialog backdrop | `--sd-color-overlay` |

Use `Badge` or existing feedback components for status whenever possible. Pair status text with its intended background and a readable label; do not communicate state through color alone. `--color-brand` in admin is the near-black action color, not the client's configured brand. Media tokens support dark photographic canvases without introducing a module palette or recoloring ordinary forms. User-selected content colors are data, not admin theme values.

### Spacing

| Semantic alias | Primitive | Pixels |
| --- | --- | ---: |
| `--space-1` | `--sd-space-4` | 4 |
| `--space-2` | `--sd-space-8` | 8 |
| `--space-3` | `--sd-space-12` | 12 |
| `--space-4` | `--sd-space-16` | 16 |
| `--space-5` | `--sd-space-20` | 20 |
| `--space-6` | `--sd-space-24` | 24 |
| `--space-7` | `--sd-space-32` | 32 |
| `--space-8` | `--sd-space-40` | 40 |
| `--space-9` | `--sd-space-48` | 48 |
| `--space-10` | `--sd-space-64` | 64 |
| `--space-11` | `--sd-space-80` | 80 |
| `--space-12` | `--sd-space-96` | 96 |

Fine adjustments can use the existing `--sd-space-1`, `--sd-space-2` and `--sd-space-6` values. Reuse the scale before proposing a new step. The shell owns `--admin-page-inset`: 32px normally, 16px at 860px and below. Modules should not add another outer page inset.

### Typography

| Alias | Reference size | Purpose |
| --- | ---: | --- |
| `--type-display` | 29px | Display text when warranted |
| `--type-h1` | 26px | Page heading |
| `--type-h2` | 15px | Section heading |
| `--type-h3` | 13px | Compact title |
| `--type-body` | 13px | Desktop interface text |
| `--type-small` | 12px | Supporting text |
| `--type-caption` | 11px | Compact metadata |

`--font-sans` and `--font-mono` resolve through Geist to working system fallbacks. `--sd-type-<role>-weight`, `-line`, and `-tracking` supply matching typography details where available; shared recipes already apply them. Use semantic HTML headings independently of their visual size. At narrow widths or coarse pointers, the shared field recipe raises input text to 16px. Do not override that back to compact desktop text.

### Shape, elevation and motion

| Role | Token | Current value / behavior |
| --- | --- | --- |
| Input | `--radius-control` → `--sd-radius-input` | 12px |
| Card | `--radius-card` → `--sd-radius-container` | 20px |
| Dialog | `--sd-radius-dialog` | 24px |
| Tag / small element / popover | `--sd-radius-tag`, `--sd-radius-element`, `--sd-radius-popover` | 8px / 10px / 16px |
| Pill action | `--radius-pill` | Fully rounded |
| Card elevation | `--shadow-panel` → `--sd-shadow-container` | Shared layered shadow |
| Popover / dialog elevation | `--sd-shadow-popover`, `--sd-shadow-dialog` | Shared overlay shadows |
| Input states | `--sd-shadow-input`, `-focus`, `-critical`, `-disabled` | Inset boundaries remain visible inside clipping |
| Motion | `--motion-fast`, `--motion-standard`, `--motion-ease` | 100ms / 150ms and shared easing |

Use shadow tokens intact rather than reconstructing their layers. Inset input rings are functional boundaries; outer glow is decorative. Photo framing uses `--sd-shadow-crop-mask`, whose large spread shades the area outside the crop. Do not replace it with a card shadow. The foundation zeros the shared duration tokens for reduced motion; local animations still need their own reduced-motion treatment.

Desktop shared fields have a 30px minimum height and buttons a 28px minimum. The shared mobile/coarse-pointer recipe uses `--sd-layout-touch-target` (44px) and `--sd-type-input-touch-size` (16px). These are minimums, not permission to clip wrapping content. Custom icon actions also need adequate targets and accessible names; the token alone does not enforce that on every element. Modules must not replace these rules with local control heights or font sizes.

`Stack`, `.ui-stack` and `.stack` share a 16px default gap; use the existing `ui-gap-*` classes for deliberate variations. Native disclosure headings use the foundation's 12px vertical padding, medium weight and 44px minimum target. Modules may arrange disclosure contents or add an enclosing surface, but should not add another vertical inset around ordinary headings. Custom menus and gallery controls can retain their task-specific composition.

## Building a module with the system

Use direct component imports in client modules. The UI barrel also exports media controls with server-action dependencies; importing a simple button through it unnecessarily traverses that graph.

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import styles from "./example.module.css";

export function ExampleFields() {
  return (
    <Card bodyClassName={styles.fields}>
      <Field label="Name" hint="Shown in the catalog.">
        <Input name="name" required />
      </Field>
      <div className={styles.actions}>
        <Button type="submit">Save</Button>
      </div>
    </Card>
  );
}
```

Render this inside an admin form connected to the owning module's validated action. The example only illustrates presentation; it does not implement persistence.

```css
/* example.module.css: arrange shared components; do not redraw them. */
.fields { display: grid; gap: var(--space-4); min-width: 0; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
```

`Button` supports `primary`, `secondary`, `ghost`, and `danger`; use `ButtonLink` for internal navigation and `ButtonAnchor` for ordinary anchors. `sm` currently shares the compact base recipe; `lg` adds padding. `Field` wraps its control in a label and accepts `hint`. Plain labels directly wrapping text inputs, selects, or textareas inherit the same stacked layout, 8px label gap, and full-width control from the shared recipe. The low-specificity fallback preserves explicit module layouts; checkbox, radio, range, color, file, and action inputs are excluded. Use a 16px gap between ordinary field groups. Associate additional validation text with the control and use `aria-invalid` for the shared error treatment.

`Card` defaults to natural height (`minHeight="none"`). Its header/footer slots render only when supplied. Choose an explicit reserved size only for a real layout contract, such as a dashboard widget; do not add empty slots for hypothetical future content. An empty field hint is hidden. `Modal` provides the shared dialog shell; `OnboardingModal` and the full-screen email editor compose the same `Dialog` interaction primitive. Module CSS may set a justified content width or layout. Keep Escape, nested-dialog isolation, guarded closing, focus return, labels and viewport scrolling in the shared implementation.

Shared recipe ownership is concrete: `controls.css` owns buttons and input states; `surfaces.css` owns cards and status surfaces; `overlays.css` owns dialogs; `table.css` owns table primitives. Editor and dashboard CSS compose these recipes. A module selector targeting `.ui-button`, `.ui-input` or `.ui-card` should normally arrange or size the component, not override its color, radius, border or shadow.

## Adding or changing a token

1. Search the token file and consumers for an existing role. Reuse it if the meaning fits, even if the current color happens to match another role.
2. Determine the owner: shared appearance belongs in the token source; reusable interaction styling belongs in the shared recipe; task geometry belongs in its module.
3. If a recurring role is missing, add one clearly named `--sd-*` definition to `.showrunner-admin`. Add a semantic alias only when it improves the consumer contract. References must resolve without tenant values or cycles.
4. Update every affected state and consumer. Changing a shared token affects all admin routes, including login and dialogs.
5. Update this guide's relevant reference row and run the checks below. Review both dense and empty states, keyboard interaction and public isolation.

Do not add per-module palettes, literal hex/RGB/HSL colors, font stacks, shadow recipes, or one-off radius scales. Do not use `!important` or a late override file to fight a shared recipe. Locate the owning rule and fix it there. Existing `color-mix()` expressions do not justify creating new palettes; prefer an existing state token.

Values representing **data or geometry** can remain local: image focal coordinates, calendar positions, chart percentages, aspect ratios, column counts, breakpoints, and zero/full-circle shapes. An inline style calculated from booking duration is not the same as an inline custom button color. Keep these distinctions explicit during review.

## Public branding boundary

`lib/theme/tokens.ts` is still the public tenant preset implementation. `PublicTheme` fetches site settings and applies those values to `.public-theme`; its stylesheet preserves public controls. It is not an alternate admin skin. Public proofing has its own CSS Module. A new public route that needs tenant styling must opt into `PublicTheme`; it must not depend on the root layout supplying theme variables.

Never wrap public pages in `.showrunner-admin`, import the admin manifest into the root layout, or copy admin colors into a client website to fix a preview mismatch. Content previews render the actual website in an iframe. The bridge and external booking integration remain website-owned; inspect their integration contracts before making changes.

## Verification and troubleshooting

From the repository root:

```powershell
node --import tsx --test test/admin-design-scope.test.ts
node test/admin-design-browser.mjs
node test/admin-notifications-browser.mjs
node test/dialog-browser.mjs
node test/portfolio-proof-browser.mjs
```

The browser scripts require an available Playwright module and Chromium. If they are not on the default resolution path, set `PLAYWRIGHT_MODULE` to the installed module's importable entry (a `file:///.../index.mjs` URL is suitable) and `CHROMIUM_PATH` to the browser executable. They use synthetic fixtures without database access. Captures go under `.impeccable/review/` and are ignored by Git.

The scope test follows manifest imports, verifies global admin scoping and public layout separation, rejects literal colors/fonts/shadows in scanned admin styles, and checks token aliases for duplicate definitions, missing references and cycles. It checks inset input rings. It does **not** prove every stylesheet is imported, enforce every spacing/radius value, inspect all inline styles, or certify contrast/accessibility.

The admin browser fixture checks font fallback, tenant isolation, field sizes, disabled/error presentation, focus rings, dialog dismissal/focus return, crop masking and keyboard framing, mobile targets/overflow, and booking-rule selection/layout. The public fixture checks proofing selections, payment-return behavior and revoked-link handling. Neither replaces testing real enabled module routes with representative data.

For implementation changes, also run `npx tsc --noEmit`, targeted ESLint, relevant behavior tests (`npm test` for a broad pass), and `npm run build` when changing imports or shared structure. Inspect login, a dense table, an editor, a dialog and mobile navigation after changes to shared recipes. Keep public pages in the regression pass. A passing build does not verify visual appearance.

| Symptom | Investigate |
| --- | --- |
| Tenant color changes admin | Missing admin boundary or an alias inheriting from a tenant/root definition |
| Default serif font | Missing font variable fallback or missing foundation import |
| Token appears ineffective | Later module skin, selector specificity, wrong semantic role or absent stylesheet import |
| Focus border disappears | Overridden inset shadow or a clipping container; fix the shared recipe rather than adding clearance |
| Mobile overflow | Fixed content width, grid child without `min-width: 0`, or table overflow escaping its container |
| Public page loses branding | Missing `PublicTheme` layout or reliance on admin-only classes |

## Migration and documentation maintenance

The root stylesheet no longer owns admin styles. The old folder-tab component and unused synthetic `StudioEditor`/visual-block renderer were removed; active Content fields and the Puck iframe remain. Update the owning module or shared recipe instead of resurrecting these paths.

Maintain this guide with the token source. Keep README, DESIGN.md, PRODUCT.md, module guides and design-tool metadata pointing here. The ignored `docs/` directory contains local material; it is not a substitute for tracked developer documentation. Historical audits and plans retain dated evidence, with explicit supersession notices where their styling instructions conflict. Do not present an old screenshot, preset table or audit pass as current verification.


## Notifications

Keep confirmations to the completed action: “Session created.” or “Changes saved.” Do not narrate things that did not happen or repeat workflow details. Add detail only when the user needs it to act.

The protected admin layout owns one `NotificationProvider`, including toast markup; `app/admin/notifications.css` owns its presentation. Use `useNotify()(message, tone)` after client operations and `<Notification queryKey="saved">{message}</Notification>` for redirect feedback (`tone="danger"` and `queryKey="error"` for failures). Import directly from `components/ui/notifications`. For `useActionState` feedback, pass the result object as `eventKey={state}` so a repeated identical failure is announced after another attempt. The originating query flag is consumed without removing filters or the current selection. Next's `searchParams` values are already decoded; do not decode them again.

Action feedback appears in a compact bottom-center toast, never a page-header banner. Confirmations expire after at least five seconds, with more time for long messages; errors remain until dismissed. Hover, keyboard focus and hidden tabs pause automatic dismissal. Keep field validation, upload progress and retry controls beside their task, including inside dialogs. The host follows an open native dialog so feedback remains visible and keyboard-accessible. Notifications are session-local, without a persistent inbox or external delivery.

References: [Shopify Toast API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/toast-api) and [messages and feedback](https://shopify.dev/docs/apps/design/user-experience/alerts). Shopify's design article and current API describe different placements; Showrunner follows the API's bottom placement and the approved requirement to keep feedback out of page headers.

## Loading

Keep the existing shell visible during navigation. Sidebar links use Next's actual pending state with a short visual delay, so fast navigation does not flash an indicator. Route fallbacks use the destination's table, editor, gallery, website workspace or calendar shape; the protected parent boundary also covers dedicated static routes and nested records. Keep known page headings visible, hide placeholder controls from assistive technology, and announce loading without implying measured progress.

`app/admin/loading.css` scopes neutral placeholders and reduced-motion behavior to admin. Service-library searches retain existing results while fetching and disable stale selections until the response arrives. Public loading screens and client website branding remain independent.

## Time controls
User-facing times use 12-hour values with explicit AM/PM, independent of the device locale. Use `TimeInput` from `components/ui/time-input.tsx` in place of native time inputs, and `DateTimeInput` for combined date/time fields. Give combined controls a task-specific `aria-label`; keep their `name` on the shared component so it submits the existing canonical `HH:mm` or `YYYY-MM-DDTHH:mm` payload. Format labels with `formatTime`, `formatDateTime`, or `formatTimeValue` from `lib/format.ts`. Numeric timezone and calendar calculations remain 24-hour.

Table sections can use `ui-section-card`, `ui-section-header` and `ui-section-body`: separate cards with compact black headers, 15px section titles, white secondary add actions and a 16px body inset. Card titles deliberately use the compact heading scale; dialog titles retain the larger section scale.

The session builder uses these headers for details, status/booking availability, organization, packages, suggested add-ons, scheduling options and booking terms. Collapsible sections keep native summaries and keyboard behavior. Section cards allow popovers to overflow; round the header itself instead of clipping the whole card. Noninteractive `admin-editor-section` anchor targets retain programmatic focus without a section-sized outline; controls inside them keep their own focus indicators.

Use `ui-table-card` for Packages and Suggested Add-Ons: the title/action bar and table share one outer surface. Place the table directly below the header, without a padded `ui-section-body` or a second bordered/rounded frame. The table frame owns the card’s lower corners.

## Shared table appearance

`app/admin/design-tokens.css` owns the `--data-table-*` palette, density and frame values; `components/ui/styles/table.css` applies them to `Table`, catalog tables, legacy `.table`, structured Clients/Payments shells and table cards. Module styles may define column widths, alignment, wrapping of content and explicit density, but must not introduce another table palette, frame shadow or header skin.

Use a compact black title/action bar (15px title, white add button), light gray column labels (12px, 32px height), white rows (48px default), subtle separators, a 20px outer radius and no elevated shadow. Headers stay on one line; reserve `--data-table-actions-width` (80px) for a single icon action column including its padding. Long labels truncate rather than increasing header height. Compact tables use the shared 32px row / 4px vertical-padding tokens. Embedded table cards and structured shells reserve a body floor equal to the column-header height plus the 80px empty-state height in both empty and populated states; viewport lists and fixed-size modal tables retain their own fill behavior without filler records. Selection, hover, dirty-row and disabled states remain visible. Icon-only secondary row actions use the shared quiet action treatment.

`ui-table-card` combines the title bar and table in one frame; do not add a padded body or nested border. Structured shells keep their filters and pagination on white toolbars. Embedded table cards grow naturally above their shared minimum height, while `data-viewport-table` and dialog grid layouts own their reserved space. Loading placeholders use the same header, row and border tokens. Public tenant styles and domain calendar layouts do not inherit the admin table recipe.

Mobile section-header secondary actions use `--section-header-action-visual-height` (28px) inside the standard 44px touch target; the white pill is drawn separately so visual size does not expand with the hit area. Header padding stays compact. Native section summaries use a centered flex row and a shared disclosure chevron. The mobile sidebar trigger is portaled into the existing module page header, leaving Save actions unobscured without a duplicate app bar. `AdminMobileMenu` discovers headers containing an h1, `.product-studio-header`, or an explicit `data-admin-page-header`; it follows streamed headers and route replacements, cleans up its host marker, and remains hidden on desktop. A compact fallback exists only when there is no page header.

Asset-picker dialogs reserve their full library height before requests finish. The body and library view flex into that height; only results scroll, keeping the footer fixed. Upload remains on the right of search, including mobile.

Empty table placeholder rows do not receive row hover styling. Intake rules render their empty message outside the tbody, matching the embedded package-table pattern. Their settings use three equal columns below a shared divider; the switch labels are Require T&C Acceptance, Require Approval and Offer Waitlist. Reusable rule-set saving remains an action in the rule-library modal, not a requirement on the main table.

The calendar marks its heading with `data-admin-page-header` and retains its mobile grid: title and menu share the first row, with calendar navigation and actions below.

Booking-option label/switch pairs hug their contents with an 8px internal gap and are centered together on desktop. Mobile stacks each pair in one of three equal columns. At mobile widths, the visible policy label shortens to Require T&C; its accessible name remains Require T&C Acceptance. Desktop retains the full label.

`MediaTagPicker` composes the shared `Field` recipe so Tags uses the normal 13px label scale and 8px control gap wherever it is embedded. Media inspector metadata retains its deliberately smaller scale. Session details places Tags after Active; an editor without a sidecar spans the available form columns.

Every populated table row keeps a 1px bottom divider, including the final row above reserved space. `--data-table-row-divider` uses the standard border tone rather than the subtle border tone, so record boundaries stay visible without hover. Empty placeholder cells do not receive a record-ending divider. This rule applies to all shared admin table families.

Table cards reserve at least two standard rows through `--data-table-reserved-rows`, with the 80px empty-state height as a floor. The calculation includes cell padding, dividers and the responsive row-control height, so the second row also fits beside mobile touch-sized actions. Cards grow naturally beyond that minimum; this reservation does not add dummy records.

Mobile navigation stays owned by the admin shell and is positioned beside the current page header. Never insert menu controls or mutate attributes inside page headers from the shell: streamed client boundaries may not have hydrated yet. Reserve header space in CSS and observe layout for alignment; keep one menu button through route changes.

Custom `SelectMenu` labels sit to the left, outside the trigger, using the shared field typography and spacing. Triggers use the standard 30px desktop / 44px touch control heights and regular-weight selected values. Filter rows align the control bottoms. No label is embedded inside the trigger or moved there by viewport rules. Popovers align with the control itself, excluding its label.
