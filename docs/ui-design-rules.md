# UI Design Rules

This app follows a clean, Vercel-influenced interface language without copying Vercel's monochrome brand.

## Research Anchors

- Vercel Geist Design System: https://vercel.com/geist/introduction
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- Vercel Geist Typography: https://examples.vercel.com/geist/typography
- Material layout consistency: https://m2.material.io/design/layout/understanding-layout.html
- Nielsen Norman usability heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/

## Rules

- Use Geist Sans for interface text and Geist Mono for metrics, timestamps, amounts, and tabular comparisons.
- Keep cards and controls at 8px radius or less.
- Use fixed or reserved dimensions for cards, tables, booking steps, action rows, and media tiles.
- If content can exist later, reserve space for it now.
- Button clicks must not resize the surrounding container.
- Loading states are skeleton rows or skeleton cards that mirror final layout dimensions.
- Prefer equal-height grid rows over masonry-like card stacks.
- Use internal scrolling only inside known fixed panels, not as a default decoration.
- Do not use `transition: all`; animate only color, border, shadow, opacity, or transform.
- Design empty, sparse, dense, and error states for each repeated surface.
