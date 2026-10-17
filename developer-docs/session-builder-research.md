# Session and package builder: research and first refinement

Research date: October 15, 2026. Scope: creating and editing reusable session
types and their packages, including the catalog entry point and the distinction
from service bundles. The owner requested one module at a time, followed by
review before continuing to other modules.

## What the comparable products actually mean

| Product | Documented hierarchy and task | Useful lesson for Showrunner | What not to copy |
| --- | --- | --- | --- |
| Pixieset Studio Manager | Bookings → Session Types → New Session Type; general details, availability, intake and payments belong to that type. Add-ons belong to an existing type, under Payments. | Keep a reusable offering together; give advanced booking rules defaults; make extras explicit. | Pixieset's print/download packages are a separate Store concept, not evidence of a session-tier editor. |
| Squarespace Commerce | Service products represent non-shipped services. Squarespace separately recommends appointments for scheduled times and projects for bespoke work such as weddings. | Distinguish defining an offering from arranging a client's appointment. | A service product's inventory and variants are not a complete scheduling model. |
| Acuity Scheduling | Appointment types define the bookable service. Add-ons can alter price/time. Packages are prepaid appointments redeemed with a code. Mobile app supports creating types and add-ons. | Keep core setup available on mobile; communicate what an extra changes. | Its package concept is a prepaid entitlement, not Showrunner's alternative coverage tiers. |
| Shopify | Product → variants for choices; bundles combine products and have their own product listing. Booking services uses an app. | Name parent choices and combinations of separate offerings differently; preserve a common product context. | Inventory combinations, SKUs and shipping controls do not belong in the session builder. |
| HoneyBook | Services Hub stores reusable offerings; services can be reused in client files and connected to invoices/contracts. Its documentation now describes former packages as services. | Separate the reusable catalog from a particular client's agreement; avoid inconsistent names within one workflow. | A smart-file/proposal designer would substantially expand this iteration. |

Primary sources checked:

- [Pixieset: Creating Full Session Types](https://help.pixieset.com/hc/en-us/articles/7990353777165-Creating-Full-Session-Types)
- [Pixieset: Offering session add-ons](https://help.pixieset.com/hc/en-us/articles/46932866012045-Offering-session-add-ons)
- [Pixieset: Selling print and digital packages](https://help.pixieset.com/hc/en-us/articles/115003009111-Selling-print-and-digital-packages)
- [Squarespace: Service products](https://support.squarespace.com/hc/en-us/articles/206540867-Service-products)
- [Acuity: Packages, gift certificates, and subscriptions overview](https://help.acuityscheduling.com/hc/en-us/articles/16676947677325-Packages-gift-certificates-and-subscriptions-overview)
- [Acuity: Using add-ons](https://help.acuityscheduling.com/hc/en-us/articles/16676886445837-Using-Acuity-Scheduling-add-ons)
- [Acuity: Creating offerings in the mobile app](https://help.acuityscheduling.com/hc/en-us/articles/27890983948429-Creating-appointment-types-classes-and-coupons-with-the-Acuity-Scheduling-Admin-mobile-app)
- [Shopify: Adding variants](https://help.shopify.com/en/manual/products/variants/add-variants)
- [Shopify: Bundle eligibility and considerations](https://help.shopify.com/en/manual/products/bundles/eligibility-and-considerations)
- [Shopify: Selling services](https://help.shopify.com/en/manual/products/digital-service-product/selling-services-or-digital-products)
- [HoneyBook: Manage and use services](https://help.honeybook.com/en/articles/5643712-add-manage-and-use-services-in-honeybook-smart-files)

These are documented workflow comparisons, not hands-on tests of authenticated
competitor accounts. The design choices below are our inference from those
workflows and the Showrunner tests; no competitor establishes a universal ideal.

## Intended hierarchy

```text
Services
├── Session types: reusable offerings, such as Wedding photography
│   └── Wedding photography
│       ├── Packages: Essential or Signature, each with price and duration
│       │   └── Included coverage: choose from items defined once for this type
│       └── Optional extras: paid additions to the selected package
├── Categories: organize the catalog
└── Service bundles: combine separate services

Appointments
└── A client's booked session: agreed date/time, chosen offering and price
```

Package coverage describes what is included during one session; it does not
schedule separate appointments. Extras currently add a one-time price, not time.
Online package selection remains unavailable; this pass does not implement a
public checkout or change saved booking snapshots.

## Baseline evidence

Two isolated GPT-6 Luna testers used only the UI, without source, product docs,
competitor findings or each other's reports. Each started at the dashboard and
predicted their first click before navigating. The local preview on port 3103
used the existing isolated session-check database. Neither baseline tester saved
a valid record.

| Task / measure | Desktop, 1440 × 900 | Mobile, 390 × 844 |
| --- | --- | --- |
| Find the reusable offering builder | Services was the predicted and correct first click | Services was the predicted and correct first click |
| Enter two packages, shared/different coverage, a priced extra | Success without navigation hints | Success without navigation hints |
| Ease, self-rated 1–7 | 6/7 | 6/7 |
| Hierarchy comprehension, self-rated 0–10 | 7/10 | 6/10 |
| Explain service bundles | Inferred from the separate builder, confused by overlapping Package labels | Relationship unclear from the initial flow |
| Leave a populated draft | Work discarded without warning | Cancel discarded work without warning |
| Save with a required extra inside a closed section | Not tested | Section stayed closed; no visible recovery; record not saved |

The desktop tester opened an existing session editor. Its attempt to open
Appointments did not complete navigation, so the actual booked-session flow was
not verified. The mobile tester reported the sticky Save area covering lower
content while scrolling; this is a geometry observation to inspect, not evidence
that the controls were unreachable. Tool latency is not counted as product task
time. No reliable stopwatch or exact click count was collected.

An independent static assessment found zero detector findings in four baseline
TSX targets. Source inspection identified missing focus after adding a package,
34px secondary buttons, missing draft departure protection, and incomplete
arrow-key support in the shared edit-screen tab component when a second tab is
present. A zero detector count did not catch the confirmed mobile validation bug.
The visual review was completed before detector findings entered the synthesis.

## Decisions for this iteration

1. **Keep what tested well.** Preserve Services as the entry point, the desktop
   comparison matrix, shared coverage definitions, optional extras, and the
   mobile stack with the newly added package expanded. Do not introduce a wizard
   or reorganize the global sidebar based on this limited study.
2. **Use one label for each relationship.** Session types contain Packages;
   Service bundles combine separate services. Apply these names through list,
   edit action, section title, builder and save feedback, retaining URLs/storage.
   Explain relationships at the decision point. Use Duration for the time field
   so it cannot be confused with included coverage items.
3. **Make failures recoverable.** Reveal all enclosing disclosures before native
   validation focuses an invalid field. Follow the existing content editor's
   link/reload warning pattern for changed session/package drafts. Compare actual
   form values, including package JSON, and ignore React action metadata.
4. **Respect mobile interaction.** Make package actions at least 44px tall; move
   focus to the name of a newly added or duplicated package. Preserve blank Add
   package versus explicit Duplicate. State that extras change price and that
   extra time must be agreed when booking.
5. **Describe availability honestly.** Label the catalog state Draft/Active,
   without promising online package checkout. No payment, public-booking, schema,
   service-link or existing appointment behavior is changed.

## Verification and review gate

The existing 155-test baseline passed before its Git checkpoint was pushed.
The refinement adds a focused guard test for unchanged/changed package JSON,
canceling and accepting departure, new-tab/same-page navigation, restoring old
values, reload handling, listener cleanup and nested invalid disclosures. All
156 tests pass. TypeScript passed. Targeted ESLint has no errors and one existing
`next/no-img-element` warning in the catalog thumbnail. Static detector output
on the edited surfaces is empty.

A third isolated, code-blind GPT-6 Luna tester started from the dashboard after
the refinement. Services was again the correct first click. It created a draft
Family Photography offering with Essential ($250, 60 minutes), Extended ($400,
90 minutes), Portraits in both, Outfit change in Extended only, and Prints ($50).
It saved, reopened, and changed Extended to $425. An incomplete extra in a closed
section reopened that section and focused its required name field on Save.

The fresh tester rated task success 4/5, ease 6/7 and hierarchy comprehension
8/10. It correctly explained reusable session types, package choices, included
coverage, extras and the role of Appointments. It did not inspect service bundle
details. These are small independent synthetic samples, not a controlled study
or proof of a measured improvement.

The departure confirmation appeared after an unsaved description edit. Browser
automation stalled when dismissing it; cancellation and acceptance therefore
have unit-test coverage, not a completed browser verification. A fresh tab
recovered control and showed the saved draft, $425 update and original description.

The primary agent then checked the saved editor at 390 × 844 and 1440 × 900.
Mobile rendered stacked expandable cards with no horizontal page overflow; the
package action buttons measured 44px tall. Add package focused the new package
name and collapsed the preceding cards. Removing that temporary package restored
the saved values, and navigating to the catalog did not trigger a false warning.
The final extra and Add optional extra controls remained reachable above Save at
the bottom of the page. Desktop retained the comparison matrix. The Service
bundles tab explained that it combines separate services, unlike package choices
within a session type. No valid bundle or appointment was created in this pass.

Review sample: `http://localhost:3103/admin/modules/services/cmva2hhpx0000bwviet0hcodu`.
It is a draft in the isolated local database. Screenshots are saved locally at
`.tmp/session-builder-mobile-refined.png` and
`.tmp/session-builder-desktop-refined.png` (not committed build artifacts).

One visible issue remains in the shared mobile admin header: a long offering name
collides with the Back label and menu area. Record it for the shell/navigation
pass; this iteration has not redesigned that shared header.

Limits: synthetic agents are not representative human participants. A 10/10
self-rating is insufficient evidence of universal usability. Browser history
navigation inside the app and operating-system tab eviction are not covered by
the link/reload warning; there is no autosave. No physical-phone or screen-reader
test has been performed. Shared tab keyboard behavior and the broader admin
navigation are deferred to the owner's next module choice.

Stop after presenting this first refinement for the owner's review. Do not apply
the same pattern to other modules until the owner gives feedback.

## Owner feedback: visual consistency and photo prominence

Organization and Intake and booking policies now share the same disclosure style
and sit together within Session details. Both have 600-weight headings and 48px
click areas, verified on desktop and mobile with keyboard expansion.

The separate Card artwork panel has been removed. The owner subsequently replaced
the shallow banner with an outlined, clickable Booking photo card within Session
details, above Session type name. Its copy explicitly says clients see the photo
when choosing the session on the booking page. The whole card opens the existing
asset library modal; there is no separate Add photo button. A selected photo uses
the same public CARD asset as the client-facing data, without an additional crop,
and retains the existing removal action.

The owner requires fidelity to both website service cards and booking choices.
This card identifies the client-facing asset, not an exact client-layout preview: website
CSS owns showcase layout/cropping, the legacy client booking list uses a centered
64px square crop, and public package booking is currently unavailable. Exact
previews must use those actual renderers when available. Do not present a
reconstructed universal card as proof of what both client surfaces display.

The earlier integrated header was checked at 390 × 844 and 1440 × 900 with empty
and populated states. Keyboard Add, Change and persisted Remove worked using the
existing picker/actions. A temporary local test image was removed afterward,
restoring the isolated review draft's original empty photo. Uploads remain
untested because this fixture has no upload driver.

The replacement Booking photo card was verified on desktop and at 390 × 844.
It stays above Session type name, fits without horizontal overflow and opens the
asset library with a pointer click or keyboard Enter. Targeted ESLint and TypeScript
passed. This pass did not upload or change a saved photo.

## Owner feedback: define included items before packages

Coverage items is now labeled What’s included. Its list, add field and suggestions
live in a separate panel before Packages on both desktop and mobile. Item names
are edited only in this first panel; the desktop matrix displays their names and
package selection checkboxes. Mobile package cards say Included in this package.
The shared editor applies the same order to new and existing session types.
Storage keys and package references are unchanged; validation messages use the new
included-item wording.

The existing-session flow was checked on desktop and at 390 × 844, including adding
an item, assigning it to a package, renaming it without losing the selection, and
removing it from the list and package choices. These temporary edits were not saved.
All six focused offering/draft-guard tests, TypeScript and targeted ESLint passed.

## Owner feedback: reusable services library

The owner confirmed that library services are reusable parts of a session, rather
than independently bookable session types. What’s included is now a table of names,
descriptions and category/tag metadata with edit/remove controls. Add item opens a
shared ServiceLibraryPicker using the existing Modal, Field and Button components
and semantic color, space, type and radius tokens. The text box, datalist and
wedding-suggestion control have been removed. The library supports text search
(including partial tags), category/tag filters, multiple selection, pagination,
empty/error states, and creating/editing a service without leaving the session.

The additive ServiceLibraryItem migration imports distinct legacy names within
each site. Library edits save immediately; session selections remain drafts until
Save session type. Linked services resolve authoritative metadata within the current
site on load/save while retaining their existing package-selection IDs. Names,
descriptions, category and tags survive form validation and persistence; new booking
snapshots preserve descriptions separately from the legacy coverage-name list.
The public package-booking renderer remains outside this pass.

159 tests pass, including new input-boundary, reference-resolution, description
snapshot and additive migration checks. Browser checks cover create, edit, duplicate
name errors, required names, search by description and partial tag, combined filters,
no-result recovery, multiple selection and package assignment. A temporary local
library service was saved and reopened in the isolated Family Photography draft
to verify persistence. Desktop and 390 × 844 modal/table/form layouts were inspected;
actions remain at least 44px tall, the modal stays in the viewport, and the creation
form scrolls while keeping its footer reachable. Keyboard search avoids submitting
the outer session form, and modal focus returns to its trigger. Unauthenticated API
requests redirect to login. Pagination beyond the small local library and physical
phone keyboards were not exercised in the browser.

The temporary library entry was removed after verification and the isolated draft's
original offering JSON restored. Eight imported library services remain. TypeScript,
targeted ESLint and Prisma schema validation pass. The migration was applied only to
the local review database; this iteration has not been deployed.


## Shopify visual reference � 16 October 2026

Inspected the signed-in Add product page at desktop and narrow widths without editing Shopify data. Applied its continuous editing column, compact field rhythm, quieter section headings, rounded bordered panels and separate supporting settings to the existing session editor and new-session form. Organization now sits beside Status on desktop; included services and packages follow Session details in the main column. The existing Save action floats without a full-width opaque footer. Mobile keeps 44px controls, single-column panels and package cards; the long contextual title is constrained within its grid cell. No Shopify commerce options or new capabilities were added.

TypeScript and targeted ESLint pass. Browser verification covers the desktop and 390px editor, new-session layout and opening/canceling the services library. This is a local design iteration, not a deployment; physical phone keyboards and a production build were not checked in this pass.


### Follow-up: field order and photo workflow

Inspected Shopify Select existing without attaching or uploading files there. The existing-session editor now follows name, description, booking photo and category; Tags stays under Organization, and intake/policies follows package editing. Booking photo uses separate Upload new and Select existing controls inside a compact dashed area. Upload new opens the native device chooser directly; dropping a file stages the first image. A local preview, cancel and explicit Upload photo confirmation reuse the existing authenticated upload action. The library keeps its existing search, filters, preview and confirmation. Device upload and library upload use independent forms to avoid duplicate file fields.

A photo action cannot discard unsaved session/package edits: the shared draft guard blocks related external form submits and shows an inline save-first warning. Existing leave/reload protection remains. Guard and library tests pass; a real local SVG upload was verified against the isolated database with package JSON unchanged, and library selection/preview was inspected. Restored the original review photo and storage setting and soft-deleted the temporary asset. Desktop/mobile proportions were inspected. Native confirmation stalled an automated browser check, so the new photo protection now uses an inline alert; automated tests cover its submit interception. Physical drag/drop and phone keyboards were not exercised. New-session photo upload before its first save remains outside this existing-session change.
