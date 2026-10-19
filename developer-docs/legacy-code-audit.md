# Legacy code audit — 2026-10-18

## Scope and evidence

Scanned 573 application, client integration, configuration, script and test source files with TypeScript's module resolver, including literal dynamic imports and re-exports. Followed newly orphaned dependencies after removing disconnected entry points. Cross-checked symbols and paths with repository searches, checked the convention-based health loader, and reviewed loading boundaries and global styles. Generated dependencies, build output, database migrations and persisted records are not deletion candidates.

## Removed

- The disconnected Cottage616 content page, hero copy editor/action and legacy site guard.
- The retired draggable hero editor, featured-card editor and testimonials editor, with their unreachable actions and data helper. The active Content route loads the Puck editor.
- The unused service panel, duration field and unmounted availability handler. Active booking routes and scheduling adapters remain.
- Unreferenced CSS helper, payment-onboarding label helper and iframe-session implementation. Active embed gateway/session protections remain.
- Two retired public/booking skeleton components; obsolete content editor, duration-control and module-skeleton CSS. Shared UI skeleton primitives and their animation remain in use.

Total: 16 disconnected source files, plus obsolete exports and associated style rules. No database records or schema compatibility paths were removed in this audit.

## Loading corrections

The root loading boundary no longer invents a public-site navigation/header while an admin layout is resolving; it announces loading accessibly. Admin route loading remains inside the authenticated layout. The shared loading grid explicitly uses one column. Media/Portfolio fallbacks show a toolbar instead of a fabricated nine-image gallery. Content's fallback shows one preview area without the retired settings column. Mobile gallery loading puts search on its own row. These fallbacks are controlled by Next's pending route boundary, not an artificial timer.

## Deliberately retained

- Module health files: dynamically loaded by `lib/platform-status.ts`.
- Public bridge and booking browser scripts: loaded by website integrations rather than TypeScript imports.
- Legacy content profile/hero readers: still used to initialize Puck and render existing published content.
- Legacy media variants, driver readers, payment decryption, client-status normalization and module-installation adapters: still referenced by live code and existing records.
- Historical migrations and operator scripts: needed for upgrades and operations.

## Verification and limits

All 194 automated tests pass. TypeScript (including unused-local/parameter checks), targeted ESLint, whitespace validation and the loading UI design detector pass; desktop and phone loading fixture rendered within the real authenticated shell, plus Media and Content route checks. The temporary fixture was removed. No horizontal overflow on the phone fallback.

This is static reachability analysis plus targeted runtime verification, not evidence that every conditional production flow has been exercised. Dynamic integrations and data compatibility were retained where deletion could not be proven safe. Production deployment is outside this audit.
