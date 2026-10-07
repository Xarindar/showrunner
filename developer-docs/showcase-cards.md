# Service and product showcase cards

`showcase` is a reusable Content Studio block. Its cards bind to the central catalog by `service:ID` or `product:ID`. Owners add/remove cards inside a designer-approved section, select a Service or Product, choose an approved card style, and optionally check **Display only (hide action)**. They cannot edit a separate name, description, image, price, or duration in the page editor. Change those fields in Scheduling or Products instead.

## Install a section

Register a block in the site's trusted manifest and place a dedicated empty host in the website:

```ts
configuredBlock("our-menu", "showcase", ["home"], {
  defaults: { heading: "Our menu", items: [] },
  presentation: { selector: '[data-showrunner-showcase="our-menu"]' },
  cardVariants: [{ value: "compact", label: "Compact" }],
  limits: { items: 12 },
})
```

```html
<section data-showrunner-showcase="our-menu"></section>
```

Use the existing publication and bridge installation in [puck-content-install.md](puck-content-install.md). Select the section in the canvas or Section menu, then **Add cards**, select **Service or product**, and publish. Section insertion/order remain designer-owned. No Cottage/Hive section or persisted client content is replaced by this feature; each client opts in through its manifest and template.

The existing authenticated `content:manage` action, tenant manifest allowlist, module availability, strict payload validation, row limits and revision checks protect saves. Public responses still require the site's publishable key with `content:read` and approved origin. Catalog queries only read that tenant's active records and enabled catalog modules. Public card output is an explicit field allowlist; private/deleted/foreign media associations are never signed or included.

## Record updates and availability

Only row ID, catalog key, display-only choice and approved style are persisted. Each public API request resolves current catalog data; changing a catalog record updates its cards without republishing the page. Reload the editor to obtain updated catalog choices and draft previews. Services supply name, description, duration and artwork; the Service model has no price field. Products supply name, summary (falling back to description), base price/currency, primary media (falling back to catalog image) and inventory availability. Variant pricing/selection remains the product destination's responsibility.

Missing, deleted, inactive, archived, foreign-tenant or module-disabled items are omitted from public cards. The editor labels stale selections **Unavailable item — choose a replacement**; publishing requires a valid replacement or removal. An active out-of-stock product remains visible with **Currently unavailable** and no action. Display-only records remain visible even when a booking/product destination exists.

## Destinations

Bookable service cards reuse `manifest.booking.path` and `profilesByCategory`. The destination uses the Service slug, `next=1`, and matching booking profile. It opens the existing next-available-date scheduling flow without choosing a slot or creating a booking. Without booking configuration, service cards are display-only.

Showrunner's public commerce contract does not supply a universal product page URL. A client with an existing product page can set `products: { path: "/shop.html", slugParameter: "product" }` in its trusted manifest. The card links to that configured page with the product slug and **View product**; no checkout endpoint, order, cart or payment is triggered. Leave this configuration absent until the client has an appropriate destination. Unsafe destination URLs are rejected.

## Layout, theme and new integrations

The shared SDK renders semantic `article`, `img`, heading, description, price, duration and optional link elements inside the dedicated host. It uses `.showrunner-showcase`, `.showrunner-showcase-card`, `.showrunner-showcase-price`, `.showrunner-showcase-duration`, `.showrunner-showcase-availability`, `data-kind` and `data-variant`. Apply the client's existing asset/card typography, colors, spacing and responsive layout to those hooks. Showrunner does not prescribe a competing site palette or new layout system.

Expose additional existing client card treatments through the block's trusted `cardVariants`; the inspector permits only these values and Site default. Use `presentation.variant` for the existing section-level integration contract. Developers with richer client rendering can listen for `showrunner:render` and reuse its resolved `showcase` payload in both public and draft modes. The default SDK renderer executes first; a custom renderer can replace the dedicated host afterward. Keep rendering in the client adapter and record resolution in Showrunner. Install the same SDK source in clients when upgrading, bump script cache versions, and preserve editor-origin/frame protections.

The preview scrolls to a newly selected section once, without repeatedly scrolling on each draft update. Opening the inspector overlays the canvas so the selected desktop/mobile viewport width remains stable. Contact shortcuts use `?section=business-info`. The sidebar's public-site link uses the configured preview website, including `CONTENT_PREVIEW_URL`, rather than the admin root.

Appointment details now keep staff-only notes separate from the customer-facing cancellation reason. Save the reason before cancellation; later edits do not resend email. Rescheduling discloses a checked customer-email choice; unchecking suppresses that notification. Calendar and detail actions share the existing explicit-false event gate. No email is sent by local tests.
