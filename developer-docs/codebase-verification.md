# Codebase and documentation verification

This release pass checks README claims against the repository's implementation, rather than treating old roadmaps or module readiness labels as evidence. It includes the admin token migration and documentation refresh from the same release.

## Coverage and corrections

| Area inspected | Evidence / correction |
| --- | --- |
| Runtime, scripts and CI | `package.json`, lockfile, Prisma config, Railway config and security workflow. Document pinned Node/npm, migration versus seed behavior and explicit worker commands. |
| Module inventory | All 21 registered manifests and the registry's inclusion/enablement logic. Add missing Blog, Uploads, Payments and Client Deployments to README; distinguish registration from enablement. |
| Public route surface | `app/` route inventory, public API handlers, standalone booking configuration and shipped content bridge. Distinguish real API endpoints from retired hosted pages and demo client source. |
| Billing | Admin actions/page and billing helpers. Public document/PDF routes are absent despite old claims. Remove the action that queued customer emails to the missing route; keep checkout-link attachment and refund handling. |
| Scheduling | Native adapter, Google OAuth/free-busy service, public booking APIs, service pricing and client source. Correct the claim that Google integration/public booking APIs are future-only. |
| Content and media | Puck entrypoint, manifests, content bridge, media driver/delivery implementation and client photo guides. Separate real website editing, public albums, private shoots and upload requests. |
| Payments/email | Provider setup, credential crypto, webhook routes, refresh worker and SMTP provider. Correct OAuth versus pasted-credential guidance and queue-versus-delivery claims. |
| Security/runtime dependencies | Full npm audit, patched dependency resolution and rich-text/email compatibility tests. No audit severity reductions or exemptions added. |
| Deployment inventory | Accessible Railway projects/environments, sources, revisions and domains. Four active web instances and one repo-linked refresh worker; one empty Jazzr beta service excluded. |
| Developer documentation | README, design/product guides, current feature docs, historical notices and local ignored guides. Payment/fleet instructions now live in tracked developer docs. |

## Release checks

The pinned Node 22.22.3 test run passed 224 tests, including the new rich-text round-trip compatibility check and the regression preventing billing emails to an absent public route. Dependency audit after updates reports zero findings. The admin-control and public-proof browser fixtures pass on desktop/mobile. The production build and its TypeScript step pass. Broad source lint reports no errors and six pre-existing warnings; targeted lint on the final billing/manifest/test edits passes. Deployment and live verification results must be checked for the released revision; this document is not a substitute for the release logs.

Browser fixtures use synthetic content, not production transactions. This pass does not certify every module workflow, every authorization combination, third-party uptime, provider sandbox settlement, SMTP deliverability or large-upload capacity. Module APIs and feature configuration still require installation-specific verification. Historical gallery checks remain useful evidence but retain their original limits.

## Maintenance

When adding a route, module, environment variable or worker, update README and the owning guide in the same change. Do not claim a feature is live solely because its database model, helper, manifest or old screenshot exists. Keep `developer-docs/` authoritative; ignored `docs/` files must not be the only source for operating a deployed installation.
