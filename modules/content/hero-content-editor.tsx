"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import NextImage from "next/image";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Move,
  PanelTop,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  Type
} from "lucide-react";
import { Button, Card, Tab, Tabs } from "@/components/ui";
import type { SiteSettingsWithModules } from "@/lib/site";
import {
  HERO_GRID_COLUMNS,
  HERO_GRID_ROWS,
  createBlankHeroSlide,
  createHeroSlideCopy,
  heroElementLabel,
  heroElementsArray,
  serializeHeroPresentation,
  withUpdatedHeroElement,
  type HeroElementType,
  type HeroPresentationEditor,
  type HeroSlideEditor
} from "./hero-presentation";

type ContentAction = (formData: FormData) => void | Promise<void>;

type ContentSettingsDraft = Pick<
  SiteSettingsWithModules,
  "heroHeadline" | "heroImageUrl" | "heroSubheadline" | "introTitle" | "introBody"
>;

type HeroContentEditorProps = {
  action: ContentAction;
  initialPresentation: HeroPresentationEditor;
  settings: ContentSettingsDraft;
};

const elementIcons: Record<HeroElementType, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  HEADLINE: Type,
  CAPTION: PanelTop,
  CTA: MousePointerClick
};

export function HeroContentEditor({ action, initialPresentation, settings }: HeroContentEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState(initialPresentation);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedElement, setSelectedElement] = useState<HeroElementType>("HEADLINE");
  const [draggingElement, setDraggingElement] = useState<HeroElementType | null>(null);

  const activeSlide = presentation.slides[activeIndex] || presentation.slides[0];
  const serializedPresentation = useMemo(() => serializeHeroPresentation(presentation), [presentation]);

  function updateActiveSlide(updater: (slide: HeroSlideEditor) => HeroSlideEditor) {
    setPresentation((current) => ({
      ...current,
      slides: current.slides.map((slide, index) => (index === activeIndex ? updater(slide) : slide))
    }));
  }

  function updateActiveSlideField(field: "headline" | "caption" | "imageUrl" | "ctaLabel" | "ctaHref", value: string) {
    updateActiveSlide((slide) => ({
      ...slide,
      [field]: value
    }));
  }

  function setMode(mode: HeroPresentationEditor["mode"]) {
    setPresentation((current) => ({ ...current, mode }));
    setActiveIndex((index) => Math.min(index, presentation.slides.length - 1));
  }

  function addSlide() {
    setPresentation((current) => {
      const slides = orderSlides([...current.slides, createBlankHeroSlide(current.slides.length, settings)]);
      setActiveIndex(slides.length - 1);
      return {
        ...current,
        mode: "SLIDESHOW",
        slides
      };
    });
  }

  function duplicateSlide() {
    setPresentation((current) => {
      const source = current.slides[activeIndex] || current.slides[0];
      const slides = orderSlides([...current.slides, createHeroSlideCopy(source, current.slides.length)]);
      setActiveIndex(slides.length - 1);
      return {
        ...current,
        mode: "SLIDESHOW",
        slides
      };
    });
  }

  function removeSlide() {
    if (presentation.slides.length < 2) return;

    setPresentation((current) => {
      const slides = orderSlides(current.slides.filter((_, index) => index !== activeIndex));
      setActiveIndex(Math.max(0, Math.min(activeIndex, slides.length - 1)));
      return { ...current, slides };
    });
  }

  function nudgeElement(type: HeroElementType, deltaColumn: number, deltaRow: number) {
    updateActiveSlide((slide) => {
      const layout = slide.elements[type];
      return withUpdatedHeroElement(slide, type, {
        gridColumn: layout.gridColumn + deltaColumn,
        gridRow: layout.gridRow + deltaRow
      });
    });
  }

  function resizeElement(type: HeroElementType, deltaColumnSpan: number, deltaRowSpan: number) {
    updateActiveSlide((slide) => {
      const layout = slide.elements[type];
      return withUpdatedHeroElement(slide, type, {
        columnSpan: layout.columnSpan + deltaColumnSpan,
        rowSpan: layout.rowSpan + deltaRowSpan
      });
    });
  }

  function updateElementFromPointer(type: HeroElementType, event: PointerEvent) {
    const stage = stageRef.current;
    const layout = activeSlide.elements[type];
    if (!stage || !layout) return;

    const rect = stage.getBoundingClientRect();
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * HERO_GRID_COLUMNS) + 1;
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * HERO_GRID_ROWS) + 1;

    updateActiveSlide((slide) =>
      withUpdatedHeroElement(slide, type, {
        gridColumn: column - Math.floor(layout.columnSpan / 2),
        gridRow: row - Math.floor(layout.rowSpan / 2)
      })
    );
  }

  function handleElementPointerDown(type: HeroElementType, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setSelectedElement(type);
    setDraggingElement(type);
    stageRef.current?.setPointerCapture(event.pointerId);
    updateElementFromPointer(type, event);
  }

  function handleStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingElement) return;
    updateElementFromPointer(draggingElement, event);
  }

  function handleStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingElement) return;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    setDraggingElement(null);
  }

  const selectedLayout = activeSlide.elements[selectedElement];

  return (
    <Card action={action} as="form" className="content-hero-editor-card" minHeight="none" bodyClassName="content-hero-editor">
      <input name="heroPresentation" type="hidden" value={serializedPresentation} readOnly />

      <div className="content-hero-editor-head">
        <Tabs aria-label="Hero mode">
          <Tab aria-selected={presentation.mode === "STATIC"} onClick={() => setMode("STATIC")}>
            <Square size={16} aria-hidden="true" />
            Static
          </Tab>
          <Tab aria-selected={presentation.mode === "SLIDESHOW"} onClick={() => setMode("SLIDESHOW")}>
            <Play size={16} aria-hidden="true" />
            Slideshow
          </Tab>
        </Tabs>

        <div className="content-slide-actions">
          <Button onClick={addSlide} size="sm" type="button" variant="secondary">
            <Plus size={16} aria-hidden="true" />
            Screen
          </Button>
          <Button onClick={duplicateSlide} size="sm" type="button" variant="ghost">
            <Copy size={16} aria-hidden="true" />
            Duplicate
          </Button>
          <Button disabled={presentation.slides.length < 2} onClick={removeSlide} size="sm" type="button" variant="ghost">
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      {presentation.mode === "SLIDESHOW" ? (
        <Tabs aria-label="Hero screens" className="content-slide-tabs">
          {presentation.slides.map((slide, index) => (
            <Tab aria-selected={index === activeIndex} key={slide.clientId} onClick={() => setActiveIndex(index)}>
              {`Screen ${index + 1}`}
            </Tab>
          ))}
        </Tabs>
      ) : null}

      <div className="content-hero-workspace">
        <section className="content-hero-preview-panel" aria-label="Hero preview">
          <div
            className="content-hero-stage"
            onPointerCancel={handleStagePointerUp}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            ref={stageRef}
          >
            {heroElementsArray(activeSlide.elements).map((layout) => {
              const Icon = elementIcons[layout.type];
              const selected = selectedElement === layout.type;
              return (
                <button
                  aria-label={`${heroElementLabel(layout.type)} block`}
                  aria-pressed={selected}
                  className={`content-hero-block content-hero-block-${layout.type.toLowerCase()}`}
                  key={layout.type}
                  onClick={() => setSelectedElement(layout.type)}
                  onPointerDown={(event) => handleElementPointerDown(layout.type, event)}
                  style={heroElementStyle(layout)}
                  type="button"
                >
                  <span className="content-hero-block-chip">
                    <Move size={13} aria-hidden="true" />
                  {heroElementLabel(layout.type)}
                  </span>
                  {layout.type === "IMAGE" ? (
                    <NextImage alt="" fill sizes="(max-width: 900px) 100vw, 58vw" src={activeSlide.imageUrl || "/hero.svg"} unoptimized />
                  ) : null}
                  {layout.type === "HEADLINE" ? <strong>{activeSlide.headline || "Hero headline"}</strong> : null}
                  {layout.type === "CAPTION" ? <span>{activeSlide.caption || "Hero caption"}</span> : null}
                  {layout.type === "CTA" ? <em>{activeSlide.ctaLabel || "Book an appointment"}</em> : null}
                  <Icon className="content-hero-block-icon" size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="content-layout-toolbar" aria-label={`${heroElementLabel(selectedElement)} layout`}>
            <Button aria-label="Move left" onClick={() => nudgeElement(selectedElement, -1, 0)} size="sm" type="button" variant="ghost">
              <ArrowLeft size={16} aria-hidden="true" />
            </Button>
            <Button aria-label="Move up" onClick={() => nudgeElement(selectedElement, 0, -1)} size="sm" type="button" variant="ghost">
              <ArrowUp size={16} aria-hidden="true" />
            </Button>
            <Button aria-label="Move down" onClick={() => nudgeElement(selectedElement, 0, 1)} size="sm" type="button" variant="ghost">
              <ArrowDown size={16} aria-hidden="true" />
            </Button>
            <Button aria-label="Move right" onClick={() => nudgeElement(selectedElement, 1, 0)} size="sm" type="button" variant="ghost">
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button aria-label="Widen" onClick={() => resizeElement(selectedElement, 1, 0)} size="sm" type="button" variant="ghost">
              <Maximize2 size={16} aria-hidden="true" />
            </Button>
            <Button aria-label="Narrow" onClick={() => resizeElement(selectedElement, -1, 0)} size="sm" type="button" variant="ghost">
              <Minimize2 size={16} aria-hidden="true" />
            </Button>
            <span>{`${heroElementLabel(selectedElement)} ${selectedLayout.gridColumn}.${selectedLayout.gridRow}`}</span>
          </div>
        </section>

        <section className="content-hero-fields" aria-label="Hero content fields">
          <div className="content-field-section">
            <h2>Hero</h2>
            <div className="ui-field">
              <label htmlFor="heroEditorHeadline">Title</label>
              <input
                id="heroEditorHeadline"
                onChange={(event) => updateActiveSlideField("headline", event.target.value)}
                required
                value={activeSlide.headline}
              />
            </div>
            <div className="ui-field">
              <label htmlFor="heroEditorCaption">Caption</label>
              <textarea
                id="heroEditorCaption"
                onChange={(event) => updateActiveSlideField("caption", event.target.value)}
                value={activeSlide.caption}
              />
            </div>
            <div className="ui-field">
              <label htmlFor="heroEditorImageUrl">Image URL</label>
              <input
                id="heroEditorImageUrl"
                onChange={(event) => updateActiveSlideField("imageUrl", event.target.value)}
                required
                value={activeSlide.imageUrl}
              />
            </div>
          </div>

          <div className="content-field-section">
            <h2>CTA</h2>
            <div className="content-cta-grid">
              <div className="ui-field">
                <label htmlFor="heroEditorCtaLabel">Label</label>
                <input
                  id="heroEditorCtaLabel"
                  onChange={(event) => updateActiveSlideField("ctaLabel", event.target.value)}
                  required
                  value={activeSlide.ctaLabel}
                />
              </div>
              <div className="ui-field">
                <label htmlFor="heroEditorCtaHref">URL</label>
                <input
                  id="heroEditorCtaHref"
                  onChange={(event) => updateActiveSlideField("ctaHref", event.target.value)}
                  required
                  value={activeSlide.ctaHref}
                />
              </div>
            </div>
          </div>

          <div className="content-field-section">
            <h2>Intro</h2>
            <div className="ui-field">
              <label htmlFor="introTitle">Title</label>
              <input id="introTitle" name="introTitle" required defaultValue={settings.introTitle} />
            </div>
            <div className="ui-field">
              <label htmlFor="introBody">Body</label>
              <textarea id="introBody" name="introBody" defaultValue={settings.introBody} />
            </div>
          </div>
        </section>
      </div>

      <Button type="submit">
        <Save size={18} aria-hidden="true" />
        Save content
      </Button>
    </Card>
  );
}

function heroElementStyle(layout: { gridColumn: number; gridRow: number; columnSpan: number; rowSpan: number; zIndex: number }): CSSProperties {
  return {
    gridColumn: `${layout.gridColumn} / span ${layout.columnSpan}`,
    gridRow: `${layout.gridRow} / span ${layout.rowSpan}`,
    zIndex: layout.zIndex
  };
}

function orderSlides(slides: HeroSlideEditor[]) {
  return slides.map((slide, index) => ({
    ...slide,
    sortOrder: index
  }));
}
