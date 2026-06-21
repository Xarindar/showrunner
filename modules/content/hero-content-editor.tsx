"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type Ref
} from "react";
import NextImage from "next/image";
import { Check, Image as ImageIcon, MousePointerClick, PanelTop, Plus, Save, Trash2, Type, Upload } from "lucide-react";
import { Button, Card, Modal, Tab, Tabs } from "@/components/ui";
import type { SiteSettingsWithModules } from "@/lib/site";
import {
  HERO_GRID_COLUMNS,
  HERO_GRID_ROWS,
  fitHeroElementLayoutToContent,
  heroCanvasLayerElementTypes,
  heroCanvasLayerElementsArray,
  heroElementLabel,
  serializeHeroPresentation,
  withUpdatedHeroElement,
  type HeroElementLayout,
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
  lastAssetX: number;
  lastAssetY: number;
  lastGridColumn: number;
  lastGridRow: number;
  lastTime: number;
  moved: boolean;
  pointerId: number;
  startGridColumn: number;
  startGridRow: number;
  startX: number;
  startY: number;
  type: HeroCanvasLayerElementType;
};

type DragMotion = {
  speed: number;
  velocityX: number;
  velocityY: number;
};

const dragThresholdPx = 6;
const dotGridColumns = HERO_GRID_COLUMNS;
const dotGridRows = HERO_GRID_ROWS;

const layerIcons: Record<HeroCanvasLayerElementType, typeof Type> = {
  HEADLINE: Type,
  CAPTION: PanelTop,
  CTA: MousePointerClick
};

export function HeroContentEditor({ action, canUploadHeroImage, initialPresentation, mediaAssets, settings }: HeroContentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerContentRefs = useRef<Record<HeroCanvasLayerElementType, HTMLDivElement | null>>({
    CAPTION: null,
    CTA: null,
    HEADLINE: null
  });
  const pointerInteractionRef = useRef<PointerInteraction | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState(() => ({
    ...initialPresentation,
    mode: initialPresentation.slides.length > 1 ? initialPresentation.mode : "STATIC"
  }));
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [dragMotion, setDragMotion] = useState<DragMotion | null>(null);
  const [blockedLayer, setBlockedLayer] = useState<HeroCanvasLayerElementType | null>(null);
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
      const openLayout = findOpenHeroLayout(nextSlide, type, nextSlide.elements[type]);
      const positionedSlide = withUpdatedHeroElement(nextSlide, type, openLayout);

      if (type === "HEADLINE" && !positionedSlide.headline) return { ...positionedSlide, headline: settings.heroHeadline || "Hero title" };
      if (type === "CAPTION" && !positionedSlide.caption) return { ...positionedSlide, caption: settings.heroSubheadline || "Hero caption" };
      if (type === "CTA" && !positionedSlide.ctaLabel) return { ...positionedSlide, ctaLabel: "Book an appointment", ctaHref: "/book" };
      return positionedSlide;
    });
    setBlockedLayer(null);
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

  function nudgeLayer(type: HeroCanvasLayerElementType, deltaColumn: number, deltaRow: number) {
    const layout = activeSlide.elements[type];
    moveLayerToLayout(type, {
      ...layout,
      gridColumn: layout.gridColumn + deltaColumn,
      gridRow: layout.gridRow + deltaRow
    }, layout);
  }

  function moveLayerToLayout(type: HeroCanvasLayerElementType, layout: HeroElementLayout, fromLayout?: HeroElementLayout) {
    const nextLayout = fitHeroElementLayoutToContent({
      ...layout,
      type
    });

    if (hasLayerCollision(type, nextLayout, fromLayout)) {
      setBlockedLayer(type);
      return null;
    }

    setBlockedLayer(null);
    updateActiveSlide((slide) => withUpdatedHeroElement(slide, type, nextLayout));
    return nextLayout;
  }

  function hasLayerCollision(type: HeroCanvasLayerElementType, layout: HeroElementLayout, fromLayout?: HeroElementLayout) {
    const nextLayout = fitHeroElementLayoutToContent({
      ...layout,
      type
    });

    if (!fromLayout) return hasLayerCollisionAt(type, nextLayout);

    const currentLayout = fitHeroElementLayoutToContent({
      ...fromLayout,
      type
    });
    const columnDelta = nextLayout.gridColumn - currentLayout.gridColumn;
    const rowDelta = nextLayout.gridRow - currentLayout.gridRow;
    const steps = Math.max(Math.abs(columnDelta), Math.abs(rowDelta), 1);
    const checkedSteps = new Set<string>();

    for (let step = 1; step <= steps; step += 1) {
      const gridColumn = currentLayout.gridColumn + Math.round((columnDelta * step) / steps);
      const gridRow = currentLayout.gridRow + Math.round((rowDelta * step) / steps);
      const stepKey = `${gridColumn}:${gridRow}`;
      if (checkedSteps.has(stepKey)) continue;
      checkedSteps.add(stepKey);

      if (
        hasLayerCollisionAt(type, {
          ...nextLayout,
          gridColumn,
          gridRow
        })
      ) {
        return true;
      }
    }

    return false;
  }

  function hasLayerCollisionAt(type: HeroCanvasLayerElementType, layout: HeroElementLayout) {
    return hasVisibleLayerCollision(type, layout);
  }

  function hasVisibleLayerCollision(type: HeroCanvasLayerElementType, layout: HeroElementLayout) {
    const stage = stageRef.current;
    const movingElement = layerContentRefs.current[type];
    if (!stage || !movingElement) return false;

    const movingRect = getCandidateContentRect(stage, movingElement, layout);
    if (!movingRect) return false;

    return heroCanvasLayerElementTypes.some((otherType) => {
      if (otherType === type) return false;

      const otherLayout = activeSlide.elements[otherType];
      const otherElement = layerContentRefs.current[otherType];
      if (!otherLayout?.isVisible || !otherElement) return false;

      return rectsOverlap(movingRect, otherElement.getBoundingClientRect());
    });
  }

  function updateLayerFromPointer(interaction: PointerInteraction, event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    const layout = activeSlide.elements[interaction.type];
    if (!stage || !layout) return null;

    const rect = stage.getBoundingClientRect();
    const columnDelta = Math.round(((event.clientX - interaction.startX) / rect.width) * HERO_GRID_COLUMNS);
    const rowDelta = Math.round(((event.clientY - interaction.startY) / rect.height) * HERO_GRID_ROWS);
    const nextLayout = {
      ...layout,
      gridColumn: interaction.startGridColumn + columnDelta,
      gridRow: interaction.startGridRow + rowDelta
    };

    return moveLayerToLayout(interaction.type, nextLayout, {
      ...layout,
      gridColumn: interaction.lastGridColumn,
      gridRow: interaction.lastGridRow
    });
  }

  function handleLayerPointerDown(type: HeroCanvasLayerElementType, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;

    const stage = stageRef.current;
    const layout = activeSlide.elements[type];
    if (!stage || !layout) return;

    const rect = stage.getBoundingClientRect();
    const assetCenter = heroLayoutCenter(layout);

    event.preventDefault();
    setSelectedLayer(type);
    setEditingLayer(null);
    pointerInteractionRef.current = {
      moved: false,
      lastAssetX: rect.left + assetCenter.x * rect.width,
      lastAssetY: rect.top + assetCenter.y * rect.height,
      lastGridColumn: layout.gridColumn,
      lastGridRow: layout.gridRow,
      lastTime: event.timeStamp,
      pointerId: event.pointerId,
      startGridColumn: layout.gridColumn,
      startGridRow: layout.gridRow,
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
      const nextLayout = updateLayerFromPointer(interaction, event);
      if (nextLayout) {
        interaction.lastGridColumn = nextLayout.gridColumn;
        interaction.lastGridRow = nextLayout.gridRow;
        updateDragMotion(interaction, event, nextLayout);
      }
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
    setBlockedLayer(null);
  }

  function updateDragMotion(
    interaction: PointerInteraction,
    event: PointerEvent<HTMLDivElement>,
    layout: HeroSlideEditor["elements"][HeroCanvasLayerElementType]
  ) {
    const stage = stageRef.current;
    if (!stage) return;

    const now = event.timeStamp;
    const elapsed = Math.max(16, now - interaction.lastTime);
    const rect = stage.getBoundingClientRect();
    const assetCenter = heroLayoutCenter(layout);
    const assetX = rect.left + assetCenter.x * rect.width;
    const assetY = rect.top + assetCenter.y * rect.height;
    const velocityX = ((assetX - interaction.lastAssetX) / elapsed) * 1000;
    const velocityY = ((assetY - interaction.lastAssetY) / elapsed) * 1000;

    interaction.lastTime = now;
    interaction.lastAssetX = assetX;
    interaction.lastAssetY = assetY;

    setDragMotion({
      speed: Math.min(3200, Math.hypot(velocityX, velocityY)),
      velocityX,
      velocityY
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
              onNudge={(deltaColumn, deltaRow) => nudgeLayer(layout.type, deltaColumn, deltaRow)}
              onPointerDown={(event) => handleLayerPointerDown(layout.type, event)}
              onRegisterContent={(node) => {
                layerContentRefs.current[layout.type] = node;
              }}
              onSelect={() => setSelectedLayer(layout.type)}
              onStopEditing={() => setEditingLayer(null)}
              blocked={blockedLayer === layout.type}
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
  const activeBounds = heroLayoutBounds(activeLayout);
  const activeCenter = heroLayoutCenter(activeLayout);

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
          const nearestX = clampValue(x, activeBounds.left, activeBounds.right);
          const nearestY = clampValue(y, activeBounds.top, activeBounds.bottom);
          const distance = touched ? 0 : Math.hypot(x - nearestX, y - nearestY);
          const proximity = Math.max(0, 1 - distance / 0.18);
          const speedFactor = Math.min(1, motion.speed / 1400);
          const directionX = touched ? x - activeCenter.x : x - nearestX;
          const directionY = touched ? y - activeCenter.y : y - nearestY;
          const directionLength = Math.hypot(directionX, directionY) || 1;
          const normalizedX = directionX / directionLength;
          const normalizedY = directionY / directionLength;
          const pushStrength = (touched ? 3.2 : 1.2 + proximity * 3.4) * proximity * (0.58 + speedFactor * 0.26);
          const pushX = normalizedX * pushStrength + motion.velocityX * 0.0016 * proximity * speedFactor;
          const pushY = normalizedY * pushStrength + motion.velocityY * 0.0016 * proximity * speedFactor;
          const glow = Math.min(1, proximity + (touched ? 0.2 : 0));
          const scale = 0.78 + (touched ? 0.22 : 0) + proximity * 0.34 + speedFactor * proximity * 0.08;
          const opacity = Math.min(0.44, 0.08 + proximity * 0.18 + (touched ? 0.14 : 0));
          const gray = Math.round(182 + glow * 42);
          const grayBlue = Math.round(188 + glow * 34);

          return (
            <span
              className={[touched && "is-touched", proximity > 0.42 && "is-near"].filter(Boolean).join(" ")}
              key={`${columnIndex}-${rowIndex}`}
              style={{
                animationDelay: `${(columnIndex * 17 + rowIndex * 23) % 520}ms`,
                backgroundColor: `rgb(${gray} ${grayBlue} ${grayBlue})`,
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

function heroLayoutBounds(layout: { gridColumn: number; gridRow: number; columnSpan: number; rowSpan: number }) {
  return {
    bottom: (layout.gridRow - 1 + layout.rowSpan) / HERO_GRID_ROWS,
    left: (layout.gridColumn - 1) / HERO_GRID_COLUMNS,
    right: (layout.gridColumn - 1 + layout.columnSpan) / HERO_GRID_COLUMNS,
    top: (layout.gridRow - 1) / HERO_GRID_ROWS
  };
}

function heroLayoutCenter(layout: { gridColumn: number; gridRow: number; columnSpan: number; rowSpan: number }) {
  const bounds = heroLayoutBounds(layout);
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  };
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCandidateContentRect(stage: HTMLDivElement, contentElement: HTMLElement, layout: HeroElementLayout) {
  const gridRect = getCandidateGridRect(stage, layout);
  const contentRect = contentElement.getBoundingClientRect();
  if (!contentRect.width || !contentRect.height) return null;

  const isAtRightEdge = layout.gridColumn + layout.columnSpan > HERO_GRID_COLUMNS;
  const left = isAtRightEdge ? gridRect.right - contentRect.width : gridRect.left;
  const top = layout.type === "HEADLINE" ? gridRect.bottom - contentRect.height : gridRect.top;

  return {
    bottom: top + contentRect.height,
    left,
    right: left + contentRect.width,
    top
  };
}

function getCandidateGridRect(stage: HTMLDivElement, layout: HeroElementLayout) {
  const stageRect = stage.getBoundingClientRect();
  const styles = window.getComputedStyle(stage);
  const borderLeft = cssPixelValue(styles.borderLeftWidth);
  const borderTop = cssPixelValue(styles.borderTopWidth);
  const paddingLeft = cssPixelValue(styles.paddingLeft);
  const paddingRight = cssPixelValue(styles.paddingRight);
  const paddingTop = cssPixelValue(styles.paddingTop);
  const paddingBottom = cssPixelValue(styles.paddingBottom);
  const columnGap = cssPixelValue(styles.columnGap);
  const rowGap = cssPixelValue(styles.rowGap);
  const gridLeft = stageRect.left + borderLeft + paddingLeft;
  const gridTop = stageRect.top + borderTop + paddingTop;
  const gridWidth = stage.clientWidth - paddingLeft - paddingRight;
  const gridHeight = stage.clientHeight - paddingTop - paddingBottom;
  const cellWidth = (gridWidth - (HERO_GRID_COLUMNS - 1) * columnGap) / HERO_GRID_COLUMNS;
  const cellHeight = (gridHeight - (HERO_GRID_ROWS - 1) * rowGap) / HERO_GRID_ROWS;
  const left = gridLeft + (layout.gridColumn - 1) * (cellWidth + columnGap);
  const top = gridTop + (layout.gridRow - 1) * (cellHeight + rowGap);
  const width = layout.columnSpan * cellWidth + (layout.columnSpan - 1) * columnGap;
  const height = layout.rowSpan * cellHeight + (layout.rowSpan - 1) * rowGap;

  return {
    bottom: top + height,
    left,
    right: left + width,
    top
  };
}

function rectsOverlap(
  first: Pick<DOMRectReadOnly, "bottom" | "left" | "right" | "top">,
  second: Pick<DOMRectReadOnly, "bottom" | "left" | "right" | "top">
) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function cssPixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findOpenHeroLayout(slide: HeroSlideEditor, type: HeroCanvasLayerElementType, preferredLayout: HeroElementLayout) {
  const preferred = fitHeroElementLayoutToContent({
    ...preferredLayout,
    type
  });
  if (!hasHeroLayerCollision(slide, type, preferred)) return preferred;

  const maxColumn = HERO_GRID_COLUMNS - preferred.columnSpan + 1;
  const maxRow = HERO_GRID_ROWS - preferred.rowSpan + 1;
  let bestLayout: HeroElementLayout | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let row = 1; row <= maxRow; row += 1) {
    for (let column = 1; column <= maxColumn; column += 1) {
      const candidate = { ...preferred, gridColumn: column, gridRow: row };
      if (hasHeroLayerCollision(slide, type, candidate)) continue;

      const distance = Math.hypot(column - preferred.gridColumn, row - preferred.gridRow);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestLayout = candidate;
      }
    }
  }

  return bestLayout || preferred;
}

function hasHeroLayerCollision(slide: HeroSlideEditor, type: HeroCanvasLayerElementType, layout: HeroElementLayout) {
  const safeLayout = fitHeroElementLayoutToContent({
    ...layout,
    type
  });

  return heroCanvasLayerElementsArray(slide.elements).some((otherLayout) => {
    if (otherLayout.type === type || !otherLayout.isVisible) return false;
    return heroLayoutsOverlap(
      safeLayout,
      fitHeroElementLayoutToContent({
        ...otherLayout,
        type: otherLayout.type
      })
    );
  });
}

function heroLayoutsOverlap(
  first: Pick<HeroElementLayout, "gridColumn" | "gridRow" | "columnSpan" | "rowSpan">,
  second: Pick<HeroElementLayout, "gridColumn" | "gridRow" | "columnSpan" | "rowSpan">
) {
  const firstRight = first.gridColumn + first.columnSpan;
  const secondRight = second.gridColumn + second.columnSpan;
  const firstBottom = first.gridRow + first.rowSpan;
  const secondBottom = second.gridRow + second.rowSpan;

  return first.gridColumn < secondRight && firstRight > second.gridColumn && first.gridRow < secondBottom && firstBottom > second.gridRow;
}

function HeroCanvasLayer({
  blocked,
  editing,
  layout,
  onEdit,
  onHide,
  onNudge,
  onPointerDown,
  onRegisterContent,
  onSelect,
  onStopEditing,
  selected,
  slide,
  updateActiveSlideField
}: {
  blocked: boolean;
  editing: boolean;
  layout: HeroCanvasLayerElementLayout;
  onEdit: () => void;
  onHide: () => void;
  onNudge: (deltaColumn: number, deltaRow: number) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onRegisterContent: (node: HTMLDivElement | null) => void;
  onSelect: () => void;
  onStopEditing: () => void;
  selected: boolean;
  slide: HeroSlideEditor;
  updateActiveSlideField: (field: "headline" | "caption" | "imageUrl" | "ctaLabel" | "ctaHref", value: string) => void;
}) {
  const isAtRightEdge = layout.gridColumn + layout.columnSpan > HERO_GRID_COLUMNS;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onSelect();

      if (event.key === "ArrowLeft") onNudge(-1, 0);
      if (event.key === "ArrowRight") onNudge(1, 0);
      if (event.key === "ArrowUp") onNudge(0, -1);
      if (event.key === "ArrowDown") onNudge(0, 1);
      return;
    }

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
      data-blocked={blocked}
      data-edge-x={isAtRightEdge ? "right" : undefined}
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
      role="button"
      style={heroElementStyle(layout)}
      tabIndex={0}
    >
      <LayerContentFrame
        editing={editing}
        layout={layout}
        onHide={onHide}
        onRegisterContent={onRegisterContent}
        onStopEditing={onStopEditing}
        slide={slide}
        updateActiveSlideField={updateActiveSlideField}
      />
    </div>
  );
}

function LayerContentFrame({
  editing,
  layout,
  onHide,
  onRegisterContent,
  onStopEditing,
  slide,
  updateActiveSlideField
}: {
  editing: boolean;
  layout: HeroCanvasLayerElementLayout;
  onHide: () => void;
  onRegisterContent: (node: HTMLDivElement | null) => void;
  onStopEditing: () => void;
  slide: HeroSlideEditor;
  updateActiveSlideField: (field: "headline" | "caption" | "imageUrl" | "ctaLabel" | "ctaHref", value: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLElement>(null);
  const headlineText = slide.headline || "Hero title";

  function setContentRef(node: HTMLDivElement | null) {
    contentRef.current = node;
    onRegisterContent(node);
  }

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (layout.type !== "HEADLINE") {
      content.style.width = "";
      return;
    }

    const headline = headlineRef.current;
    if (!headline) return;

    const previousWidth = content.style.width;
    content.style.width = "fit-content";

    const range = document.createRange();
    range.selectNodeContents(headline);
    const lineWidths = Array.from(range.getClientRects())
      .map((rect) => rect.width)
      .filter((width) => width > 0);
    range.detach();

    const styles = window.getComputedStyle(content);
    const horizontalInset =
      parseFloat(styles.paddingLeft) +
      parseFloat(styles.paddingRight) +
      parseFloat(styles.borderLeftWidth) +
      parseFloat(styles.borderRightWidth);
    const nextWidth = lineWidths.length ? Math.ceil(Math.max(...lineWidths) + horizontalInset) : null;

    content.style.width = nextWidth ? `${nextWidth}px` : previousWidth;
  }, [headlineText, layout.columnSpan, layout.rowSpan, layout.type]);

  return (
    <div className="content-canvas-content" data-editing={editing} ref={setContentRef}>
      {editing ? (
        <>
          <LayerDisplayContent className="content-editor-size-proxy" headlineRef={headlineRef} layout={layout} slide={slide} />
          <InlineLayerEditor
            layout={layout}
            onHide={onHide}
            onStopEditing={onStopEditing}
            slide={slide}
            updateActiveSlideField={updateActiveSlideField}
          />
        </>
      ) : (
        <LayerDisplayContent headlineRef={headlineRef} layout={layout} slide={slide} />
      )}
    </div>
  );
}

function LayerDisplayContent({
  className,
  headlineRef,
  layout,
  slide
}: {
  className?: string;
  headlineRef?: Ref<HTMLElement>;
  layout: HeroCanvasLayerElementLayout;
  slide: HeroSlideEditor;
}) {
  if (layout.type === "HEADLINE") {
    return (
      <strong className={className} ref={headlineRef}>
        {slide.headline || "Hero title"}
      </strong>
    );
  }

  if (layout.type === "CAPTION") return <span className={className}>{slide.caption || "Hero caption"}</span>;
  return <em className={className}>{slide.ctaLabel || "Book an appointment"}</em>;
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
