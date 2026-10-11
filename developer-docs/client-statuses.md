# Client statuses and service selection

Settings → Module settings → Clients → Client statuses controls visible status choices, their labels, and the default for the Add client form. Session booked and Session paid are available for photography businesses. Other installations retain their original choices until configured.

Configuration is stored per site in the existing Clients module setting `statuses`. Stored status keys remain stable when a label changes. Hidden statuses already assigned to clients remain visible in filters and editable without changing their meaning. CSV exports use configured labels and include Service ID; imports resolve those labels and only accept service IDs from the current site's catalog.

The Add client form uses Status and Service, without Pipeline or Tags controls. Service selection is also editable on the client profile and visible on the client list and profile. It records a catalog reference in `Client.preferences.serviceId`, preserving other preferences on update. Newly selected services must be active and belong to the current site; an existing inactive service can be retained.

These are manual client record fields. Choosing a service or a paid status does not create an appointment, collect money, or verify payment. Existing booking, payment, automation, and public client creation behavior is unchanged. No database migration is required for these fields.

Checks: `npm test`, TypeScript, targeted ESLint, and the deployed Add client / Module settings flow.
