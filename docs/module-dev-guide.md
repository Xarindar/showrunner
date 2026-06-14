# Module Developer Guide

Use this guide when adding or changing a Showrunner admin module. You should not need to read the whole app to build a normal module.

## What A Module Owns

A module is a contained admin feature folder under `modules/`.

Typical folder shape:

```txt
modules/
  example/
    module.ts
    page.tsx
    actions.ts
    events.ts            # optional: module-owned event-catalog slice
    health.ts            # optional: module-owned platform health checks
    api/                 # optional: HTTP endpoint behavior (route files re-export from here)
      export.ts
    components/
      example-table.tsx
```

Use plain, direct names. Prefer names like `appointments`, `clients`, `products`, `gallery`, or `forms`. Avoid clever names, AI-themed names, and vague names.

## Required File: `module.ts`

Every module must export `manifest`.

```ts
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "example",
  label: "Example",
  href: "/admin/modules/example",
  icon: "LayoutTemplate",
  order: 100,
  description: "Short description for settings and internal docs.",
  layout: "standard",
  status: "active",
  enabledByDefault: false,
  readiness: {
    level: "admin-foundation",
    mode: "admin-only",
    summary: "Admin records are ready; public/runtime delivery is not live yet.",
    primaryGap: "Public route, widget delivery, export, and audit log support are pending."
  },
  capabilities: [
    { label: "Admin screen", status: "foundation" },
    { label: "Public route", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/example"],
  publicRoutes: [],
  dataModels: ["ExampleRecord"],
  permissions: ["example.read", "example.write"],
  settingsSections: ["Example"],
  healthChecks: ["example-setup"]
} satisfies ShellModule;
```

Manifest fields:

- `id`: stable lowercase module id. Use letters, numbers, and hyphens only.
- `label`: sidebar and settings label.
- `href`: canonical admin route, always `/admin/modules/<id>` for normal modules.
- `icon`: one of the shell icon names.
- `order`: sidebar order. Leave gaps so later modules can fit between existing ones.
- `description`: short, practical summary.
- `layout`: shell layout request.
- `status`: `active` or `future`.
- `enabledByDefault`: whether new deployments should enable it automatically.
- `required`: optional; use only for platform modules that must remain enabled for the admin shell.
- `readiness`: required status metadata for Dashboard, Help, and Settings. Use `level` values `live`, `partial`, `admin-foundation`, `manual`, or `planned`; use `mode` values `live`, `mixed`, `manual`, `admin-only`, or `planned`.
- `capabilities`: optional list of feature slices with `live`, `manual`, `foundation`, `planned`, or `missing` status.
- `adminRoutes`, `publicRoutes`, `widgetRoutes`: declared surfaces. These do not create routes; they make readiness visible.
- `dependencies`, `dataModels`, `permissions`, `settingsSections`, `healthChecks`: optional capability-manifest fields used for platform status and future install/permission work.

Available icon names:

```txt
BookOpen
CalendarCheck
CalendarDays
ClipboardList
Gauge
Image
LayoutTemplate
Mail
ReceiptText
Settings
ShoppingBag
Star
Users
Workflow
```

If a new icon is needed, add it to `shell/module-types.ts` and `shell/modules.ts`.

## Required File: `page.tsx`

The module page renders the module's main admin screen.

```tsx
export const dynamic = "force-dynamic";

type ExamplePageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

export default async function ExamplePage({ searchParams }: ExamplePageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Example</p>
          <h1 style={{ fontSize: "2.4rem" }}>Example module</h1>
          <p>Describe the work this screen supports.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Saved.</div> : null}

      <section className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Module content</h2>
      </section>
    </div>
  );
}
```

Use Server Components by default. Add `"use client"` only to small child components that need browser state or event handlers.

## Optional File: `actions.ts`

Use Server Actions for admin form writes.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export async function saveExampleAction(formData: FormData) {
  await requireAdmin("example:manage");

  const title = String(formData.get("title") || "");

  // Write to Prisma or another module-owned service here.

  revalidatePath("/admin/modules/example");
  redirect("/admin/modules/example?saved=1");
}
```

Always call `requireAdmin("<permission>")` before admin mutations. Do not use `requireAuthenticatedAdmin()` for a mutation or export; it is for the protected shell/session boundary only. The repository also has `npm run auth:check` to catch accidental bare admin guards in server-action files.

For site-owned data, resolve the current site once with `getCurrentSiteId()` or the established request-aware helper for that surface, then pass the resolved `siteId` into every read, create, update, delete, slug-generation, and ownership check. Do not add new `DEFAULT_SITE_ID` action fallbacks.

## Register The Module

Add the manifest import to `shell/modules.ts`.

```ts
import { manifest as exampleModule } from "@/modules/example/module";
```

Then add it to `registeredModules`.

```ts
const registeredModules = [
  dashboardModule,
  contentModule,
  exampleModule
] as const satisfies readonly ShellModule[];
```

The sidebar and Settings module list are built from this registry.

Required modules such as Dashboard, Settings, and Help stay enabled even if the submitted module checkbox list is empty. Do not mark normal business modules as `required`.

## Add It To The Module Page Loader

Add the module page to `shell/module-pages.ts`.

```tsx
const modulePageLoaders = {
  example: () => import("@/modules/example/page")
};
```

Keep this as a loader function. Do not eagerly import module pages into the shared admin route.

## URL Rules

Use `/admin/modules/<id>` as the main module URL.

Use resource detail URLs only for records inside a module:

```txt
/admin/appointments/[id]
/admin/clients/[id]
```

When linking back to a module list page, link to the canonical module route:

```tsx
<Link href="/admin/modules/example">Back to example</Link>
```

## Styling Rules

The shell owns the global admin frame and theme variables. Modules should use existing classes and CSS variables:

```txt
stack
page-header
card
subpanel
grid-2
grid-3
field
button
table
pill
success-message
error
```

Use shell tokens instead of hard-coded colors where possible:

```css
color: var(--muted);
border-color: var(--line);
background: var(--panel);
```

Do not inject global CSS from a module. If a module needs custom styling, keep it scoped to the module folder with a CSS Module or a clearly named wrapper class.

Use `layout` in the manifest when the module needs a different working area:

- `standard`: normal admin pages.
- `wide`: wider content.
- `workspace`: dense tool-style module.
- `fullscreen`: module uses the main area heavily while the shell still owns auth and navigation.

## Data And Database Changes

Small modules can use existing Prisma models.

If the module needs new tables:

1. Add models/enums to your module's schema file `prisma/schema/<module>.prisma` (or create that file). The Prisma schema is a folder (`prismaSchemaFolder`); every `*.prisma` in it is merged, so relations can cross files freely. Datasource and generator stay in `prisma/schema/schema.prisma`.
2. Create a migration with `npm run prisma:migrate`.
3. Keep queries and writes in the module folder or in a clearly named library under `lib/`.
4. Seed only starter data that is useful for local development or first deploy.

## API Endpoints

Endpoint behavior belongs to the module that owns it, under `modules/<id>/api/`. App Router route files under `app/**/route.ts` should stay thin and re-export handlers from the module.

```ts
// modules/example/api/export.ts  ->  endpoint behavior
// app/admin/(protected)/modules/example/export/route.ts:
export const dynamic = "force-dynamic";
export { GET } from "@/modules/example/api/export";
```

Use `lib/api/` for API-specific helpers (CSV output, request-body parsing, timing-safe secret checks). Use `lib/` for domain services and utilities shared by modules, scripts, public pages, and API endpoints. Do not duplicate helpers such as environment parsing, FormData conversion, record guards, public URL validation, CSV generation, or enum label formatting inside modules.

## Compatibility Routes

If an old URL should continue to work, create a thin redirect route under `app/admin/(protected)`.

```tsx
import { redirect } from "next/navigation";

export default function ExampleRoute() {
  redirect("/admin/modules/example");
}
```

Do not put module UI in compatibility routes.

## Verification Checklist

Before handing off a module change:

1. Confirm the module has `module.ts`.
2. Confirm it is registered in `shell/modules.ts`.
3. Confirm `/admin/modules/<id>` renders.
4. Confirm the sidebar label, icon, active state, and Settings checkbox work.
5. Confirm any form action calls `requireAdmin("<permission>")`.
6. Confirm any route handler re-exports from `modules/<id>/api/`.
7. Confirm site-owned writes use a request-resolved `siteId`, not `DEFAULT_SITE_ID`.
8. Run `npm run auth:check` for admin action changes.
9. Run `npm run lint`.
10. Run `npx tsc --noEmit`.
11. Run `npm run build` for routing changes.
