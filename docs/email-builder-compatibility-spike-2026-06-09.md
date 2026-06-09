# EmailBuilder.js Compatibility Spike

Date: 2026-06-09

## Scope

Evaluate whether `usewaypoint/email-builder-js` can be adopted directly for the visual email template library/editor in this Next.js App Router app.

Local app stack:

- Next.js 16.2.7
- React 19.2.7
- Zod 4.4.3
- TypeScript 6.0.3

Checked upstream:

- GitHub repository: `usewaypoint/email-builder-js` at `ce3e610749fc80d7e999b20e28f6e775bfe09da7`
- npm package: `@usewaypoint/email-builder@0.0.9`

## Findings

Direct npm install fails in this app:

```text
npm install @usewaypoint/email-builder@0.0.9 --dry-run
ERESOLVE unable to resolve dependency tree
peer react "^16 || ^17 || ^18"
```

The package also peers `react-dom` `^16 || ^17 || ^18` and `zod` `^1 || ^2 || ^3`, while this app is React 19 and Zod 4.

Forced install in an isolated probe can render a simple document at runtime:

```text
npm install react@19.2.7 react-dom@19.2.7 zod@4.4.3 @usewaypoint/email-builder@0.0.9 --legacy-peer-deps
npx tsx probe.ts
```

The runtime render produced static email HTML, but TypeScript compatibility fails when library declarations are checked:

```text
node_modules/@usewaypoint/document-core/dist/index.d.ts: no exported member 'AnyZodObject'
node_modules/@usewaypoint/email-builder/dist/index.d.ts: no exported member 'ZodEffects'
Generic type 'ZodObject<Shape, Config>' requires between 0 and 2 type arguments
```

The published npm package exposes the reader/static HTML renderer, not a packaged no-code editor component. The full editor is source code in `examples/vite-emailbuilder-mui`, and that example is built for Vite + MUI with React 18 and Zod 3.

`npm audit` in the isolated forced install reports 3 moderate vulnerabilities through `@usewaypoint/block-text -> insane`:

```text
GHSA-w455-mfq9-hf74: insane vulnerable to Regular Expression Denial of Service
```

## Decision

Do not adopt `@usewaypoint/email-builder@0.0.9` directly in the app.

Reasons:

- It cannot be installed normally with the current React 19/Zod 4 dependency tree.
- Its TypeScript declarations are not Zod 4-compatible.
- The visual editor is not published as a reusable package and would require vendoring or forking a Vite/MUI React 18 app.
- Forced peer installation would add a dependency tree with a known moderate ReDoS advisory.

## Recommended Next Path

Proceed only if one of these becomes true:

- Upstream publishes React 19/Zod 4-compatible packages, including a reusable editor package.
- The project accepts a maintained internal fork that updates peer ranges, Zod 4 types, sanitizer dependencies, and packages the editor as a Next-safe client component.
- The project chooses a first-party visual template editor using the existing `MessageTemplate`, `EmailOutbox`, token validation, and renderer pipeline.

Until then, keep the existing textarea-based booking template settings and do not add builder JSON fields solely for this package.
