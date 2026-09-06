---
name: Showrunner Content Editor
description: Quiet administrative controls around the client's actual website.
colors:
  brand: "var(--color-brand, #116466)"
  brand-dark: "var(--color-brand-dark, #164e50)"
  surface: "#ffffff"
  surface-sunken: "#ecece9"
  ink: "#20221f"
  muted: "#656a65"
  line: "#d9dbd6"
  danger: "#b42318"
typography:
  title:
    fontFamily: "var(--font-sans, sans-serif)"
    fontSize: "18px"
  body:
    fontFamily: "var(--font-sans, sans-serif)"
    fontSize: "14px"
  label:
    fontFamily: "var(--font-sans, sans-serif)"
    fontSize: "12px"
rounded:
  toolbar: "5px"
  field: "6px"
  group: "8px"
spacing:
  compact: "8px"
  small: "12px"
  regular: "16px"
  toolbar: "20px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.toolbar}"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.brand-dark}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.toolbar}"
  inspector:
    backgroundColor: "{colors.surface}"
    width: "340px"
---

# Design System: Showrunner Content Editor

## Overview

The established direction is quiet administrative chrome around the actual client website. This document records the Content editor inside Showrunner's existing admin shell; it does not prescribe a visual identity for client websites or unrelated Showrunner surfaces. The explicit composition in PRODUCT.md is the direction contract.

**Key Characteristics:**
- Restrained white surfaces, fine dividers, compact controls.
- A central website preview with a contextual right inspector.
- Client typography, imagery, colors, and responsive behavior remain owned by the website.

## Colors

Primary actions and keyboard focus inherit the tenant's brand tokens. The frontmatter preserves those live CSS references; their fallback colors are not a replacement tenant palette. Admin surface, sunken surface, ink, muted text, and dividers come from the admin overrides in app/globals.css. Danger identifies publish errors.

The inspector's existing content fields retain their white backgrounds, dark text, gray borders, and teal focus outline from studio.module.css. Website imagery and colors are not editor tokens.

## Typography

The editor inherits the existing sans stack through `--font-sans` (the base theme uses Geist Sans and system fallbacks). The toolbar title is the title role; inspector headings use (16px), controls use the body role, and save status and footer guidance use the label role. Keep administrative text compact and functional. The iframe renders the client's own type system.

## Layout

The expanded desktop admin navigation occupies (240px). Above (860px), its collapse control reduces it to a (52px) rail containing only the expand control; the preference persists across visits. Mobile retains the existing navigation drawer. The editor fills the remaining viewport height, with a wrapping toolbar of at least (60px), a flexible central canvas, and a compact footer. The website iframe fills the canvas; mobile preview centers a (390px) iframe constrained to the available width.

Selecting a fixed website section opens a right inspector; closing it returns the width to the canvas. The inspector scrolls independently. At (1050px) and below, toolbar spacing tightens, save status hides, and the inspector narrows to (310px). At (860px) and below, the editor accounts for the mobile shell header, the title wraps onto its own row, history controls hide, and the inspector overlays the canvas at `min(340px, 92%)`. The footer section selector remains an alternative to clicking the website.

## Elevation & Depth

The editor uses white and sunken surfaces separated by thin borders. The canvas and desktop inspector have no decorative card elevation. Only the mobile inspector uses a lateral shadow (`-6px 0 24px #0002`) to distinguish its overlay from the website beneath it.

## Shapes

Toolbar controls have modest corners; content inputs and image previews use the field radius, and grouped rows use the group radius. The canvas is a borderless, square-edged iframe. Keep the shell's existing navigation shape rather than introducing a second navigation treatment.

## Components

- **Toolbar:** Content title, page selector, desktop/mobile toggle, undo/redo, save status, website link, and Publish. Quiet controls use the sunken surface on hover; selected preview size uses that same fill. Publish alone has the solid brand treatment. Disabled toolbar actions use reduced opacity (.45).
- **Inspector:** A section heading and close control precede approved content fields, grouped by visual item with the image first. Native disclosure groups use fine bottom dividers and compact headings. Each Header accordion contains its slide's image, title, caption, and Button settings; Add header appends a slide within the fixed section. Inputs have (10px 12px) padding; fields use (16px) vertical gaps.
- **Image picker:** The full photo or empty placeholder is the picker button. A bottom hint appears on hover and keyboard focus; empty placeholders and touch devices keep the hint visible. Preserve its accessible button label and focus outline.
- **Button settings:** Title and destination appear together. Link to selects Page, Service where available, or Web address, followed by the corresponding labeled selector or input. Service destinations include next-available-date guidance; existing destinations remain selectable.
- **Focus:** Toolbar buttons and selectors retain a visible (2px) brand outline with (2px) offset. Content fields retain their existing explicit focus outline and visible labels.
- **Feedback:** Loading and connection messages appear over the canvas; publish feedback appears below the toolbar with status or alert semantics. Preserve edits when publishing fails.
- **Website canvas:** Native menus and in-page anchors remain usable; navigation links switch registered pages while retaining drafts. Hide technical metadata from the inspector while preserving accessibility data. Render the actual website, with draft changes previewed immediately. Clicking a fixed section selects its content inspector. Content owners edit approved text, images, and services; page sections, their layout, and their order remain designer-owned. Do not expose insertion, deletion, duplication, or drag controls for page sections.

## Do's and Don'ts

- Do preserve the existing Showrunner shell and tenant brand tokens.
- Do keep the real website central and the inspector contextual.
- Do retain keyboard access, visible focus, field labels, and publish feedback.
- Don't substitute reconstructed editor cards for the real website iframe.
- Don't apply admin typography or colors to the client website.
- Don't expose controls that add, remove, duplicate, or reorder page sections.

Source of truth: modules/content/studio/{puck-editor.tsx,puck-editor.module.css,editor.tsx,content-fields.tsx,field-layout.ts,studio.module.css}, shell/admin-sidebar.tsx, app/globals.css, and lib/theme/tokens.ts. Reviewed screenshots are .impeccable/review/pass2-desktop.png, pass2-team.png, and pass2-mobile.png; saved beta copy and incomplete image loading in captures are not visual design requirements.
