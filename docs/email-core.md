# Email Core

This document defines the email system that sits underneath the Communications module. The admin screen can stay simple while this core handles transactional emails, admin routing, newsletters, delivery records, retries, and provider changes.

The first implementation is for one client site per deployment. Model names and service contracts should leave room for a future `siteId`, but do not build agency multi-tenant behavior until the platform has a real tenant model.

## Principles

- Email work must not break the action that caused it. Booking, form, order, and billing writes should finish even when email fails.
- Public-facing transactional emails and internal admin emails are separate messages with separate templates.
- Newsletter and marketing email must track consent, unsubscribe state, and suppressions before anything is queued.
- SMTP with Nodemailer is the first provider. Provider details must stay behind a small adapter contract.
- SMTP passwords and API keys belong in environment variables, not database rows.
- The database outbox is the source of truth for queued, sent, failed, and suppressed email.
- Sender domains must be authenticated before they are used for client-visible mail.
- Marketing email must include body unsubscribe links and one-click unsubscribe headers.
- `sent` means accepted by the email provider. It does not mean inbox delivery.
- Code should use plain domain names. Avoid clever names, generated-sounding abstractions, and comments that restate the obvious.

## Architecture

The core has six parts:

- Event entrypoints receive business events from modules.
- Recipient routing decides who should receive admin and staff notifications.
- Sender resolution chooses the from name, from address, and reply-to address.
- Template rendering turns stored templates and token values into subject, HTML, and plain text.
- The outbox stores rendered messages before sending.
- The provider adapter sends mail and returns provider delivery metadata.
- Provider event handlers record later delivery, bounce, complaint, open, click, and unsubscribe events when the provider supports them.

Suggested folder shape:

```txt
lib/email/
  events.ts
  outbox.ts
  provider.ts
  recipients.ts
  render.ts
  sender.ts
  subscriptions.ts
  types.ts
```

Keep module-specific event calls in the owning module. Shared rendering, queueing, suppression checks, and sending live in `lib/email`.

## Data Model

The current schema already has `MessageTemplate`, `MessageLog`, and `SuppressionListEntry`. The email core should expand those concepts instead of creating a disconnected system.

Recommended models:

- `EmailSendingDomain`: domain setup record for deliverability checks.
  - `domain`
  - `status`: `pending`, `verified`, `failed`
  - `spfStatus`
  - `dkimStatus`
  - `dmarcStatus`
  - `lastCheckedAt`
  - optional future `siteId`
- `EmailSenderIdentity`: sender profile for a client site.
  - `sendingDomainId`
  - `name`
  - `fromEmail`
  - `replyToEmail`
  - `isDefault`
  - `isVerified`
  - optional future `siteId`
- `EmailRecipientGroup`: named admin routing group.
  - examples: `bookings`, `forms`, `billing`, `campaigns`
  - `label`
  - `fallbackToContactEmail`
- `EmailRecipient`: one email address inside a group.
  - `groupId`
  - `email`
  - `name`
  - `isActive`
- `MessageTemplate`: keep the existing model name and add fields.
  - `key`: stable template key such as `booking.created.customer`
  - `description`
  - `previewText`
  - `htmlBody`
  - `textBody`
  - `version`
  - `senderIdentityId`
  - `requiredTokens`
  - `optionalTokens`
  - `isMarketing`
- `EmailOutbox`: rendered message waiting to send or already processed.
  - `idempotencyKey`
  - `templateId`
  - `templateKey`
  - `recipientEmail`
  - `recipientName`
  - `fromName`
  - `fromEmail`
  - `replyToEmail`
  - `subject`
  - `previewText`
  - `htmlBody`
  - `textBody`
  - `purpose`
  - `category`: `transactional`, `admin`, or `marketing`
  - `relatedType`
  - `relatedId`
  - `status`: `queued`, `sending`, `sent`, `failed`, `suppressed`, `canceled`
  - `attemptCount`
  - `nextAttemptAt`
  - `lastError`
  - `providerMessageId`
  - `deliveredAt`
  - `bouncedAt`
  - `complainedAt`
  - `sentAt`
- `EmailProviderEvent`: normalized event received from an email provider.
  - `outboxId`
  - `providerMessageId`
  - `eventType`: `accepted`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `opened`, `clicked`, `unsubscribed`
  - `providerPayload`
  - `createdAt`
- `EmailSubscriptionList`: newsletter or marketing list.
  - `name`
  - `description`
  - `isDefault`
- `EmailSubscriber`: email contact for newsletters.
  - `email`
  - `name`
  - `clientId`
  - `status`: `active`, `unsubscribed`, `pending`, `bounced`
  - `consentSource`
  - `consentedAt`
  - `unsubscribedAt`
  - `unsubscribeToken`
- `EmailListMembership`: list membership for a subscriber.
  - `subscriberId`
  - `listId`
  - `status`
  - `joinedAt`
  - `leftAt`
- `EmailCampaign`: newsletter campaign.
  - `name`
  - `subject`
  - `previewText`
  - `htmlBody`
  - `textBody`
  - `senderIdentityId`
  - `status`: `draft`, `scheduled`, `sending`, `sent`, `canceled`
  - `scheduledAt`
  - `sentAt`
  - `targetListIds`
  - `postalAddressSnapshot`
  - count snapshots for queued, sent, failed, and suppressed
- `EmailEvent`: optional audit trail for emitted events.
  - `eventKey`
  - `relatedType`
  - `relatedId`
  - `summary`
  - `createdAt`

Use `EmailOutbox` as the delivery source of truth. Move the Communications delivery table to read from `EmailOutbox`. Keep existing `MessageLog` only until that screen is migrated, then remove or archive it in a later cleanup migration. Do not write both tables for the same send.

Status names in this document are service labels. Prisma enum values should follow the repo's current uppercase style.

## Core APIs

Use small service functions with direct names.

```ts
export type EmailCategory = "transactional" | "admin" | "marketing";

export type EmailEventInput = {
  eventKey: string;
  relatedType: string;
  relatedId: string;
  tokens: Record<string, string | number | Date | null | undefined>;
};

export type QueueEmailInput = {
  templateKey: string;
  recipientEmail: string;
  recipientName?: string;
  category: EmailCategory;
  relatedType?: string;
  relatedId?: string;
  tokens: Record<string, string | number | Date | null | undefined>;
  senderIdentityId?: string;
  idempotencyKey: string;
};

export async function emitEmailEvent(input: EmailEventInput): Promise<void>;
export async function queueEmail(input: QueueEmailInput): Promise<void>;
export async function queueAdminEmail(input: EmailEventInput & { groupKey: string }): Promise<void>;
export async function queueCampaign(campaignId: string): Promise<void>;
export async function processEmailOutbox(options?: { limit?: number }): Promise<void>;
```

Provider contract:

```ts
export type SendEmailInput = {
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  headers?: Record<string, string>;
};

export type SendEmailResult = {
  providerMessageId?: string;
};

export type EmailProvider = {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
};
```

`createSmtpProvider()` should use the existing SMTP environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM` as a fallback only

When `SMTP_HOST` is missing, the provider should log a compact development message and mark the outbox item as sent with a `dev:` provider id. Production should require SMTP configuration.

For marketing email, the provider input must include:

- `List-Unsubscribe`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- a visible unsubscribe link in the body

Nodemailer can set custom headers through the message `headers` option and common list headers through its `list` option. Do not set protected headers such as `From`, `To`, `Reply-To`, or `Subject` through custom headers.

SMTP-only sending cannot prove final delivery, bounces, complaints, opens, or clicks on its own. Treat those as provider-event features. If a client needs serious newsletter reporting or automatic bounce suppression, add an API provider adapter such as SES, Resend, SendGrid, or Mailgun before relying on campaign metrics.

## Event Catalog

Use stable event keys. Templates and routing should depend on these keys.

Required v1 events:

- `booking.created.customer`
- `booking.created.admin`
- `booking.confirmed.customer`
- `booking.canceled.customer`
- `booking.delayed.customer`
- `booking.completed.admin`
- `form.submitted.admin`
- `billing.invoice.sent.customer`
- `billing.payment.received.customer`
- `newsletter.campaign`

Booking tokens:

- `businessName`
- `customerName`
- `customerEmail`
- `serviceName`
- `appointmentStartsAt`
- `appointmentEndsAt`
- `appointmentTime`
- `timezone`
- `bookingStatus`
- `cancellationReason`
- `delayReason`

Form tokens:

- `businessName`
- `formName`
- `submitterName`
- `submitterEmail`
- `submissionSummary`

Newsletter tokens:

- `businessName`
- `subscriberName`
- `subscriberEmail`
- `unsubscribeUrl`
- `preferencesUrl`

Rendering should fail before queueing if a required token is missing.

## Sender Configuration

Sender identity is separate from SMTP credentials. That lets a client change the address shown to recipients without rewriting templates.

Resolution order:

1. Explicit `senderIdentityId` on the queued email.
2. Sender identity assigned to the template.
3. Default sender identity.
4. `SMTP_FROM`.
5. `SiteSettings.contactEmail`.

Every queued email stores the resolved sender fields as a snapshot. Later sender edits must not rewrite old delivery records.

Do not allow arbitrary sender addresses. A sender identity is usable for client-visible mail only when its domain is verified or the address is the configured SMTP fallback. For client domains, verify SPF, DKIM, and DMARC before enabling newsletters or other subscribed mail.

## Deliverability And Compliance

The platform should treat sender setup as part of launch, not as an afterthought.

Required sender setup:

- SPF or DKIM for every sender domain.
- SPF, DKIM, and DMARC for bulk or newsletter sending.
- From-domain alignment with SPF or DKIM.
- TLS-capable SMTP or API transport.
- A valid business mailing address for commercial email footers.
- A visible unsubscribe link in every marketing email.
- One-click unsubscribe headers for marketing and subscribed messages.

Commercial templates must keep commercial content honest. If a message is mainly marketing, it is marketing even when it contains some account, booking, or billing context. Do not put promotional copy at the top of transactional messages.

Add a client handoff step for DNS setup:

- choose a sending domain or subdomain
- configure provider DNS records
- verify SPF, DKIM, and DMARC
- send a test to Gmail, Outlook, and Yahoo/AOL
- confirm one-click unsubscribe headers on a newsletter test
- confirm the business mailing address appears in the footer

## Admin Recipient Routing

Admin notifications use recipient groups.

Recommended group keys:

- `bookings`
- `forms`
- `billing`
- `campaigns`
- `system`

Resolution order:

1. Event-specific group recipients.
2. Module-specific override when the source record has one, such as `Form.notificationEmail`.
3. Group fallback to `SiteSettings.contactEmail`.
4. If no recipient exists, record a suppressed outbox item with the reason `no_recipient`.

Do not add staff-assignment routing until staff and roles exist. Leave the recipient contract open for it.

## Template Rendering

Templates store HTML and text bodies. Both use the same token syntax:

```txt
{{businessName}}
{{customerName}}
{{appointmentTime}}
```

Rules:

- Escape token values before inserting into HTML.
- Replace missing optional tokens with an empty string.
- Reject missing required tokens before queueing.
- Store rendered subject, preview text, HTML, and text in the outbox.
- Do not render at send time. The outbox is a snapshot.
- Keep plain-text body required for every template.

The first editor can be a textarea-based admin form. A visual block builder is not part of v1.

## Outbox Flow

Queueing:

1. Caller emits an event or queues an email directly.
2. Service loads template, sender, and recipient state.
3. Service checks suppressions and subscription state.
4. Service renders subject and body.
5. Service creates `EmailOutbox` with `status=queued`.

Processing:

1. Worker selects due queued rows by `nextAttemptAt`.
2. Worker marks each row `sending`.
3. Provider sends the message.
4. Provider acceptance sets `status=sent`, `sentAt`, and `providerMessageId`.
5. Failure increments `attemptCount`, stores `lastError`, and schedules `nextAttemptAt`.
6. Too many failures set `status=failed`.

Delivery updates:

1. Provider webhook receives a delivery, bounce, complaint, open, click, or unsubscribe event.
2. Handler verifies the provider signature when available.
3. Handler writes `EmailProviderEvent`.
4. Handler updates the matching `EmailOutbox` row by `providerMessageId`.
5. Hard bounces and complaints update subscriber status and add a marketing suppression.

Use an `idempotencyKey` for every outbox row. Examples:

- `booking:<bookingId>:created:customer`
- `booking:<bookingId>:created:admin:<recipientEmail>`
- `form:<submissionId>:admin:<recipientEmail>`
- `campaign:<campaignId>:subscriber:<subscriberId>`

Duplicate queue attempts with the same idempotency key should be ignored.

If more than one worker can run, select rows with row-level locking. PostgreSQL `FOR UPDATE SKIP LOCKED` is appropriate for a queue-like table; use raw SQL if Prisma does not expose the needed lock clause cleanly.

## Newsletter Flow

Subscribing:

1. Public form collects email, optional name, consent checkbox, and source.
2. Service creates or updates `EmailSubscriber`.
3. Service adds list memberships.
4. Service stores consent source and timestamp.

Campaign creation:

1. Admin creates campaign draft.
2. Admin chooses sender identity and target lists.
3. Admin writes subject, preview text, HTML, and plain text.
4. Admin confirms the business mailing address.
5. Admin sends a test email to themselves.
6. Admin schedules or starts the campaign.

Campaign queueing:

1. Load active subscribers in target lists.
2. Skip unsubscribed, bounced, and suppressed addresses.
3. Require `unsubscribeUrl` and `preferencesUrl`.
4. Require one-click unsubscribe headers.
5. Include the campaign's mailing address snapshot in the footer.
6. Create one outbox item per subscriber.
7. Update campaign count snapshots.

Unsubscribe:

1. Public unsubscribe route receives a token.
2. Service marks the subscriber or membership unsubscribed.
3. Service adds or updates a marketing suppression entry.
4. Future campaigns skip that address.

Transactional emails may ignore marketing-only unsubscribe state, but they must respect all-email suppressions.

## Suppression Rules

Suppression scopes:

- `marketing`: blocks newsletters and campaigns.
- `transactional`: blocks transactional messages where legally and operationally allowed.
- `all`: blocks every email.

Queueing rules:

- Marketing email checks subscriber status, list membership, and suppression list.
- Admin email checks all-email suppression only.
- Transactional customer email checks all-email and transactional suppression.
- Suppressed messages should be recorded so support can explain why no email was sent.

## Module Integration

Booking creation should queue:

- `booking.created.customer` to the customer.
- `booking.created.admin` to the `bookings` recipient group.

Appointment status changes should queue:

- `booking.confirmed.customer` when status changes to confirmed.
- `booking.canceled.customer` when status changes to canceled.
- `booking.completed.admin` when status changes to completed, if the business wants internal completion notices enabled.

Appointment delay should be a separate action, not a hidden status. It should store the reason and queue `booking.delayed.customer`.

Form submission should queue:

- `form.submitted.admin` to the form notification email when configured.
- Otherwise to the `forms` recipient group.

Newsletter signup can come from:

- standalone newsletter form
- contact forms with an explicit marketing consent checkbox
- future checkout or booking consent controls

Do not infer marketing consent from a booking, purchase, form submission, or testimonial without a clear opt-in.

## Worker And Deployment

V1 should process outbox rows through one local script and, optionally, one protected internal route:

- `scripts/process-email-outbox.ts`: script that calls the email service function and exits.
- `app/api/internal/email-outbox/route.ts`: optional POST-only route protected by `EMAIL_WORKER_SECRET` for schedulers that call HTTP endpoints.

On Railway, prefer a cron service that runs the script on a schedule and exits cleanly. Railway skips the next cron run if the previous execution is still active, so the script must close database connections and terminate. The internal route is useful for other schedulers, but it should not be the default Railway path.

The script and route should return counts for processed, sent, failed, suppressed, and skipped rows.

The worker should:

- process 50 rows per run by default
- skip rows already marked `sending` recently
- retry failed sends with increasing delays
- use retry delays of 5 minutes, 30 minutes, 2 hours, 12 hours, and 24 hours
- stop retrying after 5 attempts
- send with a deterministic Message-ID based on the outbox row
- log compact errors without printing full rendered email bodies

The outbox is at-least-once after provider acceptance. If the process exits after SMTP accepts a message but before the row is marked sent, the stale row can be reclaimed and resent. The deterministic Message-ID helps provider correlation and may help some providers dedupe, but API-provider idempotency is needed before claiming exactly-once sending.

## Acceptance Tests

- Creating a public booking stores the booking and queues separate customer and admin emails.
- If SMTP fails, booking creation still returns success and the outbox row records the failure.
- Confirming a booking queues the confirmation email once.
- Canceling a booking queues the cancellation email with the cancellation reason.
- Delaying a booking queues the delay email with the delay reason.
- Form submission uses `Form.notificationEmail` when present.
- Form submission falls back to the `forms` recipient group when no form-specific email exists.
- Missing admin recipients produce a suppressed outbox record, not a thrown error.
- Changing sender identity affects future emails but not prior outbox snapshots.
- Missing required template tokens prevent queueing and create a clear admin-visible error.
- Unsafe token values are escaped in HTML output.
- A campaign skips unsubscribed subscribers.
- A campaign skips marketing-suppressed emails.
- An unsubscribe token changes future campaign eligibility.
- Duplicate event calls do not create duplicate sends for the same idempotency key.
- Development mode logs mail without real SMTP configuration.
- Newsletter send refuses an unverified sender domain.
- Marketing email includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- Marketing email includes the visible unsubscribe link and business mailing address.
- Provider acceptance marks an outbox row sent without claiming delivery.
- Provider delivery webhook records `deliveredAt`.
- Provider bounce or complaint updates subscriber state and suppresses future marketing sends.
- Concurrent worker runs do not process the same outbox row twice.

## Implementation Order

1. Add schema changes for sender identities, recipient groups, outbox, subscribers, lists, memberships, and campaigns.
2. Add `lib/email` service files and move the current SMTP code into the provider adapter.
3. Seed default sender identity, recipient groups, and booking/form templates.
4. Replace `sendBookingEmails` calls with event queueing.
5. Wire form submission admin notifications.
6. Add the outbox processor and a manual admin-safe way to run it locally.
7. Add newsletter subscriber and unsubscribe routes.
8. Add campaign draft, test send, schedule, and queueing behavior.
9. Add delivery and campaign summary screens to the Communications module.

## Research Basis

- Google email sender guidelines: https://support.google.com/a/answer/81126
- Microsoft high-volume sender requirements: https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- RFC 8058 one-click unsubscribe: https://www.rfc-editor.org/rfc/rfc8058.html
- Nodemailer message and custom header docs: https://nodemailer.com/message
- PostgreSQL row locking and `SKIP LOCKED`: https://www.postgresql.org/docs/current/sql-select.html
- Railway cron jobs: https://docs.railway.com/cron-jobs
- Resend webhook behavior as a provider-event example: https://resend.com/docs/dashboard/webhooks/introduction

## Open Later

- Staff or assignment-based notification routing.
- SMS.
- Visual email builder.
- Provider webhooks for bounces, complaints, opens, and clicks.
- Agency multi-tenant sender verification and domain management.
- Advanced segmentation beyond explicit list membership.
