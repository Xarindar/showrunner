# Client-owned email sending

Settings → Email is the default setup for each independent Showrunner deployment. Clients own their provider account, sending domain/mailbox, credentials and provider billing. There is no Showrunner-managed email account or Google OAuth email application.

## Client flow

1. Click Set up email (or Change provider or email) to open the shared modal. The page itself keeps only the connection summary and controls. Neutral square tiles offer Gmail/Google Workspace, IONOS, and Other SMTP. Provider logos are local transparent PNGs; sources are recorded in public/provider-logos/README.md. No tile is shown as already selected.
2. Gmail asks whether 2-Step Verification is already on. Yes goes to the app-password step; No opens instructions and a link for enabling 2-Step Verification first. The next step explains creating a password named Showrunner, copying all 16 characters before closing Google's page, and pasting it into the password field. Next stays disabled for blank/whitespace input, including when editing an existing connection. Managed Google accounts may not allow app passwords; the wizard links Google's help and allows returning to choose another provider.
3. IONOS Mail Basic/Business uses smtp.ionos.com, TLS on port 465, and the full sender address as username. Clients enter their mailbox password, not their IONOS customer account password. A Webmail link helps check that login. Other SMTP exposes the provider's outgoing hostname, secure port and username. All providers collect a sender name and email address. Replies always go to that same address; there is no separate reply-to field.
4. The final step sends the test to the configured sender address, with no recipient field. Send test email validates actual sending without saving or replacing the working connection. After a successful test, Done saves the unchanged connection without sending another message. Changing any details requires another test. The encrypted test receipt is bound to the site, authenticated admin, configuration/credential fingerprint and revision, and expires after ten minutes.

Back appears beside the step indicator, Yes/No appear in the footer, and the modal X closes setup. Values survive Back; changing providers clears entered credentials. Required fields must be valid before advancing. Closing the modal discards its unsaved values. Actions and close are guarded while a request is pending.

Text fields start empty, including when editing. Business details and previously saved values appear only as placeholders; placeholders are never submitted as entered values. The SMTP port retains its normal select default. Users do not need to delete demo text before entering their own details.

Gmail uses smtp.gmail.com with TLS and the client's app password. IONOS uses its documented mail servers. Other SMTP requires a public hostname, credentials, and port 465, 587 or 2525, with TLS required. SMTP sending must be permitted by the deployment's hosting network. A provider rejecting login or sender verification produces recovery guidance without discarding entered values. Previously stored Resend connections retain their backend transport for compatibility, but Resend is not offered in the picker.

Existing credentials never return to the browser. Gmail always requires a newly entered app password in the wizard. Other providers may retain a saved password only for the same provider/login configuration. Failed tests, expired test receipts and stale revisions preserve the current connection. Disconnect uses a confirmation dialog and checks the saved revision.

## Installation and workers

Apply Prisma migrations and regenerate the client before starting the updated app. Secrets are encrypted with AES-256-GCM using a purpose-derived key from the deployment's existing strong AUTH_SECRET. EMAIL_CREDENTIAL_ENCRYPTION_KEY is an optional dedicated override; preserve the chosen encryption source across restarts and deployments, and supply the same value to the email worker. Changing it without reencrypting stored secrets requires reconnecting. Credentials persist in the deployment's own Postgres database, not environment variables or a central service.

The existing outbox processor routes non-marketing messages through the site's connected provider. Resend retries use the message's stable idempotency key; SMTP follows the existing delivery semantics. Existing SMTP env configuration remains available for installations that already use it and for marketing, whose sender/suppression rules are unchanged. A new standalone installation still needs its regular email worker scheduled to process the outbox; the setup test sends directly so a valid provider connection alone does not prove that worker scheduling is configured.

Queued messages preserve their saved sender address. After an address change or disconnect, messages for the previous address fail safely instead of using another identity or falling back silently. Review and Resend in Communications creates a new message with the current sender. Existing messages and customer records are retained.

The earlier Google OAuth email schema migration remains in history for installations that applied it. The following migration removes that unused OAuth credential table and renames its delivery classification to CONNECTED. Google Calendar is a separate existing integration and is unaffected.

Provider references: [IONOS mail settings](https://www.ionos.com/help/index.php?id=2490), [Gmail app passwords](https://support.google.com/accounts/answer/185833), [Nodemailer SMTP](https://nodemailer.com/smtp).
