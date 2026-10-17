# Showrunner admin design system

The admin uses the Shopify-inspired reference approved on 16 October 2026. The source reference is `jazz/shopify-design`; its 127 token declarations are copied to `app/admin/design-tokens.css` with only the root selector renamed to `.showrunner-admin`. `app/admin/design-system.css` maps them to Showrunner's existing semantic variables and component classes. Import these styles only through `app/admin/layout.tsx`. Do not modify tenant tokens in `lib/theme/tokens.ts` to style admin.

The migration log is `jazz/shopify-design/SHOWRUNNER-MIGRATION.md`. The session design reference is `jazz/shopify-design/sessions.html`.

Use a dark rail, white working canvas, restrained neutral pill actions, 26px/500 page headings, 15px section headings, 13px desktop text/fields, 20px panels, 12px controls, blue focus and semantic status feedback. On narrow screens keep 44px targets and 16px input text. Use existing shared UI components rather than reimplementing these recipes in each module.

Resource types belong in navigation, rather than folder tabs wrapped around unrelated tables. Indexes use a compact header, search/filters, natural-height data rows and pagination. Editors use continuous task sections with supporting settings beside the main editing column; related service/package items collapse to summaries and expand inline with Done. Confirm removal and explain its effect. Preserve existing capability and permission checks.

Calendar, media grid, analytics, communications and actual website preview retain the layouts needed for their tasks. Admin design must not recolor client sites, public booking, portals, image contents, charts or the Content iframe.
