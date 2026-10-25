---
name: Showrunner Admin
description: Shopify-inspired administrative workspaces with dark navigation, compact neutral controls and clear editing hierarchy.
---

# Showrunner admin design

Use the approved Shopify-inspired system for all admin routes. `app/admin/design-tokens.css` is the sole source of admin appearance tokens. `app/admin/design-system.css` imports the foundation, shared component recipes and module-owned layouts. See the [admin token developer guide](developer-docs/admin-design-system.md) for ownership, scales, component examples, extension rules and regression checks.

Client-facing websites, booking and portals preserve their own branding. The Content editor continues to show the actual client website in an iframe, with designer-owned sections and approved fields described in PRODUCT.md. The iframe's layout, typography and imagery remain website-owned; only admin controls and chrome adopt this system.

## Composition

Dark navigation rail, white workspace, compact readable resource indexes, continuous editing sections and a supporting settings column. Resource types belong in navigation. Avoid folder-tabbed table containers. Reuse shared controls and status feedback; preserve validation, permissions, unsaved edits and keyboard access. Confirm destructive removals and explain affected records.

## Tokens

Use the scoped `--sd-*` reference tokens through Showrunner semantic aliases. Primary actions are near-black, secondary actions neutral, links and keyboard focus blue. Status colors carry meaning and labels. Desktop fields are 30px and compact actions 28px; touch controls are at least 44px and phone input text 16px. Container corners are 20px, inputs 12px, dialogs 24px, with the measured reference shadows.

Use the installed font fallback in the exported stack; do not download Shopify's proprietary font or assets. Keep Content's real iframe, domain-specific calendars, media imagery and charts distinct from administrative chrome.

## Admin dialogs
Use the shared dialog shell: 16px outer padding, 12px between header and body, and 16px between form groups. Use `module-modal-actions` for action rows with an 8px gap, aligned right, with Cancel before the primary action in DOM order. Keep scrollable contents and status messages separate from the action group.

Input boundaries use inset rings in the shared control recipe and token source for normal, focus, invalid and disabled states. External shadows are decorative only: borders and keyboard focus must remain visible inside clipped or scrolling containers. Preserve container overflow behavior rather than adding per-screen clearance patches.
