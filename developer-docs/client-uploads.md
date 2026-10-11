# Client uploads

Enable the Client uploads module and configure the dedicated `UPLOAD_*` variables from `.env.example` using Railway bucket references. Keep this bucket separate from website media. Creating the first project link sets bucket CORS to the configured `NEXT_PUBLIC_APP_URL` origin. Apply the new Prisma migration before starting the release.

Owners/admins create a project link in `/admin/modules/uploads`, copy it to the client, download originals, and close the link when finished. Clients upload directly to the private bucket; no image processor touches the files. Files are served only as attachments through short-lived download links issued to an authenticated admin with `uploads:manage`. Upload links grant write access only, never file listing or downloads.

Links expire in 30 days. Limits: 250 MiB per file, 200 files and 10 GiB reserved per project. Reservations are atomic and include interrupted uploads. Pending uploads retain their reservation; create a new project link if abandoned uploads exhaust the allowance. Closing a link stops new upload authorizations; an already-issued upload URL remains valid for up to 15 minutes and can complete its existing reservation. Uploaded objects cannot be overwritten through upload URLs.

The module accepts arbitrary original files, including RAW, HEIC and ZIP, and does not render uploaded content inline. It does not scan files for malware, automatically delete files, or provide backups. Download only files from clients you trust. The upload portal is an intake inbox, separate from Portfolio and published Media.
