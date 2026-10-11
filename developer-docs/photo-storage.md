# Photo storage and previews

Photo originals are grouped under `photos/<asset-id>/original.<extension>` in private storage. Generated WebP files live alongside them: `thumbnail-320.webp`, `header-1920.webp`, and `portfolio-2048.webp`. Dimensions are longest-edge limits, preserve proportions, never enlarge, and omit EXIF/location metadata. The original uploaded filename remains on MediaAsset.

Uploads generate the three approved previews before album attachment. Existing CARD and SOCIAL variants remain compatible; CARD dimensions are intentionally unchanged and not generated eagerly. Previously generated cards are labeled `card-legacy.webp`.

Public media routes reject DOWNLOAD without scoped administrator access. Client originals use the existing exact paid-selection entitlement and short-lived download route; generic signatures cannot unlock originals. Public FULL means the 2048px preview, never the stored original.

For existing S3/R2 photos, run `PHOTO_SITE_ID=<site-id> node --import tsx scripts/organize-photo-storage.ts`. Run inside the service environment. It copies originals before updating their keys, creates previews sequentially, then removes superseded objects. Stop on any failure; rerun to resume. Do not seed or replace client data.
