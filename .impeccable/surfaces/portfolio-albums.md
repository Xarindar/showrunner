# Portfolio albums

Scope: modules/portfolio/page.tsx, album-photos.tsx, albums.module.css.
Mode: Operate. Photographers organize and browse shoots in the existing Showrunner admin shell.
Direction: Photo-covered books aligned in a responsive grid, with a visible spine, page edge, album title and photo count. Opening a book reveals a photo grid, upload control and full-size viewer. The cover is the memorable element; surrounding controls inherit the admin system.
Contract: title/create/open/browse/upload are primary; new albums default to drafts (user confirmed). First upload supplies an empty cover. Existing galleries, privacy, role scopes and storage adapters remain authoritative. Advanced publishing, sharing and proofing remain under an album disclosure.
States: empty shelf and album, upload progress, validation errors and partial failure/retry, keyboard modal browsing, mobile two-column grid, reduced motion.
Non-goals: public client-gallery redesign, storage migration, payment changes or replacing the admin-wide design system. No new dependency or schema migration.
