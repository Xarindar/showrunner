# Booking rules

## Customer-selected hourly duration

Hourly packages expose a named rate without an admin-set booking length. Public
booking asks for hours/minutes before requesting available slots. Both daily and
bounded availability requests send `durationMinutes`; booking submission sends
the same field. The server accepts whole minutes from 1 through 1440, requires a
length for hourly packages, and rejects attempts to override fixed durations.
Existing flat-rate and Fixed Time Slot packages retain their configured lengths.

Hourly add-ons use that chosen duration and never extend it. The public catalog
exposes `pricingType` and `hourlyRateCents` for packages/add-ons. Final prices and
rate snapshots are computed on the server; changing duration clears the selected
slot and renews terms acceptance, including static terms. Hourly metadata is
additive JSON, so existing package data requires no schema migration.

## Site-specific package fields

The scheduling `ModuleInstallation.settings.packageFields` list controls package
allowances in the session editor, reusable service picker and public booking
comparison. Allowed values are `locations`, `outfitChanges` and `finalPhotos`.
An absent setting preserves all fields; `[]` hides all three. This uses the
existing settings JSON and needs no migration. Keep unrelated installation
settings intact when configuring a site.

The public `/services` catalog exposes `packageFields` alongside `services` and
`categories`. The shared booking client, Cottage and Jazzr all consume it.
Stored deliverables, booking snapshots and dynamic agreement values remain intact;
this setting changes which allowances are offered/displayed. Service images,
appointment addresses, pricing and duration are independent.

Checks: `test/package-fields.test.ts`, `test/package-fields-browser.mjs`, and
Cottage's fixture-based `test/booking-browser.mjs`.

`Service.bookingRules` stores validated question/policy definitions. A null value
keeps the legacy single-question/policy behavior; an empty array explicitly
removes rules. Saving structured rules also derives the legacy text fields for
older readers. Apply migration `20261103010000_booking_rule_sets` before running
the updated server and regenerate Prisma.

`lib/scheduling/booking-rules.ts` owns field limits, validation, Contact defaults,
legacy conversion and answer validation. Contact rules reuse the booking's
name/email/phone inputs. Custom text, radio and dropdown questions have stable
IDs, categories, required flags, choices, placeholders and help text. Radio and
dropdown questions require at least two distinct choices.

Named `BookingRuleSet` records are site-scoped and require scheduling-manage
permission. Applying a set merges independent copies into a service draft;
it does not create a live reference or replace existing rules. Save the service
to persist that draft. Saving a set persists the named template immediately.

The public services response includes `bookingRules`. Booking requests send
`intakeAnswers`, keyed by rule ID. Server validation rejects missing required
answers, unknown rule IDs and forged choices before reserving a booking. Accepted
answers are stored as labelled text in the existing `Booking.intakeResponse`.
Booking Terms & Conditions acceptance continues using the established policy-acceptance flag.

`clients/booking/scripts/booking-rules.js` is the shared browser renderer. Jazzr's
`src/booking/booking-rules.js` is an identical distribution copy; keep them in
sync. Update both booking clients with the API changes before publishing
structured rules. The local Jazzr integration includes the renderer and answer
payload; deploy the API migration and browser integration together.

Verification: booking-rules and booking-rule-actions unit tests, the shared admin
browser suite, and `test/booking-rule-fields-browser.mjs`. These cover grouped
selection, field configuration, set reuse, authorization, tenant isolation,
required answers, native choices, contact reuse and unchanged legacy data.


## Forms & Terms library

Bookings → Forms & Terms manages live `BookingRuleSet` documents using the shared
admin table and modal tokens. `kind` distinguishes INTAKE and TERMS, `version`
increments on editing, and `isDefault` selects one optional default of each kind
per site. Existing saved sets remain available; policy-only sets migrate as terms.
Apply `20261107020000_booking_forms_terms` and regenerate Prisma before startup.

`Service.bookingDocumentSelection` stores `intake` and `terms`: `default` inherits
the site's current default, `none` opts out, and a document ID chooses an override.
Null selections inherit both defaults. Session-specific legacy rules remain in
place; identical inherited rule wording is deduplicated. Name, email and phone
are required globally and cannot be added as library questions.

Public catalogs resolve effective requirements and expose `bookingRules`,
`bookingFormTitle`, `bookingTermsTitle`, `policyText`, `requirePolicy` and
`bookingRequirementsRevision`. Clients must send that revision with answers and
acceptance when a document is configured. Changed revisions reject submission,
including changes during the booking transaction. Terms documents always require
acceptance. The booking snapshot retains resolved definitions, selected document
IDs/names/versions, answers and the acceptance timestamp. Existing labelled intake
responses and policy flags remain readable by booking detail screens.

Deploy the API migration and both booking clients together before enabling global
defaults. An older client without the revision is rejected when linked documents
apply, so it cannot silently skip newly required questions or terms.

Dropdown and single-choice question editors share `BookingQuestionChoices`: one input per option, Add choice, and Remove controls. The existing 30-choice/200-character limits, distinct-choice validation and stored option arrays remain unchanged.
