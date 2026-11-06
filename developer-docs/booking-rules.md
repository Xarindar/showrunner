# Booking rules

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
