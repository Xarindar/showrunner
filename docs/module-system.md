# Module System

Showrunner is organized as an admin shell plus contained modules.

For step-by-step implementation instructions, use `docs/module-dev-guide.md`.

## Folders

- `shell/`: shared admin frame, sidebar, module registry, icon mapping, and module types.
- `modules/`: feature modules. Each module owns its manifest, page, actions, local components, and its HTTP endpoint behavior under `modules/<id>/api/`.
- `lib/api/`: shared API helpers (CSV output, request-body parsing, timing-safe secret checks) reused by module endpoints.
- `lib/`: shared domain services and reusable utilities that are not tied to one module or HTTP endpoint.
- `app/admin/(protected)/modules/[moduleId]/page.tsx`: shared App Router entry that renders the selected module.

## Module Manifest

Each module has a `module.ts` file that exports `manifest`.

```ts
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "appointments",
  label: "Appointments",
  href: "/admin/modules/appointments",
  icon: "CalendarCheck",
  order: 30,
  description: "Booking queue, status changes, and appointment notes.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "live",
    summary: "Live booking queue, status changes, notes, and status emails.",
    primaryGap: "Calendar views, rescheduling, assignments, and audit trail are pending."
  },
  capabilities: [
    { label: "Queue and filters", status: "live" },
    { label: "Calendar view", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/appointments", "/admin/appointments/[id]"],
  dataModels: ["Booking", "Client", "Service"],
  permissions: ["appointments:manage"],
  healthChecks: ["pending-bookings"]
} satisfies ShellModule;
```

The shell reads these manifests to build navigation and settings controls. Modules describe their sidebar icon by name; the shell maps that name to the actual Lucide icon.

The `status` field remains the route/sidebar gate and still uses `active` or `future`. The newer readiness fields do not change navigation behavior; they describe whether a module is live, partial, admin-foundation, manual, or planned. Dashboard, Help, and Settings use this metadata with live checks from `lib/platform-status.ts`.

Required platform modules can set `required: true`. The registry keeps those modules enabled even if a settings form submission omits them.

Modules should declare their admin permissions in `permissions`. Server actions must enforce the matching explicit permission with `requireAdmin("<permission>")`; the admin shell uses the same permission metadata to keep navigation role-aware, but server-side checks remain the enforcement boundary.

Some modules also declare data-scope metadata for owner-configurable record access. That manifest data tells the shared scope engine which roles can be scoped and which Prisma field or relation represents ownership. The confirmed ownership link is durable: staff-backed ownership uses `StaffMember.adminUserId`, not email string matching. Supported roles can be configured per module as `ALL` or `OWN` from Settings.

Request/site ownership is part of the module contract. Admin actions should resolve the current site with `getCurrentSiteId()` or an equivalent request-aware helper and thread that `siteId` into reads, writes, slug generation, and ownership checks. Do not add new hardcoded `DEFAULT_SITE_ID` write paths.

Module pages are lazy-loaded by `shell/module-pages.ts`. Keep that registry as loader functions instead of eager imports so a runtime problem in one module does not break unrelated module routes.

## API Boundary

Showrunner keeps HTTP endpoint logic inside the owning module, under `modules/<id>/api/`. Next.js route files still live under `app/**/route.ts` because that is how App Router mounts URLs, but those files should be thin adapters that re-export from the module:

```ts
export const dynamic = "force-dynamic";
export { POST } from "@/modules/communications/api/newsletter-subscribe";
```

Route segment config such as `dynamic` must be declared directly in the route file so Next.js can statically analyze it.

Put request parsing, response shaping, endpoint-specific validation, CSV generation, bearer-secret checks, and worker endpoint behavior in the module's `api/` folder. Put reusable domain work in `lib/`, then call it from a module endpoint, `modules/`, scripts, or public pages as needed.

Shared helpers should have one owner:

- `lib/api/`: HTTP/API-specific helpers such as CSV responses, request-body parsing, and API secret handling.
- `lib/env.ts`: environment parsing.
- `lib/form-data.ts`: FormData conversion.
- `lib/objects.ts`: record guards and unknown-object normalization.
- `lib/security/urls.ts`: public URL safety checks.
- `lib/format.ts`: common display formatting.

## Workers And Scheduled Tasks

Long-running or repeated work should live behind a module API handler or shared library function, with a thin script under `scripts/` for scheduler execution.

Confirmed scheduled workers:

- `npm run email:process`: drains the email outbox. Requires `EMAIL_WORKER_SECRET` for the internal HTTP route.
- `npm run analytics:process`: runs analytics retention sweeps outside the event emit hot path. It may use `ANALYTICS_WORKER_SECRET` when configured, otherwise the internal route can fall back to `EMAIL_WORKER_SECRET`.

In-progress scheduled workers:

- `npm run booking-reminders:process`: sweeps upcoming bookings and queues reminder email through the outbox. This worker exists in code but is pre-audit until the roadmap confirms booking reminders.

Provision these as separate Railway cron services. Do not rely on the web service process to run cron work.

## Payments Boundary

Payment provider work should route through the shared payment gateway facade under `lib/payments/`. The confirmed Stripe path supports hosted Checkout, per-site Stripe Connect credentials, and owner-controlled payment-method toggles for card checkout, card-backed Apple Pay and Google Pay, Cash App Pay, Klarna, and Affirm. Apple Pay domain registration currently uses the platform URL, so per-site custom domains are a hard dependency before promising Apple Pay verification on owner domains. Square and PayPal are still roadmap work until confirmed; do not document them as shipped checkout options.

## Audit Logging

Use the shared audit helper in `lib/audit.ts` for admin actions that need a durable record. Clients CSV import/export and duplicate merge now use this shared audit trail with actor, target, and bounded before/after context where applicable. Do not add module-local parallel audit tables or ad hoc logging for actions that belong in the shared `AuditLog`.

## Styling

The shell owns global CSS variables for color, radius, spacing, typography, and admin layout. Modules should use those tokens instead of injecting global CSS.

Modules that need a different surface should use the manifest `layout` value:

- `standard`: normal admin content width and spacing.
- `wide`: wider working area.
- `workspace`: dense tool-style layout.
- `fullscreen`: module takes over the main area while auth/sidebar still belong to the shell.

Raw module CSS should stay scoped to the module folder.
