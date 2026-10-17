# Session creation

The calendar's **New session** action opens a client-first form at
`/admin/appointments/new`. Choose an existing client or enter name, email and
phone; choose a reusable session type or a one-off session; enter the agreed
date, time, duration and price. This action saves the booking and client
together. It does not send email, request payment or mark money as paid.

**New session type** at `/admin/modules/services/new` saves name, duration,
and price together. Location is arranged with the client after booking and can
be added, changed or cleared on the individual session. New bookings start with
location "To be arranged" rather than inheriting the reusable type's location.
Existing saved locations are preserved. Existing business hours are summarized. When no
business hours exist, owners can set weekdays and hours in the same save;
these are the shared business hours, explicitly described in the form. Drafts
do not require hours. Scheduling adjustments are collapsed. Service, package
and category slugs are generated internally; existing links are preserved.

The interaction borrows the separation between manual bookings and reusable
offerings in [Pixieset's manual-booking flow](https://help.pixieset.com/hc/en-us/articles/7996282011021-Booking-a-session-manually-for-a-client)
and [session-type setup](https://help.pixieset.com/hc/en-us/articles/7990353777165-Creating-Full-Session-Types).
Showrunner keeps its own permissions, calendar, client records and public APIs.

## Persistence and rollout

Apply `20261014010000_simpler_sessions` before running the updated application.
It adds nullable prices and booking detail snapshots, plus flags for manual
bookings and private one-off services. Existing records and slugs are unchanged.
Prices in these forms are USD amounts recorded in integer cents. Payment
collection remains a separate billing workflow.

One-off services are inactive and excluded from the service catalog and public
service list. Manual sessions reserve time independently of public availability
rules, while checking staff, resources, both sessions' buffers, blocked time and
connected Google calendars. Manual rescheduling preserves the booked duration.
Bookings retain their agreed price, name and location when the reusable type
changes. Creation is serializable; a failed conflict check creates no client or
one-off service. Ordinary public bookings continue through the existing adapter.

Run `npm test`, TypeScript and targeted ESLint. Browser verification should cover
desktop and mobile creation, saved price/duration, inherited and first-time hours,
existing-client reuse, hidden one-offs, and a rejected conflict preserving every
form value. Use a separate local database; do not create test client bookings in
a live installation.

## Session types and package tiers

Create a session type and its package tiers together at `/admin/modules/services/new`.
One package is shown initially; **Add package** creates a blank package, while
**Duplicate** copies price, duration and coverage selections. The shared coverage matrix lets owners define a row once,
then select which tiers include it. The **What’s included** table comes before
Packages. Its **Add item** button opens the reusable service library, with search,
category/tag filters, multiple selection, and a New service form. Library services
are parts of a session, not independently scheduled session types.
Optional extras have independent prices. Existing service bundles remain available
under **Service bundles** and are not converted or deleted.

`Service.sessionOffering` stores the validated coverage rows, tiers and extras as
one JSON document, saved atomically with the session type. The first tier supplies
the service's default duration and price for existing consumers. Existing forms
that do not submit an offering preserve the stored configuration. The current
public booking rebuild remains separate; this change does not add a public tier
checkout or change the Cottage616 integration.

Manual booking offers the saved packages and extras and fills their price and
duration. Owners may adjust those agreed values before saving. Extras are one-time
price additions; adjust the booking duration explicitly for any extra coverage.
The selected package name, coverage, extras and agreed values are copied to
`Booking.packageSnapshot`. Later catalog edits do not change booked inclusions.
Legacy session types and bookings with null configuration continue to work.

`ServiceLibraryItem` holds site-scoped reusable names, descriptions, categories and
tags. Names are unique within a site ignoring case. Library creates/edits save
immediately; adding a service or changing its package selections remains a session
draft until Save session type. The existing shared Modal, Field and Button controls
provide dialog behavior. `service-library-picker.module.css` uses the shared color,
type, space and radius tokens; the picker is reused by new and existing sessions.

Apply `20261016010000_service_library` after the tiers migration. It adds the library
table and imports distinct existing included-item names per site without rewriting
session JSON or existing package references. The editor links legacy rows by name,
preserving their IDs. New/edited sessions resolve linked records within the current
site and store authoritative client-facing metadata. Reopening the session reads
current library details; existing booking snapshots remain unchanged. New booking
snapshots also preserve descriptions in optional `includedItems`. This stores data
for later client rendering; the public package-booking rebuild is still pending.

Apply `20261015010000_session_package_tiers` after the simpler-sessions migration.
It only adds nullable JSON columns and leaves existing services, bundles, bookings,
and public links intact. Local verification uses the isolated session-check database.

## Builder refinement — October 15, 2026

The Services catalog calls reusable offerings **Session types**, choices within
one offering **Packages**, and combinations of separate services **Service bundles**.
The desktop comparison matrix and mobile package cards remain. New packages receive
keyboard focus; invalid fields reveal their enclosing disclosures before native
validation focuses them. Create/edit forms warn before following links away from
changed fields or reloading. This follows the content editor's existing pattern;
it is not autosave or protection against browser history navigation within the app.
Saving an edit remounts the form at its persisted revision so the saved values become
the next clean draft. See `session-builder-research.md` for research and test evidence.
