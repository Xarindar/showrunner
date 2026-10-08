# Client gallery implementation verification

Verified locally against source base `8d6799396816dd064be6bbd50450ddaa4e218dc0`, October 8, 2026. No deployment, remote push, production data mutation, real payment, or real email was performed.

## Passed

- 141 tests using `node --import tsx --test test/**/*.test.ts`. This executes the same test files as the repository test script without the tsx CLI's sandbox-blocked IPC listener.
- TypeScript `tsc --noEmit --incremental false`.
- Full ESLint, excluding the isolated generated build directory: zero errors and three pre-existing warnings in booking.js, client-profile-card.tsx and service-catalog-table.tsx.
- Production `npm run build` with `SHOWRUNNER_BUILD_DIR=.next-gallery-proofing`. Existing htmlnano/cosmiconfig dynamic-dependency warnings remain.
- Baseline Prisma schema plus additive migration applied to isolated PGlite. Automated database tests cover legacy dangling reference preservation, constrained new references, immutable purchase pricing/selection IDs, count checks, referenced-original deletion protection, and permanent verified-refund revocation. Refund reservations/failed rollbacks do not permanently revoke a purchase.
- Real HTTP integration against the built Next server and a synthetic local database: private page and privacy headers; pre-release original denial; actual 1400×933 burned-in proof; concurrent duplicate included-selection requests produce one purchase; selected original retains 2400-pixel source width; unselected originals denied; changed finalized selection rejected; repeated finalization idempotent; revoked access denied; Next optimizer rejects private capability URLs.
- Representative mocked provider tests cover correct/wrong amount, currency, order, session and metadata; expired/open/processing/paid states; duplicate/concurrent retries; bounded idempotency replay; late provider saves; stale failure callbacks; refund-before-paid events; and permanent revocation winning over later paid events.
- A genuine approximately 23.22 MiB, 6000×4000 JPEG passed the in-process gallery action → real shared Media/server-filesystem storage → proof generation → original response pipeline with identical SHA-256. Genuine approximately 27.82 MiB and 81.009-megapixel JPEGs were rejected before storage; MIME spoofing was rejected; ordinary Media retained its 12 MiB default and the global 25 MiB maximum. Batch tests cover the 100-file/250 MiB aggregate caps and exactly one photo per request. This is not a deployed browser/HTTP multipart upload test.
- Sharp tests inspect rendered watermark pixels, reduction, source preservation, metadata stripping and fail-closed missing/corrupt sources. Security tests exercise the actual Next optimizer admission validator and private generic-media route.
- React DOM/SSR and API tests cover visual-picker pagination beyond 60 assets, search, cross-page selections, cancel/reopen, package defaults, explicit blank/zero semantics, count/overage confirmation, stale terms, duplicate submission, CSRF/origin/body bounds, selected-only downloads and checkout recovery permissions.

## Limits and required launch checks

- Runtime was **Node 24.19.0 / npm 11.9.0**, not the repository-pinned Node 22.22.3 / npm 10.x. Rerun the suite/build in the pinned deployment runtime.
- Actual browser interaction/layout QA is **not verified**. Chromium was blocked by sandbox socket permissions; the separate cloud browser could not reach the isolated executor's localhost. Synthetic DOM/HTTP checks are not a substitute. `test/portfolio-proof-browser.mjs` is an opt-in repeatable browser fixture for a capable environment.
- Stripe, Square and PayPal verification used mocks. No real or provider-sandbox checkout, webhook delivery, refund or merchant configuration was exercised. Run each intended gateway's sandbox end-to-end flow before enabling paid overages.
- The 26 MiB Next action/proxy envelopes are configured and build-validated, but deployed ingress/CDN ceilings and concurrent-upload memory capacity still need a 20–25 MiB upload test. No live bucket was used. Presigned exact-key/TTL logic is tested with mocks; operators must verify private bucket/CDN policies and private server storage paths.
- Existing commerce email receipt code remains in the normal paid-order path. Tests mocked email-related effects; no receipt or delivery email was actually sent. Private gallery links/downloads are available in the gallery UI; gallery creation does not send email.
- Existing private galleries receive no inferred entitlements during migration and fail closed for original downloads. Audit and explicitly migrate their client/package/media associations before release.
- Review configured two-decimal-currency pricing, tax treatment, 25 MiB/80 MP per-image and 100-file/250 MiB sequential-batch limits, ten-attempt checkout renewal cap, and merchant reconciliation for unverifiable legacy/Square attempts in `client-gallery-proofing.md`.
