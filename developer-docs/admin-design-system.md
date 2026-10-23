# Showrunner admin design system

The admin uses the Shopify-inspired reference approved on 16 October 2026. The source reference is `jazz/shopify-design`; its 127 token declarations are copied to `app/admin/design-tokens.css` with only the root selector renamed to `.showrunner-admin`. `app/admin/design-system.css` maps them to Showrunner's existing semantic variables and component classes. Import these styles only through `app/admin/layout.tsx`. Do not modify tenant tokens in `lib/theme/tokens.ts` to style admin.

The migration log is `jazz/shopify-design/SHOWRUNNER-MIGRATION.md`. The session design reference is `jazz/shopify-design/sessions.html`.

Use a dark rail, white working canvas, restrained neutral pill actions, 26px/500 page headings, 15px section headings, 13px desktop text/fields, 20px panels, 12px controls, blue focus and semantic status feedback. On narrow screens keep 44px targets and 16px input text. Use existing shared UI components rather than reimplementing these recipes in each module.

Resource types belong in navigation, rather than folder tabs wrapped around unrelated tables. Indexes use a compact header, search/filters, natural-height data rows and pagination. Editors use continuous task sections with supporting settings beside the main editing column; related service/package items collapse to summaries and expand inline with Done. Confirm removal and explain its effect. Preserve existing capability and permission checks.

Calendar, media grid, analytics, communications and actual website preview retain the layouts needed for their tasks. Admin design must not recolor client sites, public booking, portals, image contents, charts or the Content iframe.

## Page spacing

The shared admin shell owns page insets through `--admin-page-inset`: `--sd-space-32` on desktop and `--sd-space-16` at 860px and below. Use the same token for the top and horizontal page edges, including full-width sticky headers and footers. Modules must not add their own outer top padding. The calendar subtracts the inset from its viewport height; Content's published-site preview applies it to its header while its iframe and immersive editor keep their full-width canvas.

## Notifications

Keep confirmations to the completed action: “Session created.” or “Changes saved.” Do not narrate things that did not happen or repeat workflow details. Add detail only when the user needs it to act.

The protected admin layout owns one `NotificationProvider`. Use `useNotify()(message, tone)` after client operations and `<Notification queryKey="saved">{message}</Notification>` for redirect feedback (`tone="danger"` and `queryKey="error"` for failures). Import directly from `components/ui/notifications`. The originating query flag is consumed without removing filters or the current selection.

Action feedback appears in a compact bottom-center toast, never a page-header banner. Confirmations expire after at least five seconds, with more time for long messages; errors remain until dismissed. Hover, keyboard focus and hidden tabs pause automatic dismissal. Keep field validation, upload progress and retry controls beside their task, including inside dialogs. The host follows an open native dialog so feedback remains visible and keyboard-accessible. Notifications are session-local, without a persistent inbox or external delivery.

References: [Shopify Toast API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/toast-api) and [messages and feedback](https://shopify.dev/docs/apps/design/user-experience/alerts). Shopify's design article and current API describe different placements; Showrunner follows the API's bottom placement and the approved requirement to keep feedback out of page headers.

## Loading

Keep the existing shell visible during navigation. Sidebar links use Next's actual pending state with a short visual delay, so fast navigation does not flash an indicator. Route fallbacks use the destination's table, editor, gallery, website workspace or calendar shape; the protected parent boundary also covers dedicated static routes and nested records. Keep known page headings visible, hide placeholder controls from assistive technology, and announce loading without implying measured progress.

`app/admin/loading.css` scopes neutral placeholders and reduced-motion behavior to admin. Service-library searches retain existing results while fetching and disable stale selections until the response arrives. Public loading screens and client website branding remain independent.
