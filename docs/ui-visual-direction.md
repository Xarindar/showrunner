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

- Admin dashboard: dense stat tiles, equal-height action cards, fixed table rows, recoverable empty states.
- Admin module pages: forms, tables, and repeated cards should inherit the same field, table, badge, and reserved grid primitives.
- Public/embed surfaces: brand-adaptive controls and slots should match first-party pages while staying bounded to preset plus primary color.

## Client Modularity

Client variation flows through `themePresets`, `themeToCssVars()`, and the shared `components/ui/*` primitives. New modules should accept the token contract rather than adding local visual systems. If a client needs a distinct look, add or tune a preset; do not expose arbitrary spacing, radius, type, or layout editors.
