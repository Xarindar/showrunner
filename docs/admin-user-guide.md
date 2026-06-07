# Admin User Guide

This guide is for the business owner or staff member who will use the admin panel after the site is launched.

## Signing In

1. Go to `/admin`.
2. Enter the admin email and password provided during handoff.
3. Use the sidebar to move between Dashboard, Appointments, Clients, Scheduling, Content, Media, Forms, Testimonials, Products, Settings, and Help. On a phone, tap the menu button in the top bar to open the admin navigation.

Keep the admin password private. If the password is exposed, ask the site maintainer to rotate it.

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

The client notes area is for internal business context. Do not store sensitive medical, financial, or legal information unless the business has a proper policy for that data.

## Scheduling

Scheduling controls what times customers can book.

Services define what can be booked. Each service can include:

- name and description
- booking URL slug
- appointment duration
- location
- buffer before or after appointments
- minimum notice before someone can book
- maximum advance booking window
- slot interval
- intake question
- booking policy
- required policy acceptance

Availability rules define normal weekly bookable hours.

Blockouts are one-time unavailable periods, such as vacations, private events, holidays, or closures.

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

Be careful when disabling modules. Disabled modules are hidden from the sidebar.

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
