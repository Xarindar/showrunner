# Showrunner Dashboard Widget Developer Guide

Dashboard widgets are owned by the module whose data they present. The dashboard module owns the canvas, layout persistence, add/remove controls, and shared visual primitives; it does not own domain queries or widget-specific rendering.

This boundary keeps module work local and prevents the dashboard from becoming a second monolithic feature registry.

## Architecture

```txt
modules/
  clients/
    widgets/
      recent-clients.tsx    # metadata, query, and widget body
      index.ts              # module-owned widget export

shell/
  dashboard-widget-types.ts
  dashboard-widget-utils.ts
  dashboard-widget-registry.ts
  dashboard-cards.tsx       # placement persistence and compatibility API

components/ui/
  dashboard-card.tsx        # shared frame and content primitives

modules/dashboard/
  dashboard-board.tsx       # view/edit modes, settings, placement, add, and remove UI
```

The central registry is deliberately explicit and server-only. Do not put widget render functions on `module.ts` manifests: those manifests are imported by shared shell and client code, while widgets can import Prisma and other server-only dependencies.

Saved dashboards continue to use the established `dashboard.cards.*` setting key and `cardId` placement field. These are persistence names, not the current product terminology. Renaming them would require a data migration and provides no user benefit.

Each saved placement also carries a normalized `settings` object. Widgets without declared settings persist an empty object. New settings use their declared default when an older saved placement does not contain the key, so adding a setting does not require a placement migration.

## Add A Widget

1. Create `modules/<module-id>/widgets/<widget-name>.tsx`.
2. Export one object that `satisfies DashboardWidgetDefinition`.
3. Add it to the module's `widgets/index.ts` array.
4. Add that module array to `shell/dashboard-widget-registry.ts` if the module does not already offer widgets.
5. Verify small, medium, and large sizes in the dashboard.

```tsx
import { DashboardIdentityList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit } from "@/shell/dashboard-widget-utils";

export const recentExamplesWidget = {
  defaultSize: "md",
  description: "Recent example records and their total count.",
  id: "example.recent",
  moduleId: "example",
  sizes: ["sm", "md", "lg"],
  title: "Recent examples",
  async render({ siteId, size }) {
    const limit = widgetItemLimit(size);
    const [count, examples] = await Promise.all([
      prisma.example.count({ where: { siteId } }),
      prisma.example.findMany({ take: limit, where: { siteId } })
    ]);

    return (
      <>
        <DashboardMetric label="Example records" value={count} />
        {size !== "sm" ? (
          <DashboardIdentityList
            empty="No examples yet."
            items={examples.map((example) => ({ id: example.id, title: example.name }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
```

Widget IDs are permanent storage identifiers. Use `<module-id>.<purpose>`, never recycle an old ID, and do not change an ID after release without a placement migration.

## Size And Density Contract

Widgets must adapt their information density to the provided `size`.

| Size | Intended content |
| --- | --- |
| `sm` | Header, one primary metric, and one short supporting line |
| `md` | Primary metric plus up to three list rows or three secondary KPIs |
| `lg` | Primary metric plus up to five list rows, a compact chart, or a media strip |

Use `widgetItemLimit(size)` for repeatable records. The layout converts short resized widgets to `sm` before rendering richer content. A widget must never create its own scrollbar to compensate for excessive content.

## Catalog Preview Contract

The add-widget gallery renders every available widget at its `defaultSize` by calling the module render function with `preview: true`. The module must return a stable faux-data state before running any database queries. Installed widgets continue to use live site data.

- Preview data should be realistic enough to explain the widget at a glance. Avoid all-zero states, lorem ipsum, real customer information, and account-specific colors.
- Keep the preview branch above all Prisma calls so browsing the catalog does not query every module.
- Preserve the same visual composition in preview and live modes. The preview is sample data, not a separate mockup.
- Do not add controls that only make sense inside the preview. Preview bodies are intentionally inert, and the gallery provides one explicit “Add to dashboard” action.
- Treat `defaultSize` as a product decision. It controls both the initial dashboard placement and the proportions shown in the gallery.
- The picker groups previews by owning module and searches across module label, widget title, and description.
- Previews are scaled versions of the complete widget surface. Never shorten the internal canvas to make a thumbnail fit; doing so reintroduces clipping.
- Verify each line-broken module section with its desktop three-column preview row and mobile single-column preview row.
- The visual add action is an overlay on the preview surface. It must remain keyboard focusable and expose an `aria-label` even though the visible treatment is only a plus icon.

## Widget Settings

Settings are declared by the module-owned widget and rendered by the dashboard shell. Most settings are boolean and presentation-focused: they choose which supporting details appear, not replace a module's full filtering or configuration UI. A widget may declare a persisted `date-range` setting when the product explicitly calls for a dashboard-scoped reporting window.

```tsx
export const activityWidget = {
  // ...
  settings: [
    {
      defaultValue: true,
      description: "Show the seven-day activity chart.",
      id: "showTrend",
      label: "Activity trend"
    },
    {
      defaultValue: true,
      id: "showDailyAverage",
      label: "Daily average"
    }
  ],
  async render({ settings, siteId, size }) {
    const showTrend = settings.showTrend !== false;
    const showDailyAverage = settings.showDailyAverage !== false;

    // Query and render the widget. Hide only the optional presentation details.
  }
} satisfies DashboardWidgetDefinition;
```

Date ranges persist one inclusive start/end pair and render as `MM/DD/YY – MM/DD/YY` in the settings surface:

```tsx
settings: [
  {
    defaultValue: { start: "", end: "" },
    description: "Enter both dates as MM/DD/YY. Leave both blank to use the current week.",
    id: "dateRange",
    label: "Order date range",
    type: "date-range"
  }
]
```

The shell validates real dates, requires both endpoints together, and rejects an end date before the start date. The widget remains responsible for defining what an empty range means and for treating the saved end date as inclusive in its query.

- Setting IDs are stable persistence keys. Do not rename or recycle them after release.
- Defaults should produce the most useful version of the widget.
- Read optional values with `settings.<id> !== false` when an enabled default must remain compatible with older placements.
- The dashboard normalizes submitted settings against the widget schema; undeclared keys are discarded.
- Settings save through the dashboard action and remain attached to that widget placement through drag and resize saves.
- If a choice changes domain-wide behavior rather than this dashboard summary, link to the owning module's settings page instead.

## Dashboard Interaction Contract

- Normal mode is for reading and navigation. It shows a labeled “View module” action with a right arrow in the bottom-right corner.
- Edit mode is explicit. Only edit mode exposes the top-center move hint and bottom-right diagonal resize grip.
- The settings gear remains in the header in both modes. It transforms the widget body into its settings surface instead of opening a detached menu.
- The settings surface uses a radial reveal whose origin aligns with the header action. While settings are open, the gear becomes a left-arrow return action and the original widget body is inert.
- In settings view, the bottom-right module arrow becomes a remove-widget control. Keep removal separate from property fields and retain its tooltip.
- Removing a widget always opens a confirmation dialog. Never submit removal directly from the in-card settings view.
- Dashboard-owned controls must stay outside module render functions so every widget receives the same keyboard behavior and interaction affordances.

## Responsive Layout Contract

- Desktop layout editing begins at `861px`. Moving and resizing persist the twelve-column desktop placement.
- Tablet widths from `641px` through `860px` use an automatic two-column grid. Desktop cards that occupy six columns or fewer use one tablet column; wider cards span both.
- Phone widths at `640px` and below use one full-width column. Dense widget tables and controls must not be forced into half-width phone cards.
- Move and resize controls are unavailable below the desktop breakpoint. Mobile and tablet users see an explicit automatic-layout note rather than controls whose effects would only become visible later on desktop.
- Add-widget, widget settings, removal, row navigation, and module navigation remain available at every breakpoint.
- Do not add widget-specific media queries for placement. Responsive placement belongs to the dashboard shell; module widgets remain responsible only for adapting their content to the supplied density.

## Visual Contract

- Choose a composition that reflects the domain instead of defaulting every widget to a metric followed by rows:
  - `DashboardTimeline` for schedules and queues ordered by time.
  - `DashboardRing` for readiness, coverage, or completion against a real denominator.
  - `DashboardSegmentBar` for mutually meaningful states such as sent, queued, and failed.
  - `DashboardSparkline` for a time series.
  - `DashboardIdentityList` for people-centered records.
  - `DashboardCardList` for documents, transactions, and other ledger-like records.
  - `DashboardKpiRow` or `DashboardStatStack` for a small set of genuinely distinct measures.
- The shared frame supplies the title, module identity, navigation, and settings. Descriptions belong in the widget catalog, not inside every dashboard card.
- Keep one dominant value or task per widget.
- Let the shared content stage vertically balance the complete widget composition. Do not add widget-level top margins or fixed spacers to push content into place.
- Compact focal compositions such as rings should center as a group; lists, timelines, charts, and media surfaces should continue to use the available width.
- Shared list and timeline rows are compact tables: primary label, secondary detail, date/status metadata, and the trailing action each occupy one horizontal column.
- Make the whole row the link when a destination exists. The shared primitive adds the right-arrow affordance; widget render functions should not add their own row buttons or arrows.
- Keep row-level navigation icon-only. The card-level destination is intentionally labeled “View module” so the two arrow actions remain distinct.
- Keep row values to one line and allow the shared columns to ellipsize at narrow widths. Do not stack a record's secondary detail beneath its primary label.
- Use divider-based rows. Do not nest bordered cards inside a widget.
- Use neutral surfaces and text. Reserve semantic color for status, warning, success, and error meaning.
- Put navigation in the shared frame; do not add a second “open module” footer.
- Do not expose destructive actions as permanent header icons. The shared frame places them in the widget options menu.
- Prefer short, concrete titles and descriptions. Avoid branded names, “AI” language, and decorative microcopy.
- Empty states must fit the same size contract as populated states.
- Widget bodies must not set fixed heights, `overflow: auto`, or viewport-dependent dimensions.

The direction combines Shopify-style dashboard restraint with the authored composition found in Wigggle UI. The frame stays consistent and neutral; personality comes from the information design inside it, not gradients, arbitrary palettes, or decorative copy. Do not repeat the same internal composition across every module simply because it is available.

## Ownership Rules

- Domain queries and links belong in `modules/<id>/widgets/`.
- Cross-widget formatting helpers belong in `shell/dashboard-widget-utils.ts`.
- Reusable visual structures belong in `components/ui/dashboard-card.tsx`.
- View/edit mode, dragging, resizing, settings UI, confirmation dialogs, and placement state belong in `modules/dashboard/`.
- The registry composes module exports; it must not contain query or rendering logic.

If a widget starts needing complex filters or actions, keep the widget a summary and route the user into the owning module. A dashboard widget is an overview, not a compressed module page.

## Verification Checklist

1. Confirm the widget appears only when its owning module is enabled.
2. Confirm its ID is unique; the registry throws during startup on duplicates.
3. Confirm `sm` shows no clipped list or chart content.
4. Confirm `md` fits at its default six-row height without internal scrolling.
5. Confirm `lg` remains useful without becoming a miniature page.
6. Resize across the `sm`, `md`, and `lg` thresholds and reload to verify persistence.
7. Verify its open-module link and any row links.
8. Verify declared settings persist after save and reload.
9. Verify removal requires confirmation and cancel leaves the widget in place.
10. Verify empty and populated states.
11. Verify desktop and single-column mobile layouts.
12. Run `npx tsc --noEmit`, focused lint, and `npm run build`.

## Research References

- Shopify app visual design: https://shopify.dev/docs/apps/design/visual-design
- Shopify App Home patterns: https://shopify.dev/docs/apps/build/app-home
- shadcn/ui blocks: https://ui.shadcn.com/blocks
- Wigggle UI widget collection: https://github.com/wigggle-ui/ui
