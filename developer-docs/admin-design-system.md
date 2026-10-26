# Admin tokens: developer guide

This is the maintained implementation guide for the Shopify-inspired Showrunner admin. It covers all `/admin` routes, including login. [DESIGN.md](../DESIGN.md) defines the visual direction; [PRODUCT.md](../PRODUCT.md) defines product behavior. The CSS source is authoritative for exact values. Historical UI plans and audit results are not instructions for new work.

## Start here

Shared `Modal` dialogs keep the rounded outer shell and header stationary. The inset `.ui-dialog-body` owns vertical scrolling, with `min-height: 0` so long content fits inside the viewport. Keep task-specific content inside that body; do not put scrolling back on the outer `.ui-modal` shell or add another competing scroller.

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

`Button` supports `primary`, `secondary`, `ghost`, and `danger`; use `ButtonLink` for internal navigation and `ButtonAnchor` for ordinary anchors. `sm` currently shares the compact base recipe; `lg` adds padding. `Field` wraps its control in a label and accepts `hint`. Associate additional validation text with the control and use `aria-invalid` for the shared error treatment.

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
