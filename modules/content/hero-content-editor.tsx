"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import NextImage from "next/image";
import { Check, Image as ImageIcon, MousePointerClick, PanelTop, Plus, Save, Trash2, Type, Upload } from "lucide-react";
import { Button, Card, Modal, Tab, Tabs } from "@/components/ui";
import type { SiteSettingsWithModules } from "@/lib/site";
import {
  HERO_GRID_COLUMNS,
  HERO_GRID_ROWS,
  heroCanvasLayerElementTypes,
  heroCanvasLayerElementsArray,
  heroElementLabel,
  serializeHeroPresentation,
  withUpdatedHeroElement,
  type HeroCanvasLayerElementLayout,
  type HeroCanvasLayerElementType,
  type HeroElementType,
  type HeroPresentationEditor,
  type HeroSlideEditor
} from "./hero-presentation";

type ContentAction = (formData: FormData) => void | Promise<void>;
type ContentSettingsDraft = Pick<SiteSettingsWithModules, "heroHeadline" | "heroSubheadline">;

export type HeroMediaAssetOption = {
  alt: string;
  filename: string;
  id: string;
  thumbnailUrl: string;
  url: string;
};

type HeroContentEditorProps = {
  action: ContentAction;
  canUploadHeroImage: boolean;
  initialPresentation: HeroPresentationEditor;
  mediaAssets: HeroMediaAssetOption[];
  settings: ContentSettingsDraft;
};

type ActiveModal = "add" | "image" | null;

type PointerInteraction = {
  lastTime: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  type: HeroCanvasLayerElementType;
};

type DragMotion = {
  speed: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};

const dragThresholdPx = 6;
const dotGridColumns = 30;
const dotGridRows = 18;

const layerIcons: Record<HeroCanvasLayerElementType, typeof Type> = {
  HEADLINE: Type,
  CAPTION: PanelTop,
  CTA: MousePointerClick
};

export function HeroContentEditor({ action, canUploadHeroImage, initialPresentation, mediaAssets, settings }: HeroContentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointerInteractionRef = useRef<PointerInteraction | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState(() => ({
    ...initialPresentation,
    mode: initialPresentation.slides.length > 1 ? initialPresentation.mode : "STATIC"
  }));
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [dragMotion, setDragMotion] = useState<DragMotion | null>(null);
  const [draggingLayer, setDraggingLayer] = useState<HeroCanvasLayerElementType | null>(null);
  const [editingLayer, setEditingLayer] = useState<HeroCanvasLayerElementType | null>(null);
  const [pendingUploadName, setPendingUploadName] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<HeroCanvasLayerElementType>("HEADLINE");

  const activeSlide = presentation.slides[activeIndex] || presentation.slides[0];
  const showScreenTabs = presentation.slides.length > 1;
  const visibleLayers = heroCanvasLayerElementsArray(activeSlide.elements).filter((layout) => layout.isVisible);
  const draggedLayout = draggingLayer ? activeSlide.elements[draggingLayer] : null;
  const serializedPresentation = useMemo(
    () =>
      serializeHeroPresentation({
        ...presentation,
        mode: presentation.slides.length > 1 ? presentation.mode : "STATIC"
      }),
    [presentation]
  );

  useEffect(() => {
    return () => {
      if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
    };
  }, [previewImageUrl]);

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

  function addLayer(type: HeroCanvasLayerElementType) {
    updateActiveSlide((slide) => {
      const nextSlide = withUpdatedHeroElement(slide, type, { isVisible: true });
      if (type === "HEADLINE" && !nextSlide.headline) return { ...nextSlide, headline: settings.heroHeadline || "Hero title" };
      if (type === "CAPTION" && !nextSlide.caption) return { ...nextSlide, caption: settings.heroSubheadline || "Hero caption" };
      if (type === "CTA" && !nextSlide.ctaLabel) return { ...nextSlide, ctaLabel: "Book an appointment", ctaHref: "/book" };
      return nextSlide;
    });
    setSelectedLayer(type);
    setEditingLayer(null);
    setActiveModal(null);
  }

  function hideLayer(type: HeroCanvasLayerElementType) {
    updateActiveSlide((slide) => withUpdatedHeroElement(slide, type, { isVisible: false }));
    setEditingLayer(null);
  }

  function selectExistingImage(asset: HeroMediaAssetOption) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingUploadName("");
    setPreviewImageUrl("");
    updateActiveSlideField("imageUrl", asset.url);
    setActiveModal(null);
  }

  function triggerUploadPicker() {
    if (!canUploadHeroImage) return;
    fileInputRef.current?.click();
  }

  function handleHeroImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewImageUrl(objectUrl);
    setPendingUploadName(file.name);
    updateActiveSlideField("imageUrl", objectUrl);
    setActiveModal(null);
  }

  function updateLayerFromPointer(type: HeroCanvasLayerElementType, event: PointerEvent) {
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

  function handleLayerPointerDown(type: HeroCanvasLayerElementType, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;

    event.preventDefault();
    setSelectedLayer(type);
    setEditingLayer(null);
    pointerInteractionRef.current = {
      moved: false,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      type
    };
    stageRef.current?.setPointerCapture(event.pointerId);
  }

  function handleStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = pointerInteractionRef.current;
    if (!interaction) return;

    const distance = Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY);
    if (!interaction.moved && distance > dragThresholdPx) {
      interaction.moved = true;
      setDraggingLayer(interaction.type);
    }

    if (interaction.moved) {
      updateLayerFromPointer(interaction.type, event);
      updateDragMotion(interaction, event);
    }
  }

  function handleStagePointerUp() {
    const interaction = pointerInteractionRef.current;
    if (!interaction) return;

    if (stageRef.current?.hasPointerCapture(interaction.pointerId)) {
      stageRef.current.releasePointerCapture(interaction.pointerId);
    }

    if (!interaction.moved) {
      setSelectedLayer(interaction.type);
      setEditingLayer(interaction.type);
    }

    pointerInteractionRef.current = null;
    setDragMotion(null);
    setDraggingLayer(null);
  }

  function updateDragMotion(interaction: PointerInteraction, event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return;

    const now = event.timeStamp;
    const elapsed = Math.max(16, now - interaction.lastTime);
    const velocityX = ((event.clientX - interaction.lastX) / elapsed) * 1000;
    const velocityY = ((event.clientY - interaction.lastY) / elapsed) * 1000;
    const rect = stage.getBoundingClientRect();

    interaction.lastTime = now;
    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;

    setDragMotion({
      speed: Math.min(3200, Math.hypot(velocityX, velocityY)),
      velocityX,
      velocityY,
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height)
    });
  }

  const editorToolbar = (
    <div className="content-hero-toolbar">
      <div className="content-hero-toolbar-left">
        {showScreenTabs ? (
          <Tabs aria-label="Hero screens" className="content-slide-tabs">
            {presentation.slides.map((slide, index) => (
              <Tab aria-selected={index === activeIndex} key={slide.clientId} onClick={() => setActiveIndex(index)}>
                {`Screen ${index + 1}`}
              </Tab>
            ))}
          </Tabs>
        ) : null}
        {pendingUploadName ? <span className="ui-badge">{pendingUploadName}</span> : null}
      </div>
      <div className="content-hero-toolbar-actions">
        <Button aria-label="Choose hero image" onClick={() => setActiveModal("image")} size="sm" type="button" variant="secondary">
          <ImageIcon size={16} aria-hidden="true" />
          Image
        </Button>
        <Button aria-label="Add hero asset" onClick={() => setActiveModal("add")} size="sm" type="button" variant="secondary">
          <Plus size={16} aria-hidden="true" />
          Add
        </Button>
        <Button size="sm" type="submit">
          <Save size={16} aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <Card
      action={action}
      as="form"
      bodyClassName="content-hero-editor"
      className="content-hero-editor-card"
      encType="multipart/form-data"
      minHeight="none"
      reservedHeader={editorToolbar}
    >
      <input name="heroPresentation" type="hidden" value={serializedPresentation} readOnly />
      <input name="activeHeroSlideIndex" type="hidden" value={activeIndex} readOnly />
      <input
        accept="image/*"
        className="ui-hidden"
        name="heroBackgroundUpload"
        onChange={handleHeroImageUpload}
        ref={fileInputRef}
        type="file"
      />

      <section className="content-hero-preview-panel" aria-label="Hero preview">
        <div
          className="content-hero-stage"
          data-dragging={Boolean(draggingLayer)}
          onPointerCancel={handleStagePointerUp}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          ref={stageRef}
        >
          <NextImage
            alt=""
            className="content-hero-background"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 72vw"
            src={activeSlide.imageUrl || "/hero.svg"}
            unoptimized
          />
          <div className="content-hero-stage-scrim" aria-hidden="true" />
          {draggedLayout && dragMotion ? <HeroDotGrid activeLayout={draggedLayout} motion={dragMotion} /> : null}
          {visibleLayers.map((layout) => (
            <HeroCanvasLayer
              editing={editingLayer === layout.type}
              key={layout.type}
              layout={layout}
              onEdit={() => setEditingLayer(layout.type)}
              onHide={() => hideLayer(layout.type)}
              onPointerDown={(event) => handleLayerPointerDown(layout.type, event)}
              onSelect={() => setSelectedLayer(layout.type)}
              onStopEditing={() => setEditingLayer(null)}
              selected={selectedLayer === layout.type}
              slide={activeSlide}
              updateActiveSlideField={updateActiveSlideField}
            />
          ))}
        </div>
      </section>

      <Modal className="content-asset-modal" onClose={() => setActiveModal(null)} open={activeModal === "image"} title="Hero image">
        <div className="content-modal-actions">
          <Button disabled={!canUploadHeroImage} onClick={triggerUploadPicker} type="button">
            <Upload size={18} aria-hidden="true" />
            Upload image
          </Button>
          {!canUploadHeroImage ? <span className="muted-text">Uploads need R2 or Cloudflare Images.</span> : null}
        </div>
        <div className="content-asset-grid">
          {mediaAssets.map((asset) => (
            <button className="content-asset-option" key={asset.id} onClick={() => selectExistingImage(asset)} type="button">
              <NextImage src={asset.thumbnailUrl} alt={asset.alt} width={320} height={220} unoptimized />
              <span>{asset.filename}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal className="content-layer-modal" onClose={() => setActiveModal(null)} open={activeModal === "add"} title="Add asset">
        <div className="content-layer-options">
          {heroCanvasLayerElementTypes.map((type) => {
            const Icon = layerIcons[type];
            return (
              <button className="content-layer-option" key={type} onClick={() => addLayer(type)} type="button">
                <Icon size={18} aria-hidden="true" />
                <span>{heroElementLabel(type)}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </Card>
  );
}

function HeroDotGrid({
  activeLayout,
  motion
}: {
  activeLayout: HeroSlideEditor["elements"][HeroCanvasLayerElementType];
  motion: DragMotion;
}) {
  const activeBounds = {
    bottom: (activeLayout.gridRow - 1 + activeLayout.rowSpan) / HERO_GRID_ROWS,
    left: (activeLayout.gridColumn - 1) / HERO_GRID_COLUMNS,
    right: (activeLayout.gridColumn - 1 + activeLayout.columnSpan) / HERO_GRID_COLUMNS,
    top: (activeLayout.gridRow - 1) / HERO_GRID_ROWS
  };

  return (
    <div
      className="content-hero-dot-grid"
      style={{
        gridTemplateColumns: `repeat(${dotGridColumns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${dotGridRows}, minmax(0, 1fr))`
      }}
      aria-hidden="true"
    >
      {Array.from({ length: dotGridRows }).flatMap((_, rowIndex) =>
        Array.from({ length: dotGridColumns }).map((__, columnIndex) => {
          const x = (columnIndex + 0.5) / dotGridColumns;
          const y = (rowIndex + 0.5) / dotGridRows;
          const touched = x >= activeBounds.left && x <= activeBounds.right && y >= activeBounds.top && y <= activeBounds.bottom;
          const distance = Math.hypot(x - motion.x, y - motion.y);
          const proximity = Math.max(0, 1 - distance / 0.24);
          const speedFactor = Math.min(1, motion.speed / 1400);
          const pushX = ((x - motion.x) * 34 + motion.velocityX * 0.01) * proximity * (0.45 + speedFactor);
          const pushY = ((y - motion.y) * 34 + motion.velocityY * 0.01) * proximity * (0.45 + speedFactor);
          const glow = Math.min(1, proximity + (touched ? 0.36 : 0));
          const scale = 0.86 + (touched ? 0.48 : 0) + proximity * 1.18 + speedFactor * proximity * 0.4;
          const opacity = Math.min(0.96, 0.28 + proximity * 0.56 + (touched ? 0.24 : 0));
          const red = Math.round(226 - glow * 58);
          const green = Math.round(244 + glow * 11);
          const blue = Math.round(238 - glow * 157);

          return (
            <span
              className={[touched && "is-touched", proximity > 0.42 && "is-near"].filter(Boolean).join(" ")}
              key={`${columnIndex}-${rowIndex}`}
              style={{
                animationDelay: `${(columnIndex * 17 + rowIndex * 23) % 520}ms`,
                backgroundColor: `rgba(${red}, ${green}, ${blue}, ${opacity})`,
                boxShadow: `0 0 ${Math.round(4 + glow * 18)}px rgba(168, 255, 81, ${0.08 + glow * 0.34})`,
                opacity,
                transform: `translate(${pushX.toFixed(1)}px, ${pushY.toFixed(1)}px) scale(${scale.toFixed(2)})`
              }}
            />
          );
        })
      )}
    </div>
  );
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function HeroCanvasLayer({
  editing,
  layout,
  onEdit,
  onHide,
  onPointerDown,
  onSelect,
  onStopEditing,
  selected,
  slide,
  updateActiveSlideField
}: {
  editing: boolean;
  layout: HeroCanvasLayerElementLayout;
  onEdit: () => void;
  onHide: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onStopEditing: () => void;
  selected: boolean;
  slide: HeroSlideEditor;
  updateActiveSlideField: (field: "headline" | "caption" | "imageUrl" | "ctaLabel" | "ctaHref", value: string) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
      onEdit();
    }
  }

  return (
    <div
      aria-label={`${heroElementLabel(layout.type)} layer`}
      aria-pressed={selected}
      className={`content-canvas-layer content-canvas-layer-${layout.type.toLowerCase()}`}
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
      role="button"
      style={heroElementStyle(layout)}
      tabIndex={0}
    >
      {editing ? (
        <InlineLayerEditor
          layout={layout}
          onHide={onHide}
          onStopEditing={onStopEditing}
          slide={slide}
          updateActiveSlideField={updateActiveSlideField}
        />
      ) : (
        <LayerDisplay layout={layout} slide={slide} />
      )}
    </div>
  );
}

function LayerDisplay({ layout, slide }: { layout: HeroCanvasLayerElementLayout; slide: HeroSlideEditor }) {
  if (layout.type === "HEADLINE") return <strong>{slide.headline || "Hero title"}</strong>;
  if (layout.type === "CAPTION") return <span>{slide.caption || "Hero caption"}</span>;
  return <em>{slide.ctaLabel || "Book an appointment"}</em>;
}

function InlineLayerEditor({
  layout,
  onHide,
  onStopEditing,
  slide,
  updateActiveSlideField
}: {
  layout: HeroCanvasLayerElementLayout;
  onHide: () => void;
  onStopEditing: () => void;
  slide: HeroSlideEditor;
  updateActiveSlideField: (field: "headline" | "caption" | "imageUrl" | "ctaLabel" | "ctaHref", value: string) => void;
}) {
  return (
    <div className="content-inline-editor" onPointerDown={(event) => event.stopPropagation()}>
      <div className="content-inline-tools">
        <button aria-label="Remove asset" onClick={onHide} type="button">
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <button aria-label="Done editing" onClick={onStopEditing} type="button">
          <Check size={14} aria-hidden="true" />
        </button>
      </div>

      {layout.type === "HEADLINE" ? (
        <textarea
          aria-label="Title text"
          autoFocus
          className="content-inline-text content-inline-title"
          onChange={(event) => updateActiveSlideField("headline", event.target.value)}
          value={slide.headline}
        />
      ) : null}

      {layout.type === "CAPTION" ? (
        <textarea
          aria-label="Caption text"
          autoFocus
          className="content-inline-text content-inline-caption"
          onChange={(event) => updateActiveSlideField("caption", event.target.value)}
          value={slide.caption}
        />
      ) : null}

      {layout.type === "CTA" ? (
        <div className="content-inline-cta-editor">
          <input
            aria-label="Button label"
            autoFocus
            className="content-inline-cta-label"
            onChange={(event) => updateActiveSlideField("ctaLabel", event.target.value)}
            value={slide.ctaLabel}
          />
          <input
            aria-label="Button link"
            className="content-inline-cta-link"
            onChange={(event) => updateActiveSlideField("ctaHref", event.target.value)}
            value={slide.ctaHref}
          />
        </div>
      ) : null}
    </div>
  );
}

function heroElementStyle(layout: {
  type?: HeroElementType;
  gridColumn: number;
  gridRow: number;
  columnSpan: number;
  rowSpan: number;
  zIndex: number;
}): CSSProperties {
  return {
    gridColumn: `${layout.gridColumn} / span ${layout.columnSpan}`,
    gridRow: `${layout.gridRow} / span ${layout.rowSpan}`,
    zIndex: layout.zIndex
  };
}
