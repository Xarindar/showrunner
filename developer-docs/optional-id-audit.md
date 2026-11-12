# Optional form IDs

The November 2026 save regression came from treating an empty HTML selector value as a required record ID. It affected legacy session drafts and newly added flat-rate packages. An optional Zod string accepts `undefined`, but does not automatically accept `""`.

Client-safe schemas in `lib/record-id.ts` normalize blank optional edit IDs to `undefined` and blank nullable references to `null`. Required package IDs, selected document IDs, asset IDs, and arrays of selected IDs remain strict. Hourly pricing still validates the selected rate against the current business.

| Area reviewed | Result |
| --- | --- |
| Session packages, included services, add-ons | Normalize empty hourly-rate references and unlinked library IDs; serialize unselected rates as null. |
| Hourly-rate creation | Accept a blank optional create ID; keep name, price and rate-ownership validation. |
| Reusable service creation | Use the same optional create-ID schema. |
| Forms and booking terms | Use the same optional create-ID schema; require an ID when an edit version is present. Blank document selections remain invalid and have explicit guidance. |
| Media upload and metadata editing | Remove the unused create ID from upload metadata. Updates still require an ID; blank filenames have an explicit error. |
| Products and billing | Existing `optionalId` handles blank parent, variant and client selectors. No change needed. |
| Communications, automation and portfolio | Existing optional stored-text normalization handles unselected references. No change needed. |
| Staff, resources and service bundles | Existing trimmed optional create IDs accept blank HTML values. No change needed. |
| Public booking and commerce | Optional single selectors already allow blank values. Selected-ID arrays and required IDs stay strict. |

Regression coverage: `record-id.test.ts`, pricing/session/library/action tests, booking document tests, media upload/metadata tests, and `session-save-browser.mjs`. Browser coverage checks untouched legacy sessions, new flat-rate packages, creating a rate within a package without submitting the outer form, and saving an hourly package. Tests use isolated fixtures; no live records are rewritten.
