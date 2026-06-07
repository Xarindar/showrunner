# Client Handoff Checklist

Use this before handing the admin panel to a client.

## Access

- Set a strong `AUTH_SECRET`.
- Set the final `ADMIN_EMAIL`.
- Set a temporary `ADMIN_PASSWORD`.
- Ask the client to store the password securely.
- Confirm `/admin` login works.

## Business Settings

- Set business name.
- Set contact email.
- Set timezone.
- Pick the closest style preset.
- Set primary theme color.
- Enable only the modules this client should use.

## Scheduling

- Create or review services.
- Confirm each service has a clear booking URL slug.
- Confirm service duration, location, buffers, minimum notice, max advance days, and slot interval.
- Add intake questions where useful.
- Add booking policy text.
- Decide whether policy acceptance is required.
- Add weekly availability.
- Add known holidays, closures, or private-event blockouts.
- Submit one test booking.
- Test at least one direct service link such as `/book/consultation`.

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

## Final Review

- Public homepage loads.
- Public booking page loads.
- Admin dashboard loads.
- Appointments, Clients, Scheduling, Content, Media, Settings, and Help all open.
- Railway deployment has `DATABASE_URL`, `AUTH_SECRET`, admin credentials, and SMTP/R2 variables as needed.
