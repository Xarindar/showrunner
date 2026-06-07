# Module System

Showrunner is organized as an admin shell plus contained modules.

For step-by-step implementation instructions, use `docs/module-dev-guide.md`.

## Folders

- `shell/`: shared admin frame, sidebar, module registry, icon mapping, and module types.
- `modules/`: feature modules. Each module owns its manifest, page, actions, and local components.
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
  enabledByDefault: true
} satisfies ShellModule;
```

The shell reads these manifests to build navigation and settings controls. Modules describe their sidebar icon by name; the shell maps that name to the actual Lucide icon.

## Styling

The shell owns global CSS variables for color, radius, spacing, typography, and admin layout. Modules should use those tokens instead of injecting global CSS.

Modules that need a different surface should use the manifest `layout` value:

- `standard`: normal admin content width and spacing.
- `wide`: wider working area.
- `workspace`: dense tool-style layout.
- `fullscreen`: module takes over the main area while auth/sidebar still belong to the shell.

Raw module CSS should stay scoped to the module folder.
