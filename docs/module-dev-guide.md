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
  enabledByDefault: false
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

Available icon names:

```txt
BookOpen
CalendarCheck
CalendarDays
ClipboardList
Gauge
Image
LayoutTemplate
Settings
ShoppingBag
Star
Users
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
  await requireAdmin();

  const title = String(formData.get("title") || "");

  // Write to Prisma or another module-owned service here.

  revalidatePath("/admin/modules/example");
  redirect("/admin/modules/example?saved=1");
}
```

Always call `requireAdmin()` before admin mutations.

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

## Add It To The Module Route

Add the module page to `app/admin/(protected)/modules/[moduleId]/page.tsx`.

```tsx
import ExamplePage from "@/modules/example/page";
```

Then add a switch case:

```tsx
case "example":
  return <ExamplePage searchParams={searchParams} />;
```

If the page does not use `searchParams`, you can render `<ExamplePage />`.

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

1. Update `prisma/schema.prisma`.
2. Create a migration with `npm run prisma:migrate`.
3. Keep queries and writes in the module folder or in a clearly named library under `lib/`.
4. Seed only starter data that is useful for local development or first deploy.

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
5. Confirm any form action calls `requireAdmin()`.
6. Run `npm run lint`.
7. Run `npx tsc --noEmit`.
8. Run `npm run build` for routing changes.
