# Dependency security maintenance

Next.js, Nodemailer and Sharp minimum versions were raised to patched releases. Nodemailer 10 supplies its own types; the SMTP provider uses its pooled transport types. Compatibility tests compose mail using the offline stream transport and never connect to an SMTP server.

The scoped `@next/eslint-plugin-next` override substitutes `tinyglobby` for `fast-glob`, removing the unpatched `braces` dependency. The plugin only consumes `globSync(pattern, { onlyDirectories: true })` for root discovery. The default root and string/array root globs are covered by `test/dependency-compatibility.test.ts`. Keep all Next lint rules enabled; review this override when upgrading the plugin, especially if it begins using other fast-glob APIs. Remove it when upstream no longer depends on vulnerable braces.

The lockfile also updates compatible brace-expansion, fast-uri and source-map-js patches. No audit exclusions, severity changes or CI bypasses are used.

## October 2026 release refresh

New audit findings affected Happy DOM, Nodemailer, Zod, Undici and fast-uri. This release raises Nodemailer/Zod minimums, updates compatible lockfile packages, pins Undici 6.29.1, and overrides Happy DOM to 21.0.4. The Happy DOM override crosses the editor dependencies' requested major version; `test/dependency-compatibility.test.ts` exercises Tiptap HTML/JSON round trips, and editor/browser/build checks remain required. Review/remove the override when upstream editor dependencies accept a patched range. See [the Happy DOM advisory](https://github.com/advisories/GHSA-834v-8h66-3h79). Do not weaken audit thresholds to bypass findings.
