# Client shoot proofing and selected-original delivery

## Photographer workflow

Open **Clients → client profile → Client galleries**. Choose a paid/fulfilled order containing a service-package product, create a named shoot, and explicitly enter the included-photo allowance, extra-photo price (minor-unit precision), and currency. Product package defaults are optional; there is no implicit 30-photo/$5 policy. Extra-photo orders are not eligible as another purchased package. Gallery pricing currently supports currencies with two decimal places (for example USD/EUR/GBP); zero-/three-decimal currencies are rejected rather than displayed or charged incorrectly.

Upload a batch of JPEG/PNG/WebP images to shared Media, or search/browse existing **private** Media visually. Uploads are sequential with per-file results and a stop-after-current control. Each original can be up to 25 MiB and 80 megapixels. The client queue is bounded to 100 files and 250 MiB per batch, uploaded sequentially; each server request accepts exactly one photo. Next action and proxy envelopes are 26 MiB for multipart overhead. Other Media workflows retain the 12 MiB default and the global 25 MiB maximum. RAW formats are not supported. The original bytes are retained. Public or previously public originals must be freshly uploaded through the private workflow: changing metadata cannot revoke old public URLs/caches. Media gallery and purchase references count toward usage and prevent archiving or changing privacy.

Copy the client's private link manually. No email is sent by gallery creation. Public Portfolio curation remains separate and uses public Media; adding a private original to a public gallery remains prohibited. This feature does not publish a shoot, add a prepaid credit wallet, or automatically release every gallery image.

## Client workflow and controls

`/proofs/{token}` displays reduced-resolution WebP proofs with a repeated **burned-in** watermark. Proofs have a distinct private cache, source EXIF is removed, and the source original is not rewritten. Watermarking discourages reuse; it is not an AI-proof or screenshot-proof guarantee.

The client selects photos, sees included/extra counts and the exact overage price, and can remove extras before finalizing. Confirmation creates an immutable snapshot of image IDs, original asset IDs, package name, allowance, price, currency and total. A terms-version check rejects stale displayed prices. A gallery has one finalized selection even across multiple/reissued access links. Repeated same-selection submissions are idempotent; differing submissions conflict. Adding future gallery images never adds them to an existing entitlement.

A zero-total selection releases exactly the selected originals immediately. Extras create a commerce order and use the site's existing connected Stripe/Square/PayPal checkout. A browser success flag, an order marked paid without verified provider evidence, or a payment with the wrong amount/currency does not grant access. The browser returns through a token-free payment-return page and reloads the original private link from same-tab session storage. The private token is not sent to the payment gateway in the return URL.

Every download verifies current site, client, gallery, access status/expiration, gallery/item download controls, unchanged selected asset identity, source privacy, and payment/refund state. S3/R2 original downloads are authorized first and redirect to an exact-key presigned URL valid for 60 seconds; local server storage streams the authorized original. Previously issued short-lived bucket URLs may remain usable until they expire. Next image optimization must not accept protected local or signed remote image URLs because its public cache would outlive these checks.

## Payment and failure policy

- Pending/authorized payments release nothing. Clients can refresh payment status; existing hosted checkout can be reopened.
- Failed/canceled checkout releases nothing. “Resume or renew checkout” re-verifies the saved provider session server-side. Verified open sessions are reused; only verified expired/voided/canceled sessions without funds can create a fresh payment attempt. Selection, pricing and order remain unchanged. Paid/approved/processing or uncertain states never create another charge. A two-minute lease and row locks serialize retries; prior payment attempts remain in the audit trail, and renewal is capped at ten attempts. Interrupted Stripe/PayPal setup replays the same idempotency key only within five hours. An unknown Square setup outcome, exhausted attempts, or unavailable authoritative verification requires merchant reconciliation rather than risking a duplicate charge.
- Pending refund reservations temporarily block delivery and a failed reservation can roll back; they do not permanently revoke access. Any verified partial or full refund of the extra-photo payment revokes future selected-original delivery for that purchase. Revocation is monotonic, including after a delayed duplicate paid event. Files already downloaded cannot be recalled.
- If the underlying purchased package is canceled/refunded, the shoot is unavailable. No new originals are released.
- Changing/revoking an access link or archiving its gallery takes effect on the next authorization check. Link holders are treated as the client; send links only to the intended recipient.
- Exact configured extra prices are charged. This version does not add tax or shipping to photo overages. Confirm applicable tax treatment before enabling paid extras; do not silently reuse physical-product shipping or tax behavior.

## Migration and deployment prerequisites

The additive migration `20261008013000_client_gallery_purchases` creates optional gallery/package terms, verified payment timestamps, immutable purchase/selection tables, verified-refund revocation and snapshot-integrity triggers. Existing rows get no invented allowance, price, ownership, entitlements or payment verification. Legacy private galleries fail closed for original downloads until migrated to a client-owned package selection workflow.

The formerly unchecked `PortfolioGalleryItem.mediaAssetId` reference becomes an FK marked `NOT VALID` to preserve existing dangling strings without rewriting customer data. New writes are constrained. Audit existing references and tenant consistency, repair intentionally, then separately `VALIDATE CONSTRAINT "PortfolioGalleryItem_mediaAssetId_fkey"`. No production database was changed by this implementation.

Before deployment:

1. Back up the database and test the migration against a representative sanitized copy. Snapshot/selection immutability intentionally prevents destructive cascade deletion of finalized financial records.
2. Verify a 20–25 MiB JPEG through the deployed ingress/proxy and observe memory under concurrent users; the cloud fixture does not establish Railway or CDN request ceilings. Confirm private S3/R2 buckets/prefixes cannot be fetched from a public bucket URL or CDN. Application metadata cannot override a public bucket policy. Keep `MEDIA_ASSET_DIR` outside public/static directories.
3. Confirm all three relevant provider paid/refund webhook event types and signatures are configured. Run sandbox checkout, delayed/duplicate webhook, failed/expired session, partial/full refund and token-revocation tests on the intended gateway. Never test with real customer payments.
4. Review pricing/tax treatment and the explicit uncertain-session reconciliation policy above. Decide operational policy before enabling paid overages.
5. Deploy application and schema together, then verify client-profile creation, batches, proof pixels, selections, exact-image download authorization and cache behavior. No push or deployment is included in this local implementation.
