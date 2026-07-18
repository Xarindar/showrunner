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
  dashboard-board.tsx       # drag, resize, add, and remove UI
```

The central registry is deliberately explicit and server-only. Do not put widget render functions on `module.ts` manifests: those manifests are imported by shared shell and client code, while widgets can import Prisma and other server-only dependencies.

Saved dashboards continue to use the established `dashboard.cards.*` setting key and `cardId` placement field. These are persistence names, not the current product terminology. Renaming them would require a data migration and provides no user benefit.

## Add A Widget

1. Create `modules/<module-id>/widgets/<widget-name>.tsx`.
2. Export one object that `satisfies DashboardWidgetDefinition`.
3. Add it to the module's `widgets/index.ts` array.
4. Add that module array to `shell/dashboard-widget-registry.ts` if the module does not already offer widgets.
5. Verify small, medium, and large sizes in the dashboard.

```tsx
import { DashboardCardList, DashboardMetric } from "@/components/ui";
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
          <DashboardCardList
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

## Visual Contract

- Use `DashboardMetric`, `DashboardCardList`, `DashboardKpiRow`, and `DashboardTrendBars` before inventing widget-specific markup.
- Keep one dominant value or task per widget.
- Use divider-based rows. Do not nest bordered cards inside a widget.
- Use neutral surfaces and text. Reserve semantic color for status, warning, success, and error meaning.
- Put navigation in the shared frame; do not add a second “open module” footer.
- Do not expose destructive actions as permanent header icons. The shared frame places them in the widget options menu.
- Prefer short, concrete titles and descriptions. Avoid branded names, “AI” language, and decorative microcopy.
- Empty states must fit the same size contract as populated states.
- Widget bodies must not set fixed heights, `overflow: auto`, or viewport-dependent dimensions.

The direction follows the same principles emphasized in Shopify's admin guidance: shared patterns create familiarity, neutral color carries most content, and icons should be used consistently rather than decoratively.

## Ownership Rules

- Domain queries and links belong in `modules/<id>/widgets/`.
- Cross-widget formatting helpers belong in `shell/dashboard-widget-utils.ts`.
- Reusable visual structures belong in `components/ui/dashboard-card.tsx`.
- Dragging, resizing, menus, and placement state belong in `modules/dashboard/`.
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
8. Verify empty and populated states.
9. Verify desktop and single-column mobile layouts.
10. Run `npx tsc --noEmit`, focused lint, and `npm run build`.

## Research References

- Shopify app visual design: https://shopify.dev/docs/apps/design/visual-design
- Shopify App Home patterns: https://shopify.dev/docs/apps/build/app-home
- shadcn/ui blocks: https://ui.shadcn.com/blocks
