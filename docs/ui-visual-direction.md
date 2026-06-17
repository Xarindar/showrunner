# UI Visual Direction

Showrunner should feel like a calm operator surface for client businesses: warm, precise, and modular. The admin remains the priority, with public and embed surfaces carrying the same token vocabulary so a client can adapt the system through a preset and primary color without creating a separate theme.

## Direction

- Use warm neutrals for page and sunken surfaces, with white or near-white raised surfaces for working panels.
- Use the primary color for commitment actions, active navigation, focus, and selected states.
- Use the accent color sparingly for warnings, secondary emphasis, and brand warmth.
- Keep cards at 8px radius or less, with depth coming from borders, hairline shadows, and raised shadows only.
- Use Geist Sans for UI copy and Geist Mono for metrics, timestamps, amounts, and count-heavy stat tiles.
- Reserve dimensions whenever optional data can appear later: card header/footer slots, stat rows, table rows, empty states, skeletons, booking slots, and embed errors.

## Reference Screens

### Screen 1: Admin Dashboard

Primary route: `/admin`

```
[page header: 74px min]                         [secondary action: 40px]
[stat tile 136px] [stat tile 136px] [stat tile 136px] [stat tile 136px]
[stat tile 136px] [stat tile 136px] [stat tile 136px] [stat tile 136px]
[action card 260px] [action card 260px] [action card 260px] [action card 260px]
[panel 430px min: operational warnings table]
[panel 430px min: upcoming bookings table]
```

The dashboard is dense but calm: metric rows use Geist Mono, badges stay in reserved 26px rows, and tables keep `--row-height` even when cells are sparse.

### Screen 2: Admin Module Page

Primary routes: `/admin/modules/appointments`, `/admin/modules/products`, `/admin/modules/forms`

```
[page header: 74px min]                         [primary action: 40px]
[filter card: fixed controls, reserved hints, no wrapping shift]
[tabs or status filters: 40px min]
[table frame: horizontal overflow owned by Table]
[side/detail card grid: equal columns, card min 214px]
```

Module pages should look like one system: forms use `Field`, repeated summaries use `Card` inside `EqualGrid`, optional metadata sits in `ReservedSlot`, and table overflow never leaks to the page.

### Screen 3: Public + Embed Transaction

Primary routes: `/shop`, `/book`, `/forms/[slug]`, `/embed/v1/booking`

```
[brand nav/header: 74px min]
[transaction shell: 2 columns desktop, 1 column mobile]
[product/service cards: equal height, sale/status slot reserved]
[booking/form controls: 40px min, hints reserved]
[summary/footer: fixed rows, no click-driven resize]
```

Public and embed surfaces inherit the same preset and primary color. Empty, loading, and error states reserve the final dimensions so a hosted page and an embedded widget feel first-party without introducing a separate theme path.

## Client Modularity

Client variation flows through `themePresets`, `themeToCssVars()`, and the shared `components/ui/*` primitives. New modules should accept the token contract rather than adding local visual systems. If a client needs a distinct look, add or tune a preset; do not expose arbitrary spacing, radius, type, or layout editors.
