# Admin User Guide

This guide is for the business owner or staff member who will use the admin panel after the site is launched.

## Signing In

1. Go to `/admin`.
2. Enter the admin email and password provided during handoff.
3. Use the sidebar to move between the modules enabled for your role and site. Common modules include Dashboard, Appointments, Clients, Scheduling, Content, Media, Forms, Testimonials, Products, Billing, Communications, Automation, Analytics, Settings, Users, and Help. On a phone, tap the menu button in the top bar to open the admin navigation.

Keep the admin password private. If the password is exposed, ask the site maintainer to rotate it.

Some teams have multiple admin roles. Owners can manage admin users and roles in Users. Staff, photographers, accountants, viewers, and other roles may see fewer modules or records depending on the site's permission setup.

## Dashboard

The Dashboard is the quick overview screen. It is designed to work well on desktop and phones.

Use it to:

- check upcoming appointments and pending requests
- jump to appointment management
- quickly reach content, scheduling, media, and clients
- review the next few bookings without opening the full appointment queue

On a phone, the dashboard prioritizes snapshot numbers first, shortcut rows second, and upcoming appointments third. The admin menu stays behind the top-bar menu button so the dashboard content has room to breathe.

## Appointments

Appointments are the day-to-day booking queue.

Use Appointments to:

- review new booking requests
- open an appointment detail page
- confirm, cancel, or complete an appointment
- see customer notes and intake answers
- store private appointment notes
- record a cancellation reason
- see assigned staff when a service is staff-specific
- see reserved rooms or equipment when a service requires resources

Status meanings:

- Pending: the appointment was requested but has not been confirmed yet.
- Confirmed: the appointment is accepted and expected to happen.
- Canceled: the appointment should not happen.
- Completed: the appointment happened and is finished.

## Clients

Clients are long-term records for people who book services.

Public bookings automatically create or update a client record by email address. Use Clients to:

- view client contact details
- add private notes
- review appointment history
- see service history over time
- mark clients as active, lead, VIP, or inactive
- import or export client records by CSV when enabled
- merge duplicate client records

The client notes area is for internal business context. Do not store sensitive medical, financial, or legal information unless the business has a proper policy for that data.

Client CSV imports, CSV exports, and duplicate merges are audit-logged with the acting admin and the affected records.

## Scheduling

Scheduling controls what times customers can book.

Services define what can be booked. Each service can include:

- name and description
- booking URL slug
- appointment duration
- location
- assigned staff
- required resources such as rooms or equipment
- buffer before or after appointments
- minimum notice before someone can book
- maximum advance booking window
- slot interval
- intake question
- booking policy
- required policy acceptance

Availability rules define normal weekly bookable hours. Services without assigned staff use business-wide availability. Services with assigned staff use that staff member's personal availability; assigned staff with no personal hours are not bookable until hours are added.

Resources define shared rooms, studios, or equipment. A service can require one or more resources. Required resources need their own availability, and overlapping resource reservations or resource blockouts remove that slot from public booking.

Blockouts are one-time unavailable periods, such as vacations, private events, holidays, or closures.

Booking reminders are implemented but still pre-audit. Do not rely on reminder delivery as a shipped feature until the roadmap marks it confirmed.

## Content

Content controls simple public-site text and hero imagery.

Use Content to update:

- hero headline
- hero supporting copy
- hero image URL
- intro section title
- intro section body

This is not a full site builder. It is intentionally limited so the site design stays stable.

## Media

Media controls images and assets.

Repo asset mode uses images included with the site code. This is simplest for low-maintenance sites.

R2 mode enables uploads when Cloudflare R2 credentials are configured. Use this for clients who need to change images often.

Private media delivery must go through the app's signed delivery routes. Do not paste private bucket URLs into public pages.

## Portfolio

Portfolio controls client galleries and proofing.

Use Portfolio to:

- create and manage galleries
- issue client access links
- review proofing favorites, comments, and approvals
- publish gallery widgets and lightbox views
- prepare ZIP delivery bundles when enabled

Signed image variants are live for R2-backed image delivery. Public delivery routes are rate-limited, GIFs are not flattened into static WebP variants, and private media should still be delivered only through signed app routes.

## Products

Products controls the shop catalog and commerce records.

Use Products to:

- manage products, variants, collections, and coupons
- review carts, orders, and payment records
- use hosted Stripe Checkout when Stripe credentials and webhooks are configured
- control which connected Stripe payment methods appear at checkout

The app uses hosted checkout to avoid storing card data. When a site has connected Stripe credentials, owners can enable or disable card checkout, card-backed Apple Pay and Google Pay, Cash App Pay, Klarna, and Affirm. Apple Pay on a client's own custom domain depends on the custom-domain milestone because Apple verifies the checkout domain.

## Billing

Billing controls invoices, estimates, and billing documents.

Use Billing to:

- create billing documents for clients
- add line items
- rely on server-side totals rather than manual total entry
- send or manage document status from the admin flow

Client-facing accept/pay, PDF rendering, and partial-payment depth are implemented but still audit-gated until the roadmap marks them confirmed.

## Communications

Communications controls transactional email templates and delivery records.

Use Communications to:

- review the email outbox
- adjust booking email template settings
- manage sender and recipient configuration
- manage suppressions
- use the visual template builder where enabled

## Automation

Automation controls event-based rules.

Use Automation to:

- create rules for supported events
- send queued webhook deliveries
- run supported non-webhook actions
- review replay and dead-letter records

## Analytics

Analytics controls reporting and event records.

Use Analytics to:

- review module and event reporting
- export analytics data to CSV
- manage analytics adapter settings and retention controls

Tracking consent requirements vary by launch jurisdiction. The current roadmap treats US-only launch consent UI as deferred; revisit consent defaults before launching in the EU, UK, or EEA.

## Forms

Forms controls public inquiry and intake forms.

Use Forms to:

- create active, draft, or archived forms
- add fields such as text, email, phone, choice, date, checkbox, signature, and hidden metadata
- open the public form URL
- review recent submissions
- link inquiry and client-targeted submissions back to Clients by email address

## Testimonials

Testimonials controls first-party reviews and public proof blocks.

Use Testimonials to:

- collect public testimonial submissions with permission
- approve or reject new submissions
- mark approved quotes as featured
- associate quotes with a client, service, product, source, and rating
- check the public testimonials page

## Settings

Settings controls business-level configuration:

- business name
- contact email
- timezone
- style preset
- theme color
- media mode
- enabled admin modules
- role and audit controls
- analytics retention settings
- data-access scope presets and per-role module scope

Be careful when disabling modules. Disabled modules are hidden from the sidebar.

Data-access scope controls whether supported roles can see all records in a module or only their own records. Team sites can use OWN scope for staff/photographer workflows; solo sites can use ALL scope so the owner sees everything.

## Common Workflows

### Customer Booking Flow

The public booking page is a guided flow:

1. Choose a service.
2. Choose a date and available time.
3. Add contact details and any intake answers.
4. Review the appointment summary.
5. Accept the booking policy if required.
6. Submit the appointment request.

After booking, the appointment appears in Appointments and the customer is added or updated in Clients by email address.

### Add A Service

1. Open Scheduling.
2. Fill out Add service.
3. Set the booking URL slug, duration, notice, advance window, buffers, and policy.
4. Save the service.
5. Confirm availability rules exist for the days the service can be booked.

Use the service slug for direct booking links, such as `/book/consultation`. If the slug field is left blank, the admin generates a slug from the service name and adds a number if that slug already exists.

### Block A Day Or Time

1. Open Scheduling.
2. Use Manual blockout.
3. Enter start and end date/time.
4. Add a reason such as holiday, vacation, or private event.

### Manage A New Appointment

1. Open Appointments.
2. Click the customer name.
3. Review contact details, notes, intake response, and policy acceptance.
4. Confirm, cancel, or complete the appointment.
5. Add internal notes if needed.

### Review A Returning Client

1. Open Clients.
2. Click the client name.
3. Review private notes and appointment history.
4. Add a note after meaningful calls, appointments, or follow-ups.

### Update Site Copy

1. Open Content.
2. Update the relevant text fields.
3. Save.
4. Check the public homepage.

### Review A Form Submission

1. Open Forms.
2. Choose the form in the library.
3. Review Recent submissions.
4. Open the linked client record when one was created from an inquiry email.

### Moderate Testimonials

1. Open Testimonials.
2. Review the moderation queue.
3. Approve quotes that have permission and should be public.
4. Mark the best approved quotes as featured for the homepage.

## Troubleshooting

If a time does not appear on the public booking page, check:

- the service is active
- weekly availability exists for that day
- there is no blockout for that time
- minimum notice has passed
- max advance days includes the selected date
- another booking is not occupying that slot or its buffer window

If upload controls are disabled, check:

- Settings is set to R2 media mode
- R2 environment variables are configured

If emails do not send, check:

- SMTP settings are configured
- the contact email is correct in Settings
- development mode may log emails to the server console instead of sending them
- the `email:process` worker or cron is running in production

If analytics retention is not running, check:

- the `analytics:process` worker or cron is provisioned
- the analytics worker secret or email worker secret is configured

If a staff member, photographer, room, or piece of equipment does not appear as bookable, check:

- it is active
- it is assigned to the service
- it has availability for the requested time
- it is not blocked out
- another booking has not already reserved it
