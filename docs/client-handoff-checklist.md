# Client Handoff Checklist

Use this before handing the admin panel to a client.

## Access

- Set a strong `AUTH_SECRET`.
- Set the final `ADMIN_EMAIL`.
- Set a temporary `ADMIN_PASSWORD`.
- Ask the client to store the password securely.
- Confirm `/admin` login works.
- Create any additional admin users in Users.
- Confirm owner-only access is retained and at least one owner remains.
- Assign roles intentionally; verify restricted roles see only the modules they need.

## Business Settings

- Set business name.
- Set contact email.
- Set timezone.
- Pick the closest style preset.
- Set primary theme color.
- Enable only the modules this client should use.
- Review analytics retention settings.
- Review role/audit settings if this is a team site.
- Apply the right data-access preset: single-person sites usually use ALL scope; team sites should review OWN scope for staff and photographer roles.

## Scheduling

- Create or review services.
- Confirm each service has a clear booking URL slug.
- Confirm service duration, location, buffers, minimum notice, max advance days, and slot interval.
- Add intake questions where useful.
- Add booking policy text.
- Decide whether policy acceptance is required.
- Add weekly availability.
- If the business has staff-specific services, create staff members, assign staff to services, and add per-staff availability.
- Confirm staff assigned to a service do not show bookable times until their personal availability exists.
- If the business needs rooms or equipment, create resources, assign them to services, and add resource availability.
- Submit overlapping test bookings to confirm the same room/equipment cannot be double-booked.
- Add known holidays, closures, or private-event blockouts.
- Submit one test booking.
- Test at least one direct service link such as `/book/consultation`.
- Treat booking reminders as in-progress until the roadmap marks them confirmed; do not promise reminder delivery during handoff yet.

## Appointments

- Confirm the test booking appears in Appointments.
- Open the appointment detail page.
- Confirm intake answers and policy acceptance are visible.
- Test confirm, cancel, and complete statuses.

## Clients

- Confirm the test booking created a client record.
- Open the client detail page.
- Add a test note.
- Review appointment history.
- If using CSV import/export or duplicate merge, confirm the action creates an audit-log entry.

## Content And Media

- Set homepage hero headline and supporting copy.
- Set intro title and body.
- Choose the hero image.
- If uploads are needed, configure R2 and test an upload.

## Email

- Configure SMTP if real email should send.
- Set `EMAIL_WORKER_SECRET` and `EMAIL_PROVIDER_WEBHOOK_SECRET`.
- Create a Railway cron service that runs `npm run email:process` every 5-15 minutes.
- Confirm booking emails go to the business and customer.
- Confirm dev-only console logging is not being used in production.

## Commerce And Billing

- Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` before enabling live checkout.
- Complete a Stripe test-mode checkout and confirm the order/payment status updates through the webhook.
- If the site uses a connected Stripe account, connect or reconnect it in Settings -> Payments before live checkout.
- Review the Stripe payment-method toggles in Settings -> Payments and test each enabled method the client plans to offer.
- Treat Apple Pay on client-owned custom domains as dependent on the custom-domain milestone; the current registration uses the platform URL.
- Confirm Products is disabled if the client is not selling through the site.
- Treat public billing accept/pay, PDF rendering, and partial payments as audit-gated until the roadmap marks them confirmed.
- Treat Square and PayPal as roadmap work until confirmed.

## Analytics

- Configure analytics adapter IDs only when the client has approved tracking.
- Create a Railway cron service that runs `npm run analytics:process` on the required retention schedule.
- Use `ANALYTICS_WORKER_SECRET` if configured; otherwise confirm `EMAIL_WORKER_SECRET` is set because the analytics worker route can fall back to it.
- For any EU, UK, or EEA launch, revisit consent defaults and add the required consent UI before go-live.

## Final Review

- Public homepage loads.
- Public booking page loads.
- Resource-required booking services cannot double-book the same resource.
- Public shop/cart pages load when Products is enabled.
- Admin dashboard loads.
- Appointments, Clients, Scheduling, Content, Media, Products, Billing, Communications, Automation, Analytics, Settings, Users, and Help open when enabled for the signed-in role.
- Railway deployment has `DATABASE_URL`, `AUTH_SECRET`, admin credentials, SMTP, Stripe, R2/Cloudflare Images, and worker-secret variables as needed.
