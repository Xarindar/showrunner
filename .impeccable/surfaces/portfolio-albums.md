# Portfolio albums

Scope: modules/portfolio/page.tsx, album-photos.tsx, albums.module.css.
Mode: Operate. Photographers organize and browse shoots in the existing Showrunner admin shell.
Direction: Photo-covered books aligned in a responsive grid, with a visible spine, page edge, album title and photo count. Opening a book reveals a photo grid, upload control and full-size viewer. The cover is the memorable element; surrounding controls inherit the admin system.
Contract: title/create/open/browse/upload are primary; new albums default to drafts (user confirmed). First upload supplies an empty cover. Existing galleries, privacy, role scopes and storage adapters remain authoritative. Advanced publishing, sharing and proofing remain under an album disclosure.
States: empty shelf and album, upload progress, validation errors and partial failure/retry, keyboard modal browsing, mobile two-column grid, reduced motion.
Non-goals: public client-gallery redesign, storage migration, payment changes or replacing the admin-wide design system. No new dependency or schema migration.

## Implemented surface and system fit

The album shelf is a local Portfolio composition, not a replacement visual identity. It keeps the existing admin shell, shared Button and Modal components, inherited sans typography, and live brand, text, muted, border and sunken-surface tokens. PRODUCT.md and DESIGN.md describe the Content editor; their website canvas and inspector composition does not apply to this separate module.

The book is the deliberate local signature: a photo cover at 4:5, asymmetric corners, visible binding and paper edge, a dark title gradient, and a small lifted shadow. These material colors and shadows stay in albums.module.css rather than becoming global tokens. The shelf auto-fills columns from 210px; at 600px and below, books and photos use two columns. Hover lift is removed when reduced motion is requested. Album links, photo buttons, back navigation and disclosure summaries have explicit keyboard focus styles.

The primary flow is New album → title → draft → open → upload → browse. Rename uses the shared action modal. Opening another album resets its photo component; changing an album title remounts the action-modal group. Upload feedback uses status and alert semantics, retains failed files for retry, and refreshes the displayed photos. The shared photo viewer exposes previous/next buttons, arrow-key browsing and a spoken position count. Publishing, sharing, delivery and proofing remain in the native disclosure below the photos.

Evidence: modules/portfolio/page.tsx establishes the shelf, draft form, rename action and advanced disclosure; album-photos.tsx establishes upload feedback and viewer interaction; albums.module.css establishes the book treatment, responsive grids and reduced-motion behavior. This documentation pass inspected source only; final deployed behavior remains subject to the deployment verification.

No global design drift is established by this bounded review. The existing root design documentation is intentionally Content-editor-specific, and retained advanced Portfolio controls are outside this local visual refresh. No root document, sidecar token, or implementation repair is part of this documentation finish.
