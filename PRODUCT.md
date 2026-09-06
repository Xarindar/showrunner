# Showrunner

## Platform
Web application.

## Product and users
Showrunner is the reusable administration product. Client websites integrate with it; Cottage616 is the beta installation used to validate this content editor.

## Content editing
Website owners see their actual website in the central canvas. Selecting a section opens that section's content fields in a right sidebar. They can update approved text, images, and featured services. Site designers own the page sections, layout, and order; customers cannot add, remove, duplicate, or move sections.

The editor uses open-source Puck inside Showrunner's existing admin shell. Draft edits preview immediately. Publishing uses the existing authenticated, site-scoped content service, revision checks and media library. Existing Cottage616 content supplies initial values. Cottage616's integration may change to fit the reusable Showrunner workflow.

## Stack
Next.js App Router, React, TypeScript, Puck, Prisma and PostgreSQL. Websites consume Showrunner's public content API and the shared preview bridge. Existing hosting is Railway.
