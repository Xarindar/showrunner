"use client";

import { useEffect, useState, type CSSProperties } from "react";
import NextImage from "next/image";
import { MousePointerClick } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { heroElementsArray, type HeroElementLayout, type HeroPresentationEditor } from "./hero-presentation";

type PublicHeroPresentationProps = {
  presentation: HeroPresentationEditor;
};

export function PublicHeroPresentation({ presentation }: PublicHeroPresentationProps) {
  const slides = presentation.mode === "SLIDESHOW" ? presentation.slides : presentation.slides.slice(0, 1);
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[safeActiveIndex] || slides[0];

  useEffect(() => {
    if (presentation.mode !== "SLIDESHOW" || slides.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, presentation.autoplayIntervalMs);

    return () => window.clearInterval(timer);
  }, [presentation.autoplayIntervalMs, presentation.mode, slides.length]);

  if (!activeSlide) return null;

  return (
    <section className="hero hero-presentation" aria-label="Homepage hero">
      <div className="hero-presentation-stage">
        {heroElementsArray(activeSlide.elements).map((element) => {
          if (!element.isVisible) return null;

          if (element.type === "IMAGE") {
            return (
              <div className="hero-presentation-element hero-presentation-image" key={element.type} style={heroPublicElementStyle(element)}>
                <NextImage src={activeSlide.imageUrl || "/hero.svg"} alt="" fill sizes="(max-width: 900px) 100vw, 56vw" priority unoptimized />
              </div>
            );
          }

          if (element.type === "HEADLINE") {
            return (
              <h1 className="hero-presentation-element hero-presentation-title" key={element.type} style={heroPublicElementStyle(element)}>
                {activeSlide.headline}
              </h1>
            );
          }

          if (element.type === "CAPTION") {
            return (
              <p className="hero-presentation-element hero-presentation-caption" key={element.type} style={heroPublicElementStyle(element)}>
                {activeSlide.caption}
              </p>
            );
          }

          return (
            <div className="hero-presentation-element hero-presentation-cta" key={element.type} style={heroPublicElementStyle(element)}>
              <ButtonLink href={activeSlide.ctaHref || "/book"}>
                <MousePointerClick size={18} aria-hidden="true" />
                {activeSlide.ctaLabel || "Book an appointment"}
              </ButtonLink>
            </div>
          );
        })}
      </div>

      {presentation.mode === "SLIDESHOW" && slides.length > 1 ? (
        <div className="hero-presentation-dots" aria-label="Hero screens">
          {slides.map((slide, index) => (
            <button
              aria-label={`Show hero screen ${index + 1}`}
              aria-pressed={index === safeActiveIndex}
              key={slide.clientId}
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function heroPublicElementStyle(layout: HeroElementLayout): CSSProperties {
  return {
    gridColumn: `${layout.gridColumn} / span ${layout.columnSpan}`,
    gridRow: `${layout.gridRow} / span ${layout.rowSpan}`,
    zIndex: layout.zIndex
  };
}
