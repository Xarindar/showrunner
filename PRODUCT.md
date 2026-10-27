# Showrunner

## Platform
Web application.

## Product and users
Showrunner is the reusable administration product. Client websites integrate with it; Cottage616 is the beta installation used to validate this content editor.

## Content editing
The Content module opens directly onto a published-site preview with an Edit website action. Website owners enter an editor mode in the same tab, with their actual website in the canvas and a left editing sidebar replacing dashboard navigation. Exit editor restores navigation and keeps unpublished edits during the current visit. Clicking a sidebar section snaps the website preview to it, including repeated clicks. Clicking the preview selects and reveals its matching sidebar entry. Clicking text or an image opens its section and focuses the matching field; text is selected for replacement. They can update approved text, images, and featured services. Site designers own the page sections, layout, and order; customers cannot add, remove, duplicate, or move sections.

The inspector groups fields by the visual item, with its image first. Each header slide has an accordion containing its image, title, caption, and button. Add header creates a slide inside the existing fixed section. The photo or empty image placeholder opens the media picker. The editor hides alternative text, internal location IDs, and SEO fields; accessibility descriptions remain in the site data. Native menus and links let owners switch between registered pages without losing unpublished edits.

Header images offer Adjust framing in the existing admin dialog. Owners move a crop frame over the full photo by dragging or using arrow keys, use Shift for larger keyboard steps, and zoom from 1× to 3×. The frame matches the header's current website preview proportions. Reset centers the image at its original zoom; Cancel discards the dialog's changes, and Apply framing updates the draft. Framing preserves the uploaded original. Responsive headers use larger generated previews when screen size, pixel density or zoom needs them; source resolution still limits detail.

Service selection opens a searchable photo dialog with business and tag filters. Cottage 616 and The Hive remain distinct business filters while booking links retain their configured profiles. Featured cards can inherit the booking photo or choose/upload their own, with independent framing. Framing is available for every editable website photo and the service booking photo; originals are preserved. Choosing or uploading a website image opens framing automatically. Inspector previews use the current website display proportions and saved framing. The framing dialog reserves its photo canvas before loading.

Buttons offer Page, Service (where booking is configured), and Web address destinations. Existing links remain intact until edited; Web address supports custom links. Service destinations use the service slug and open booking at its next available day. The desktop dashboard panel can collapse to a narrow expand-control rail, and its preference persists across visits. Mobile opens the existing navigation drawer from a floating menu button, with a single page header instead of a second shell header. Editor mode hides this button.

The editor uses open-source Puck inside Showrunner's existing admin shell. Draft edits preview immediately. Mobile editor changes create overrides for only the changed content, including text, links, photos, framing, and editable lists. Desktop values remain unchanged; untouched mobile fields inherit desktop updates. The inspector identifies mobile editing and can restore a section to desktop content. Public sites switch at 720px, including when resized. Publishing uses the existing authenticated, site-scoped content service, revision checks and media library. Successful publication uses the shared admin toast system; confirmations clear after at least five seconds and errors remain until dismissed. Existing Cottage616 content supplies initial values. Cottage616's integration may change to fit the reusable Showrunner workflow.

## Stack
Next.js App Router, React, TypeScript, Puck, Prisma and PostgreSQL. Websites consume Showrunner's public content API and the shared preview bridge. Existing hosting is Railway.

## Global interface rules
Keep module headers to one compact line: the name, relevant icon/count, and essential actions. Do not add decorative explanatory subtitles or text rows of status metadata beneath the title. Use accessible icons with hover/focus descriptions for compact states and actions; keep full details in settings. Photos use a regular cursor, and image viewers prevent accidental text selection and image dragging.

## Service pricing
Services → Hourly rates manages reusable named USD rates. Session types and included library services choose Flat rate or Hourly; hourly pricing selects a saved rate, and a new rate can be added without leaving an unsaved service. Hourly session/package totals use the selected rate × duration in minutes, rounded once to cents, plus flat optional extras. Included service prices are references; they do not automatically sum into package totals. Bookings calculate hourly totals on the server and retain the selected rate and agreed total when rates change later. Existing offerings default to flat rate, and existing bookings keep their saved prices. Pricing belongs in Services; Appointments remains the calendar and booking workspace.

## Portfolio
Portfolio manages public website photo albums for showcasing work. Client image delivery, private access, proofing, approvals and download workflows belong to the Clients delivery system, not Portfolio. New Portfolio albums are public galleries saved as drafts. Existing private records remain private; no data migration or deletion is implied.

Service/product showcase cards are an opt-in reusable block inside an approved page section. Owners add cards and bind them to existing catalog records, with display-only and approved client style choices. Names, descriptions, media, product pricing and service duration stay in the central catalog. Service actions reuse slug-based booking; product actions require a configured existing client product destination. See developer-docs/showcase-cards.md.

## Admin design direction
The Shopify-inspired system in DESIGN.md applies across admin navigation, resource indexes, editors and shared controls. Resource types use navigation destinations and continuous editors. Admin owns its tokens independently of tenant settings. Shared controls have one visual implementation; module styles own task-specific layouts. Public routes and client websites retain their own branding. The system and its regression checks are documented in the [admin token developer guide](developer-docs/admin-design-system.md).

Business hours on service creation and editing opens the availability controls from Scheduling rules in a dialog on the current page. Adding or removing hours refreshes the rules without navigating away or discarding the service draft; these hours apply across session types.

## Media

Saving file details keeps the inspector open and preserves the current search, folder, filters, page and scroll position. Success appears as a toast; validation errors remain beside the form without discarding edits.

File and folder cards offer Rename, Move, and Delete through a three-dot menu. Renaming files preserves their storage keys and links. Folder rename and move carry the complete nested tree, reject conflicting destinations and require access to every affected item. Delete asks for confirmation: files go to the recoverable archive and files still in use are protected; folders must be empty before removal.

Media home shows folders alongside unfiled assets; opening a folder shows only its direct files and subfolders. Filed assets appear in their own folders rather than being repeated at home. Folders preserve capitals and spaces, open into their direct children, and create new folders within the current path. Search and category filters can find files across folders. Dragging a selection box or using file checkboxes selects multiple files; picking them up shows a floating preview while preserving their grid spaces until a successful drop. Drop on a folder or breadcrumb to move the selection atomically, or use Move to with the keyboard. Cancelled or failed moves restore the files. Grid/list controls sit beside Filters and Sort. Folder creation uses a compact dialog where Enter confirms. Dropping files from the computer opens the upload queue for the hovered folder, or the current folder when dropped elsewhere in the library; the upload dialog shows the destination.
Media is a standalone module for files reused across the business. Open directly into the library, with upload, a wide search field, compact Filters and Sort controls, and removable active-filter chips. Categories, folders, tags and type are available in the Filters popover. Search takes its own row on mobile. Show details on selection. Railway bucket storage is managed infrastructure; users are not asked to choose or configure providers. Storage failures are reported as upload availability errors.

Image selection opens the full authorized image library, with folder and tag filters combined with search. The image browser uses a generous viewport-bounded dialog with visible folder icons, nested-folder breadcrumbs, and automatic loading as owners scroll. Search and tag filters remain available; failed page requests offer an explicit retry. Upload dialogs grow with their contents, centered over the admin working area on desktop and within the viewport on mobile. Use a compact Choose files toolbar, thumbnail rows and clear upload states, without a permanent dashed drop box or separate cards around each file. Batch uploads and drag-and-drop remain available.

Service creation and editing include Media: a 4:3 rectangular photo, a 1:1 square photo (the existing booking photo), and up to 50 additional images held for future use. Each photo has independent framing, with originals preserved. Selections save with the service; uploads are immediately retained in the authorized media library. The public services API exposes the two named photo shapes while additional images stay in admin until a website integration opts to display them.

## Booking schedules
Bookings contains Appointments (calendar, list and waitlist), Schedule and Staff. Schedule opens with business weekly hours, followed by upcoming closures and resource, calendar and reminder settings. Staff owns employee profiles, booking status, permission-gated admin account links and each employee's weekly availability inside their roster entry. Each weekday opens a small editor supporting multiple time ranges and copying to selected days. Saving is atomic and rejects stale schedules. Staff and resource schedules remain explicit; business hours do not imply inheritance. Legacy scheduling-rule links redirect to Schedule.

## Time presentation
Show all user-facing times in 12-hour format with explicit AM/PM. Use `formatTime` / `formatDateTime` for dated values, `formatTimeValue` for wall-clock values, and the shared `TimeInput` / `DateTimeInput` controls for editing. Storage, API payloads, calendar coordinates and timezone calculations retain canonical 24-hour values. Each weekly-hours Edit action starts from that day’s saved scoped schedule; toggling Accept appointments off and back on retains the draft time ranges.

The media library accepts images up to 12 MB and MP4, WebM, and MOV videos up to 25 MB on server, S3, or R2 storage. Video details offer native playback and seeking; playback depends on browser codec support. Media type filters distinguish images, videos, and other files. Image-only website fields remain image-only. The filter summary reserves its row so folder navigation does not shift breadcrumbs.

Media details prioritize filename, folder, and selectable tags with search and a New Tag dialog. Editorial details and accessibility are collapsed, with accessibility last. Technical file information opens from an info icon; privacy and focal-point values are preserved without library controls. Delete asks for confirmation and remains recoverable from Archived. Admin textareas cannot be manually resized.

Deleting an empty media folder asks only for confirmation. Deleting a populated folder offers Media Home or an accessible destination outside its own subtree, then moves files and subfolders before removing the folder in one transaction. Subfolder name collisions stop the change without overwriting content.

Cottage616 and The Hive team sections use editable member lists: clients can add or remove members while the site keeps its existing card design. Legacy team text, photos, framing, and mobile overrides are adapted on read and retained on save. Shared admin textarea controls disable resizing even when embedded editor styles request it.
