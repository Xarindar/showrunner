# Client website previews

`clients/site-preview/` contains the shared Node server and holding-page assets
distributed to Cottage and Jazzr. Each website owns its branded HTML and server
entry point. Keep the server, CSS and JavaScript distribution copies identical.
No dependencies or database tables are required.

Public pages show Coming soon with a corner Log in button. The server validates
a salted password hash and grants an eight-hour HttpOnly, SameSite session.
HTTPS requests receive Secure cookies. Wrong passwords retain the login dialog;
ten failures from a connection address trigger a temporary throttle. Hidden
files and paths outside the static root remain inaccessible. The server supports
media ranges, compression, existing asset redirects and registered SPA routes.

Set `SITE_PREVIEW_SECRET` to the same private random value on all replicas of a
website. Without it, a random process-local key logs previews out on restart and
does not work across multiple replicas. Do not use a `VITE_` prefix for this key.
`SITE_PREVIEW_ENABLED=0` opens the public site when launch is authorized.
The holding pages and unlocked previews carry noindex headers while enabled.

Preview access is separate from Showrunner administrator sign-in. It changes no
admin users, credentials or permissions. The server root excludes its entry
points and password hashes from public static files.

Checks: `node --test test/site-preview.test.mjs` exercises authentication,
redirects, sessions, private files, throttling and media ranges.
`test/site-preview-browser.mjs` verifies both actual website servers on desktop
and mobile with fixture-only booking APIs. Set `SITE_PREVIEW_TEST_PASSWORD` to
the configured password. Its defaults are Cottage port 4180
and Jazzr port 4181; override `COTTAGE_PREVIEW_URL`/`JAZZR_PREVIEW_URL` as needed.
