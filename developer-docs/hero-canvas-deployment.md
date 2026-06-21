# Hero Canvas Deployment

The content module now saves the homepage hero as a canvas-style JSON contract. The admin UI stores the data in the existing `HeroPresentation`, `HeroSlide`, and `HeroSlideElement` tables, then exposes it to front ends as `backgrounds` plus positioned `canvasLayers`.

## Public API

Use the public API endpoint:

```http
GET /api/public/v1/content/hero
Authorization: Bearer <publishable-api-key>
```

Browser clients may also send the key as `X-Showrunner-Key`. The key must include the `content:read` scope and its allowed origins must include the front-end domain.

Responses are wrapped by the public API gateway:

```json
{
  "data": {
    "hero": {
      "sectionId": "canvas-hero-01",
      "backgrounds": [
        {
          "id": "bg-01",
          "type": "image",
          "url": "/hero.svg",
          "altText": "Book services without the back-and-forth hero background"
        }
      ],
      "canvasLayers": [
        {
          "id": "layer-headline",
          "type": "text",
          "role": "headline",
          "content": "Book services without the back-and-forth",
          "style": { "fontSize": "4rem", "color": "#ffffff" },
          "layout": { "colStart": 1, "colEnd": 5, "rowStart": 2, "rowEnd": 3 }
        },
        {
          "id": "layer-caption",
          "type": "text",
          "role": "caption",
          "content": "A client-ready website and admin panel for service appointments.",
          "style": { "fontSize": "1.1rem", "color": "rgba(255,255,255,0.86)" },
          "layout": { "colStart": 1, "colEnd": 4, "rowStart": 3, "rowEnd": 4 }
        },
        {
          "id": "layer-cta",
          "type": "button",
          "role": "cta",
          "content": "Book an appointment",
          "link": "/book",
          "style": { "theme": "primary" },
          "layout": { "colStart": 1, "colEnd": 3, "rowStart": 4, "rowEnd": 5 }
        }
      ]
    }
  }
}
```

When the response only contains `data.hero`, render a single static hero. If the response includes `data.slideshow`, render `data.slideshow.screens` and use `data.slideshow.autoplayIntervalMs`; otherwise do not show slideshow controls.

## Front-End Rendering Rules

Use a fixed 6-column by 4-row CSS grid for the hero canvas. The JSON layout values are grid lines, so `colStart: 1, colEnd: 5` maps directly to `grid-column: 1 / 5`.

The background image is not a draggable/rendered component in the layer stack. Render `hero.backgrounds[0]` as a full-bleed image or CSS background behind the grid, then render `canvasLayers` above it.

Example renderer:

```tsx
function HeroCanvas({ hero }: { hero: HeroCanvasConfig }) {
  const background = hero.backgrounds[0];

  return (
    <section className="hero-canvas" aria-label="Homepage hero">
      <img className="hero-canvas-bg" src={background.url} alt={background.altText} />
      <div className="hero-canvas-scrim" />
      <div className="hero-canvas-grid">
        {hero.canvasLayers.map((layer) => {
          const style = {
            gridColumn: `${layer.layout.colStart} / ${layer.layout.colEnd}`,
            gridRow: `${layer.layout.rowStart} / ${layer.layout.rowEnd}`
          };

          if (layer.type === "button") {
            return (
              <a key={layer.id} className="hero-canvas-button" href={layer.link} style={style}>
                {layer.content}
              </a>
            );
          }

          const Tag = layer.role === "headline" ? "h1" : "p";
          return (
            <Tag key={layer.id} className={`hero-canvas-${layer.role}`} style={style}>
              {layer.content}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
```

Base CSS:

```css
.hero-canvas {
  display: grid;
  min-height: 560px;
  overflow: hidden;
  position: relative;
}

.hero-canvas-bg,
.hero-canvas-scrim {
  inset: 0;
  position: absolute;
}

.hero-canvas-bg {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.hero-canvas-scrim {
  background: linear-gradient(90deg, rgba(8, 18, 16, 0.72), rgba(8, 18, 16, 0.32));
}

.hero-canvas-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  min-height: 560px;
  padding: 24px;
  position: relative;
  z-index: 1;
}
```

## Deployment Checklist

1. Create or update a publishable API key in Admin > Settings with `content:read`.
2. Add the front-end production origin to the key allowlist.
3. Set the front-end environment variable for the API base URL and publishable key.
4. Fetch `/api/public/v1/content/hero` during page render or revalidation.
5. Render `data.hero` as the default hero.
6. Only enable slideshow behavior when `data.slideshow` exists.
7. Keep the front-end grid at 6 columns by 4 rows unless the admin/editor constants are changed at the same time.
