# Showrunner Refactor Report

Date: 2026-06-08

## Audit Summary

The project is already named `showrunner` in `package.json`.

The codebase was mostly aligned around a modular admin shell:

- `modules/` owns admin feature UI, manifests, actions, and module-local components.
- `shell/` owns the module registry, admin navigation, and module page loading.
- `lib/` owns domain services and reusable non-HTTP utilities.

The main gaps were cross-cutting:

- API route files mixed Next.js route mounting with endpoint behavior.
- API helpers for secrets, request bodies, and CSV output were duplicated inline.
- Several generic helpers had multiple local copies: env integer parsing, FormData conversion, record guards, public URL validation, enum label formatting, string-array display formatting, and CSS background URL escaping.
- Module docs still described an older eager/switch-based module page wiring pattern instead of the current lazy loader.

## What Changed

- Moved endpoint behavior into the owning module's `modules/<id>/api/` folder.
- Kept `app/**/route.ts` files as thin Next.js adapters that export route config locally and re-export handlers from module APIs.
- Added `lib/api/` helpers for API-specific CSV output, request body parsing, and timing-safe secret checks.
- Consolidated generic shared helpers into `lib/`:
  - `lib/env.ts` for positive integer env parsing.
  - `lib/form-data.ts` for FormData object conversion.
  - `lib/objects.ts` for record guards and unknown-object normalization.
  - `lib/security/urls.ts` for public HTTPS URL validation.
  - `lib/css.ts` for safe CSS background image values.
  - `lib/format.ts` for enum labels and string-array display formatting.
- Updated modules and public pages to use shared helpers instead of local duplicates.
- Updated module documentation so future endpoints put behavior in `modules/<id>/api/` and future shared API helpers live in `lib/api/`.

Large module pages remain inside their module folders. They are still contained by module ownership, but several can be split into module-local components later if they become harder to maintain.

## Validation

- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm run build` passed.

The first build attempt caught a Next.js route-segment rule: `dynamic` cannot be re-exported. I fixed the route adapters so `dynamic` is declared directly in route files.

## Files Touched

### Module API Layer

- `modules/scheduling/api/availability.ts` - owns availability endpoint behavior.
- `modules/communications/api/newsletter-subscribe.ts` - owns newsletter subscription endpoint behavior.
- `modules/communications/api/email-outbox.ts` - owns email worker endpoint behavior.
- `modules/communications/api/email-provider-events.ts` - owns provider webhook endpoint behavior.
- `modules/automation/api/webhook-deliveries.ts` - owns webhook delivery worker endpoint behavior.
- `modules/analytics/api/export.ts` - owns analytics CSV export behavior.
- `modules/forms/api/export.ts` - owns forms CSV export behavior.
- `modules/portfolio/api/media.ts` - owns gallery media endpoint behavior.
- `modules/communications/api/unsubscribe.ts` - owns unsubscribe endpoint behavior.
- `lib/api/csv.ts` - added shared CSV escaping/document generation.
- `lib/api/request-body.ts` - added shared API request body parsing.
- `lib/api/secrets.ts` - added shared bearer/header secret helpers.

### Route Adapters

- `app/api/availability/route.ts` - reduced to a handler re-export.
- `app/api/newsletter/subscribe/route.ts` - reduced to route config plus handler re-export.
- `app/api/internal/email-outbox/route.ts` - reduced to route config plus handler re-export.
- `app/api/internal/email-provider-events/route.ts` - reduced to route config plus handler re-export.
- `app/api/internal/webhook-deliveries/route.ts` - reduced to route config plus handler re-export.
- `app/admin/modules/analytics/export/route.ts` - reduced to handler re-export.
- `app/admin/(protected)/modules/forms/export/route.ts` - reduced to handler re-export.
- `app/galleries/[slug]/media/[itemId]/route.ts` - reduced to route config plus handler re-export.
- `app/unsubscribe/[token]/route.ts` - reduced to route config plus handler re-export.

### Shared Utilities

- `lib/env.ts` - added positive integer environment parsing.
- `lib/form-data.ts` - added FormData object conversion.
- `lib/objects.ts` - added record guard and normalization helper.
- `lib/security/urls.ts` - added public HTTPS URL safety checks.
- `lib/css.ts` - added safe CSS background image helper.
- `lib/format.ts` - added shared enum label and string-array formatting helpers.
- `lib/admin-validation.ts` - now uses shared FormData and URL safety helpers.
- `lib/events/webhook-delivery.ts` - now uses shared URL safety helper.
- `lib/email/provider.ts` - now uses shared env integer parsing.
- `lib/email/provider-events.ts` - now uses shared record normalization.
- `lib/email/render.ts` - now uses shared string-array normalization.

### Modules And Public Surfaces

- `modules/analytics/actions.ts` - now uses shared enum label formatting.
- `modules/analytics/page.tsx` - now uses shared enum label formatting.
- `modules/automation/page.tsx` - now uses shared enum label and string-array formatting.
- `modules/billing/page.tsx` - now uses shared enum label formatting.
- `modules/clients/detail/page.tsx` - now uses shared enum label formatting and record guard.
- `modules/communications/page.tsx` - now uses shared enum label and string-array formatting.
- `modules/forms/page.tsx` - now uses shared enum label formatting, record guard, and string-array formatting.
- `modules/media/page.tsx` - now uses shared string-array formatting.
- `modules/portfolio/page.tsx` - now uses shared enum label formatting and CSS background image helper.
- `modules/portfolio/public-actions.ts` - now uses shared FormData conversion.
- `modules/products/page.tsx` - now uses shared enum label and string-array formatting.
- `modules/testimonials/page.tsx` - now uses shared enum label formatting.
- `app/billing/[token]/page.tsx` - now uses shared enum label formatting.
- `app/billing/[token]/print/page.tsx` - now uses shared enum label formatting.
- `app/galleries/public-gallery-view.tsx` - now uses shared CSS background image helper.

### Scripts

- `scripts/process-email-outbox.ts` - now uses shared env integer parsing.
- `scripts/process-webhook-deliveries.ts` - now uses shared env integer parsing.

### Documentation

- `README.md` - added the API boundary note.
- `docs/module-system.md` - documented module-owned API folders, shared helper ownership, and route adapter rules.
- `docs/module-dev-guide.md` - updated module page registration to the lazy loader and added API endpoint rules.
