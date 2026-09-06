# Showrunner

## Platform
Web application.

## Product and users
Showrunner is the reusable administration product. Client websites integrate with it; Cottage616 is the beta installation used to validate this content editor.

## Content editing
Website owners see their actual website in the central canvas. Selecting a section opens that section's content fields in a right sidebar. They can update approved text, images, and featured services. Site designers own the page sections, layout, and order; customers cannot add, remove, duplicate, or move sections.

The inspector groups fields by the visual item, with its image first. Each header slide has an accordion containing its image, title, caption, and button. Add header creates a slide inside the existing fixed section. The photo or empty image placeholder opens the media picker. The editor hides alternative text, internal location IDs, and SEO fields; accessibility descriptions remain in the site data. Native menus and links let owners switch between registered pages without losing unpublished edits.

Buttons offer Page, Service (where booking is configured), and Web address destinations. Existing links remain intact until edited; Web address supports custom links. Service destinations use the service slug and open booking at its next available day. The desktop dashboard panel can collapse to a narrow expand-control rail, and its preference persists across visits. Mobile retains the existing navigation drawer.

The editor uses open-source Puck inside Showrunner's existing admin shell. Draft edits preview immediately. Publishing uses the existing authenticated, site-scoped content service, revision checks and media library. Existing Cottage616 content supplies initial values. Cottage616's integration may change to fit the reusable Showrunner workflow.

## Stack
Next.js App Router, React, TypeScript, Puck, Prisma and PostgreSQL. Websites consume Showrunner's public content API and the shared preview bridge. Existing hosting is Railway.
