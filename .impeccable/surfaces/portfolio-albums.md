# Portfolio albums

Scope: modules/portfolio/page.tsx, album-photos.tsx, albums.module.css.
Mode: Experience inside the existing Showrunner admin shell. Photographers browse their work, upload photos, and open settings only when needed.

Direction contract
- Thesis: opening an album should feel like viewing a photographic gallery, using Jazzr's customer gallery as the direct reference.
- Physical scene and palette: a photographer reviews image composition at a desktop or on a phone; Jazzr's near-black photographic canvas separates the pictures from the light administrative shell. Controls use quiet ivory and charcoal.
- Content and constraints: preserve stored galleries, permission checks, privacy, uploads, publishing, sharing, proofing, and delivery. The existing album shelf and shared admin shell remain intact. No schema or dependency change.
- Signature interaction: clicking an uncropped photo fills the viewport with a dark native-dialog viewer, previous/next controls, arrow keys, Escape, and a visible position count. Focus returns through the shared dialog behavior.
- First viewport: a single-line title, photo icon/count, publication toggle, upload icon button, and unboxed settings cog above a three-column masonry photo gallery with six-pixel gutters; two columns on narrower screens. No captions, instruction paragraphs, cropped thumbnail tiles, or administrative forms compete with the photographs. Upload stays visible and the gallery accepts dropped files. Gallery settings opens a right-side panel, as the user explicitly selected.
- Form: directly adapt the supplied Jazzr gallery reference to an existing admin module; no concept tournament or new global visual identity. Use the existing Modal and server actions. CSS hover dimming respects reduced motion.

Required states: empty gallery, upload progress, partial failures/retry, public and private photos, keyboard viewer navigation, desktop/mobile, settings rename/save. All existing advanced forms stay inside the settings panel.

System boundary: PRODUCT.md and DESIGN.md describe the Content editor. This gallery is a separate local composition; preserve those documents and global tokens. The book shelf retains its current visual treatment. The open gallery owns its neutral photographic palette and fullscreen viewer in albums.module.css.

Reference: jazz/src/pages/PortfolioAlbumPage.jsx and jazz/src/styles/global.css; captured local reference at .tmp/jazzr-gallery-reference.png. Existing sample photos are reused, no shipping raster created or replaced.

Finish: browser flow verification, desktop/mobile captures, independent finish review, and documentation of the final local surface.

## Final implementation and evidence

The open album adapts Jazzr's photographic composition locally: a near-black canvas (#0b0b0b), charcoal toolbar (#131313), ivory text and upload action (#f6f5f2), and muted warm-gray metadata (#bdbbb7). The fullscreen viewer uses a deeper black (#080808). Typography inherits the shared sans family; album titles use medium weight at 20px (16px on mobile), icon counts and controls 13px. No global palette, font, or identity was introduced.

Uncropped photos flow through three masonry columns with 6px gutters, changing to two columns at 900px and 4px gutters at 600px. The toolbar stays on one line on desktop and mobile. Photo count uses an image icon and number. Eye/EyeOff toggles the existing published/draft state with a hover/focus tooltip; private visibility is preserved. Upload is an icon-only button, and the settings cog has no visible button box. Gallery settings opens the user-selected right-side panel, up to 840px wide and full width on smaller screens, retaining shared form components and the existing administrative functions. The native-dialog viewer contains the full image and provides previous/next controls, arrow-key navigation, Escape dismissal, a position count, and shared focus restoration. Visible focus, 44px minimum action heights, and reduced-motion handling remain in place.

The album shelf, shared admin shell, tenant tokens, root DESIGN.md and .impeccable/design.json remain the established shared system; PRODUCT.md now records the user-requested global rule against decorative header subtitles. These gallery-specific values belong only to this surface. Existing photos were reused; no new raster assets were created.

Verification covered album creation and rename, file-picker and drag-and-drop uploads with partial failures, private asset signing, publish/draft toggling and tooltip state, preserved image proportions, fullscreen keyboard navigation and rapid Next clicks without text selection, desktop/mobile behavior, and absence of page errors. Gallery photos keep the regular cursor; gallery/viewer images disable native dragging and the viewer disables selection. Fresh evidence is in .impeccable/review/album-open-{desktop,900,mobile}.png, album-settings-{desktop,mobile}.png, and album-viewer-{desktop,mobile}.png. The final independent follow-up review returned **SHIP**, with no material findings, for the user-requested compact single-row controls, drag-and-drop uploads, and viewer selection fix.

## Clients-aligned control refinement

The latest gallery refinement supersedes the custom dark toolbar described above. The photographic canvas and viewer stay dark; the toolbar now uses the shared surface, text, muted, border, spacing, and type tokens. Back, publication, upload, and settings use Button/ButtonLink with the same small size and 16px Lucide icons as Clients. Desktop icon controls match Clients at 34px; coarse pointers retain 44px targets. Viewer arrows also use 16px icons. No new assets, dependencies, global tokens, or behavior were introduced. Verified at 1440px, 900px, and 390px, including file selection, settings, and keyboard photo navigation; captures are .impeccable/review/gallery-refined-*.png.

## Management grid

The admin album now defaults to a compact, row-ordered square thumbnail grid, superseding the masonry layout above. Corners are square per the user’s Google Photos reference; gutters and padding use existing spacing tokens. Desktop columns adapt around a 10rem minimum, with a 16rem large option. Phones use three columns or two for large thumbnails. A single shared Button with a 16px Lucide grid icon toggles density and exposes its state with aria-pressed.

Managed grid images use THUMBNAIL (320px) and CARD (720px) variants with responsive source selection and native lazy loading. FULL is mounted only inside the open viewer. Public S3/R2 variant URLs now route through the existing resize endpoint instead of returning original object URLs; original downloads remain unchanged. No customer-facing layout, selection mode, or bulk actions were added.

Verified both sizes at 320, 390, 900, and 1440px, square corners, no full-variant gallery image requests before opening the viewer, image decoding, keyboard navigation and focus return. Existing local gallery regression passed including creation, uploads, private signing, publication, settings, and cleanup. Cloud URL routing has a standalone check: node --import tsx test/media-variant-urls.mjs. Captures: .impeccable/review/grid-{small,large}-{width}.png.

## Categorized gallery settings

The 680px settings drawer follows the Modules settings surface: shared SettingsCategory, SettingsGroup and SettingRow components arrange General and Client experience into continuous categorized lists. Shared Input, Select and Switch controls edit the title, visitor layout, publication, downloads and proofing together through one Save gallery settings action. Toggles remain aligned to the right on narrow screens; text inputs and dropdowns stack below their labels on phones. No tabs, custom control assets or new global tokens.

Management uses native disclosures for Private access, Revision rounds and feedback, and Advanced. Existing recipient, revision, media import, delivery, metadata and archive workflows remain available. The scoped and validated settings action preserves private visibility and archived status; restoring an archive stays an explicit action under Advanced.

Verification covers all three toggles on and off, layout/title persistence, saving an archive without restoring it, the existing upload/publication/private-media regression, keyboard dismissal and focus return, and no overflow or page errors at 320, 390, 690 and 1440px. Captures: .impeccable/review/categorized-settings-{width}.png and categorized-settings-controls-{width}.png.

## Pinned save and flat management options

The drawer now keeps its header and Save gallery settings footer visible, with an independently scrolling body. The footer uses the native form attribute to submit the gallery settings form while unrelated management forms retain their own actions.

Management now has one level of native expandable tools. Opened tools contain flat shared SettingRow inputs, selects and switches, without inner headings, nested expanders, card borders or separator lines. Revision feedback and the former Advanced tools are directly accessible as peers. Existing Lucide chevrons and Showrunner tokens provide all styling.

Verified persistent footer position at 320, 390, 690 and 1192px, form association, exclusive disclosure behavior, keyboard dismissal/focus return, and no overflow or browser errors. Screenshots: .impeccable/review/pinned-settings-*.png.

## Website-only Portfolio

Portfolio is now scoped to public website photo albums. The album list and selection exclude existing private galleries without changing their data or visibility. New albums use public visibility and leave proofing, downloads, access codes and revision rounds at their disabled defaults. Website settings edit only title, layout and publication, preserving unrelated legacy fields.

The settings drawer keeps its pinned save footer and shared token typography. General contains album title, visitor layout and publication. Management contains image import, gallery information and archive/restore. Client access, proofing, feedback, delivery, download, watermark and licensing controls have been removed from settings and creation. Image import accepts image assets only and retains private-media protection. Removed client-data queries and unused delivery admin actions.

Portfolio module information and the existing dashboard widget now describe website galleries; the widget retains its stored ID for existing placements. Delivery data and legacy API access controls remain intact; building the Clients delivery system is deferred as requested.

Verification passed for creation, publication, archive/restore, uploads, image import, thumbnail loading, pinned saving, and desktop/mobile layouts. Database checks confirmed new albums have no proof rounds or access links, existing delivery flags/records survive website settings saves, and private galleries stay private and excluded.
