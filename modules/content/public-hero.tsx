"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import NextImage from "next/image";
import { MousePointerClick } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { toHeroCanvasPayload, type HeroCanvasLayout, type HeroCanvasLayer, type HeroPresentationEditor } from "./hero-presentation";

type PublicHeroPresentationProps = {
  presentation: HeroPresentationEditor;
};

export function PublicHeroPresentation({ presentation }: PublicHeroPresentationProps) {
  const payload = useMemo(() => toHeroCanvasPayload(presentation), [presentation]);
  const screens = payload.slideshow?.screens ?? [payload.hero];
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, screens.length - 1));
  const activeHero = screens[safeActiveIndex] || screens[0];
  const background = activeHero?.backgrounds[0];

  useEffect(() => {
    if (!payload.slideshow || screens.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % screens.length);
    }, payload.slideshow.autoplayIntervalMs);

    return () => window.clearInterval(timer);
  }, [payload.slideshow, screens.length]);

  if (!activeHero) return null;

  return (
    <section className="hero hero-presentation" aria-label="Homepage hero">
      {background ? (
        <div className="hero-presentation-background">
          <NextImage src={background.url || "/hero.svg"} alt={background.altText} fill sizes="100vw" priority unoptimized />
        </div>
      ) : null}
      <div className="hero-presentation-scrim" aria-hidden="true" />

      <div className="hero-presentation-stage">
        {activeHero.canvasLayers.map((layer) => (
          <HeroCanvasLayer key={layer.id} layer={layer} />
        ))}
      </div>

      {screens.length > 1 ? (
        <div className="hero-presentation-dots" aria-label="Hero screens">
          {screens.map((screen, index) => (
            <button
              aria-label={`Show hero screen ${index + 1}`}
              aria-pressed={index === safeActiveIndex}
              key={screen.sectionId}
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HeroCanvasLayer({ layer }: { layer: HeroCanvasLayer }) {
  if (!layer.content) return null;

  if (layer.type === "button") {
    return (
      <div className="hero-presentation-element hero-presentation-cta" style={heroPublicElementStyle(layer.layout)}>
        <ButtonLink href={layer.link || "/book"}>
          <MousePointerClick size={18} aria-hidden="true" />
          {layer.content}
        </ButtonLink>
      </div>
    );
  }

  if (layer.role === "headline") {
    return (
      <h1 className="hero-presentation-element hero-presentation-title" style={heroPublicElementStyle(layer.layout)}>
        {layer.content}
      </h1>
    );
  }

  return (
    <p className="hero-presentation-element hero-presentation-caption" style={heroPublicElementStyle(layer.layout)}>
      {layer.content}
    </p>
  );
}

function heroPublicElementStyle(layout: HeroCanvasLayout): CSSProperties {
  return {
    gridColumn: `${layout.colStart} / ${layout.colEnd}`,
    gridRow: `${layout.rowStart} / ${layout.rowEnd}`
  };
}
