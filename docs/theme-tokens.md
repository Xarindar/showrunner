# Theme Tokens

The template uses a small design-token layer so each client can share the same admin system while still matching their public-site brand.

## Token Source

Theme presets live in `lib/theme/tokens.ts`.

Each preset defines:

- colors
- spacing
- radius
- elevation shadows
- typography
- interaction states
- motion
- reserved layout dimensions

The helper `themeToCssVars()` converts a preset into CSS custom properties that are applied to the public site and protected admin shell.

## Current Presets

- Clean: neutral default, good for most service businesses.
- Editorial: sharper and more refined, useful for venues, portfolios, and brand-forward sites.
- Warm: softer and more personal, useful for wellness, hospitality, and relationship-heavy services.

## Client Controls

Admins can change:

- style preset
- primary color

This is intentional. Exposing every token to clients would turn the admin into a site builder and make designs easier to break. Client modularity should happen through stable presets and the shared primitive library, not through ad-hoc per-client CSS.

## Adding A Preset

1. Add a new preset to `themePresets` in `lib/theme/tokens.ts`.
2. Keep the same token groups as the existing presets.
3. Confirm `themePresetOptions` exposes the new preset in Settings.
4. Verify contrast for text, muted text, primary buttons, active nav, badges, and error/success states.
5. Test admin pages, public pages, booking flows, and embed widgets.
6. Update this document with the intended use case.

## Token Naming

Primary semantic tokens use names like:

- `--color-page`
- `--color-surface`
- `--color-surface-raised`
- `--color-surface-sunken`
- `--color-text`
- `--color-brand`
- `--color-hover`
- `--color-active`
- `--color-focus`
- `--space-1` through `--space-12`
- `--radius-card`
- `--shadow-hairline`
- `--shadow-panel`
- `--shadow-raised`
- `--type-display`
- `--type-h1`
- `--type-body`
- `--motion-standard`
- `--layout-content-max`
- `--control-height`
- `--row-height`
- `--card-min`
- `--stat-min`

The stylesheet also keeps short aliases such as `--bg`, `--panel`, and `--primary` for compatibility while the CSS is gradually refined.

## Primitive Contract

Reusable components live under `components/ui/*` and consume the token variables above:

- `Button` and `ButtonLink` for primary, secondary, ghost, and danger actions.
- `Card`, `EqualGrid`, and `ReservedSlot` for fixed/repeated layout regions.
- `Field`, `Input`, `Select`, and `Textarea` for labelled controls with reserved hint space.
- `Badge`, `Table`, `Tabs`, `EmptyState`, `Feedback`, and skeleton primitives for module states.

New client modules should render through these primitives or through existing compatibility classes that map to the same tokens.
