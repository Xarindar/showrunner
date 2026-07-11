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
import { Check, Image as ImageIcon, MousePointerClick, PanelTop, Plus, Save, Timer, Trash2, Type } from "lucide-react";
import { AssetPicker, Button, Card, Modal, Tab, Tabs, type AssetPickerAsset } from "@/components/ui";
import type { SiteSettingsWithModules } from "@/lib/site";
import {
  HERO_GRID_COLUMNS,
  HERO_GRID_ROWS,
  createHeroSlideCopy,
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

type HeroContentEditorProps = {
  action: ContentAction;
  canUploadHeroImage: boolean;
  initialPresentation: HeroPresentationEditor;
  mediaAssets: AssetPickerAsset[];
  profileKey?: string;
  settings: ContentSettingsDraft;
};

type ActiveModal = "add" | null;

type Rect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type GridGeometry = {
  cellHeight: number;
  cellWidth: number;
  columnGap: number;
  gridHeight: number;
  gridLeft: number;
  gridTop: number;
  gridWidth: number;
  originX: number;
  originY: number;
  rowGap: number;
};

// Everything the drag/keyboard logic needs to place a move without touching
// the DOM again mid-gesture: stage geometry, the moving asset's rendered size,
// and the rendered boxes of the other visible assets (used for alignment
// guides and to keep assets from overlapping each other).
type LayerDragContext = {
  colSpan: number;
  contentHeight: number;
  contentWidth: number;
  geometry: GridGeometry;
  rowSpan: number;
  siblings: Rect[];
  type: HeroCanvasLayerElementType;
};

type PointerInteraction = {
  committedColumn: number;
  committedRow: number;
  context: LayerDragContext;
  lastAssetX: number;
  lastAssetY: number;
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

type AlignmentGuide = {
  emphasis: boolean;
  end: number;
  id: string;
  offset: number;
  orientation: "horizontal" | "vertical";
  start: number;
};

const dragThresholdPx = 6;
const coarseNudgeCells = 3;
const alignmentTolerancePx = 4;
const dotGridColumns = HERO_GRID_COLUMNS;
const dotGridRows = HERO_GRID_ROWS;
const minAutoplaySeconds = 2.5;
const maxAutoplaySeconds = 20;

const layerIcons: Record<HeroCanvasLayerElementType, typeof Type> = {
  HEADLINE: Type,
  CAPTION: PanelTop,
  CTA: MousePointerClick
};

function formatAutoplaySeconds(milliseconds: number) {
  return String(Math.round((milliseconds / 1000) * 10) / 10);
}

export function HeroContentEditor({ action, canUploadHeroImage, initialPresentation, mediaAssets, profileKey, settings }: HeroContentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerContentRefs = useRef<Record<HeroCanvasLayerElementType, HTMLDivElement | null>>({
    CAPTION: null,
    CTA: null,
    HEADLINE: null
  });
  const pointerInteractionRef = useRef<PointerInteraction | null>(null);
  const blockedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layerPlaneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState(() => ({
    ...initialPresentation,
    mode: initialPresentation.slides.length > 1 ? initialPresentation.mode : "STATIC"
  }));
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [dragMotion, setDragMotion] = useState<DragMotion | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [blockedLayer, setBlockedLayer] = useState<HeroCanvasLayerElementType | null>(null);
  const [draggingLayer, setDraggingLayer] = useState<HeroCanvasLayerElementType | null>(null);
  const [editingLayer, setEditingLayer] = useState<HeroCanvasLayerElementType | null>(null);
  const [autoplaySecondsDraft, setAutoplaySecondsDraft] = useState(() => formatAutoplaySeconds(initialPresentation.autoplayIntervalMs));
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

  useEffect(() => {
    return () => {
      if (blockedTimeoutRef.current) clearTimeout(blockedTimeoutRef.current);
    };
  }, []);

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

  function updateAutoplaySeconds(value: string) {
    setAutoplaySecondsDraft(value);
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < minAutoplaySeconds || seconds > maxAutoplaySeconds) return;

    setPresentation((current) => ({
      ...current,
      autoplayIntervalMs: Math.round(seconds * 1000)
    }));
  }

  function commitAutoplaySeconds() {
    const seconds = Number(autoplaySecondsDraft);
    const clampedSeconds = Number.isFinite(seconds) ? clampValue(seconds, minAutoplaySeconds, maxAutoplaySeconds) : 6.5;

    setAutoplaySecondsDraft(String(clampedSeconds));
    setPresentation((current) => ({
      ...current,
      autoplayIntervalMs: Math.round(clampedSeconds * 1000)
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
    clearBlocked();
    setSelectedLayer(type);
    setEditingLayer(null);
    setActiveModal(null);
  }

  function addSlide() {
    const nextIndex = presentation.slides.length;
    setPresentation((current) => {
      const sourceSlide = current.slides[activeIndex] || current.slides[0];
      const slide = createHeroSlideCopy(sourceSlide, current.slides.length);

      return {
        ...current,
        mode: "SLIDESHOW",
        slides: [...current.slides, slide]
      };
    });
    setActiveIndex(nextIndex);
    setSelectedLayer("HEADLINE");
    setEditingLayer(null);
    clearBlocked();
    setActiveModal(null);
    setAssetPickerOpen(true);
  }

  function hideLayer(type: HeroCanvasLayerElementType) {
    updateActiveSlide((slide) => withUpdatedHeroElement(slide, type, { isVisible: false }));
    setEditingLayer(null);
  }

  function selectExistingImage(asset: AssetPickerAsset) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingUploadName("");
    setPreviewImageUrl("");
    updateActiveSlideField("imageUrl", asset.url || asset.thumbnailUrl);
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

  function clearBlocked() {
    if (blockedTimeoutRef.current) clearTimeout(blockedTimeoutRef.current);
    setBlockedLayer(null);
  }

  function flashBlocked(type: HeroCanvasLayerElementType) {
    if (blockedTimeoutRef.current) clearTimeout(blockedTimeoutRef.current);
    setBlockedLayer(type);
    blockedTimeoutRef.current = setTimeout(() => setBlockedLayer(null), 220);
  }

  function commitLayerPosition(type: HeroCanvasLayerElementType, gridColumn: number, gridRow: number) {
    updateActiveSlide((slide) => withUpdatedHeroElement(slide, type, { gridColumn, gridRow }));
  }

  // Keyboard nudges walk cell by cell and stop at the image edge or just
  // before another asset's visible box, flashing when there is nowhere to go.
  function nudgeLayer(type: HeroCanvasLayerElementType, deltaColumn: number, deltaRow: number) {
    const layerPlane = layerPlaneRef.current;
    const layout = activeSlide.elements[type];
    const context = layerPlane ? buildDragContext(layerPlane, type, layout) : null;

    if (!context) {
      commitLayerPosition(type, layout.gridColumn + deltaColumn, layout.gridRow + deltaRow);
      return;
    }

    const stepColumn = Math.sign(deltaColumn);
    const stepRow = Math.sign(deltaRow);
    const steps = Math.max(Math.abs(deltaColumn), Math.abs(deltaRow));
    let gridColumn = layout.gridColumn;
    let gridRow = layout.gridRow;

    for (let step = 0; step < steps; step += 1) {
      const nextColumn = clampColumnToContent(context, gridColumn + stepColumn);
      const nextRow = clampRowToContent(context, gridRow + stepRow);
      if (nextColumn === gridColumn && nextRow === gridRow) break;
      if (collidesWithSiblings(context, nextColumn, nextRow)) break;
      gridColumn = nextColumn;
      gridRow = nextRow;
    }

    if (gridColumn === layout.gridColumn && gridRow === layout.gridRow) {
      flashBlocked(type);
      return;
    }

    clearBlocked();
    commitLayerPosition(type, gridColumn, gridRow);
  }

  function handleLayerPointerDown(type: HeroCanvasLayerElementType, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;

    const stage = stageRef.current;
    const layerPlane = layerPlaneRef.current;
    const layout = activeSlide.elements[type];
    if (!stage || !layerPlane || !layout) return;

    const context = buildDragContext(layerPlane, type, layout);
    if (!context) return;

    const assetCenter = heroLayoutCenter(layout);
    const planeRect = layerPlane.getBoundingClientRect();

    event.preventDefault();
    setSelectedLayer(type);
    setEditingLayer(null);
    clearBlocked();
    pointerInteractionRef.current = {
      committedColumn: layout.gridColumn,
      committedRow: layout.gridRow,
      context,
      lastAssetX: planeRect.left + assetCenter.x * planeRect.width,
      lastAssetY: planeRect.top + assetCenter.y * planeRect.height,
      lastTime: event.timeStamp,
      moved: false,
      pointerId: event.pointerId,
      startGridColumn: layout.gridColumn,
      startGridRow: layout.gridRow,
      startX: event.clientX,
      startY: event.clientY,
      type
    };
    stage.setPointerCapture(event.pointerId);
  }

  function handleStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = pointerInteractionRef.current;
    if (!interaction || event.pointerId !== interaction.pointerId) return;

    const distance = Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY);
    if (!interaction.moved && distance > dragThresholdPx) {
      interaction.moved = true;
      setDraggingLayer(interaction.type);
    }

    if (!interaction.moved) return;

    const { context } = interaction;
    const columnStride = context.geometry.cellWidth + context.geometry.columnGap;
    const rowStride = context.geometry.cellHeight + context.geometry.rowGap;
    const columnDelta = columnStride > 0 ? Math.round((event.clientX - interaction.startX) / columnStride) : 0;
    const rowDelta = rowStride > 0 ? Math.round((event.clientY - interaction.startY) / rowStride) : 0;

    // Assets follow the cursor but never overlap each other: the clamps stop
    // them at the image edges and resolveDragPosition stops them (or slides
    // them along one axis) when they meet another asset's visible box.
    const targetColumn = clampColumnToContent(context, interaction.startGridColumn + columnDelta);
    const targetRow = clampRowToContent(context, interaction.startGridRow + rowDelta);
    const { gridColumn: nextColumn, gridRow: nextRow } = resolveDragPosition(
      context,
      interaction.committedColumn,
      interaction.committedRow,
      targetColumn,
      targetRow
    );

    if (nextColumn !== interaction.committedColumn || nextRow !== interaction.committedRow) {
      interaction.committedColumn = nextColumn;
      interaction.committedRow = nextRow;
      commitLayerPosition(context.type, nextColumn, nextRow);
      updateDragMotion(interaction, event, { columnSpan: context.colSpan, gridColumn: nextColumn, gridRow: nextRow, rowSpan: context.rowSpan });
    }

    const nextGuides = computeAlignmentGuides(context, nextColumn, nextRow);
    setAlignmentGuides((previous) => (sameGuides(previous, nextGuides) ? previous : nextGuides));
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
    setAlignmentGuides([]);
    clearBlocked();
  }

  function updateDragMotion(
    interaction: PointerInteraction,
    event: PointerEvent<HTMLDivElement>,
    layout: { columnSpan: number; gridColumn: number; gridRow: number; rowSpan: number }
  ) {
    const layerPlane = layerPlaneRef.current;
    if (!layerPlane) return;

    const now = event.timeStamp;
    const elapsed = Math.max(16, now - interaction.lastTime);
    const rect = layerPlane.getBoundingClientRect();
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

  function buildDragContext(
    stage: HTMLDivElement,
    type: HeroCanvasLayerElementType,
    layout: HeroElementLayout
  ): LayerDragContext | null {
    const movingElement = layerContentRefs.current[type];
    if (!movingElement) return null;

    const movingRect = movingElement.getBoundingClientRect();
    if (!movingRect.width || !movingRect.height) return null;

    const siblings = heroCanvasLayerElementTypes.flatMap((otherType) => {
      if (otherType === type) return [];
      const otherLayout = activeSlide.elements[otherType];
      const otherElement = layerContentRefs.current[otherType];
      if (!otherLayout?.isVisible || !otherElement) return [];

      const rect = otherElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      return [{ bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }];
    });

    return {
      colSpan: layout.columnSpan,
      contentHeight: movingRect.height,
      contentWidth: movingRect.width,
      geometry: readGridGeometry(stage),
      rowSpan: layout.rowSpan,
      siblings,
      type
    };
  }

  function computeAlignmentGuides(context: LayerDragContext, gridColumn: number, gridRow: number): AlignmentGuide[] {
    const { geometry } = context;
    const moving = contentRectFromGeometry(context, gridColumn, gridRow);
    const movingX = [moving.left, (moving.left + moving.right) / 2, moving.right];
    const movingY = [moving.top, (moving.top + moving.bottom) / 2, moving.bottom];
    const movingCenterX = (moving.left + moving.right) / 2;
    const movingCenterY = (moving.top + moving.bottom) / 2;
    const stageCenterX = geometry.gridLeft + geometry.gridWidth / 2;
    const stageCenterY = geometry.gridTop + geometry.gridHeight / 2;

    // Keep only the single nearest snap per axis and draw it as one full-length
    // ruler line, instead of stacking a bar for every near match across the
    // widest asset. The stage centerline (emphasized) only catches the moving
    // center; each sibling edge/center can catch any moving edge or center.
    const verticalSnap = pickNearestSnap([
      snapCandidate(stageCenterX, true, [movingCenterX]),
      ...context.siblings.flatMap((sibling) => [
        snapCandidate(sibling.left, false, movingX),
        snapCandidate((sibling.left + sibling.right) / 2, false, movingX),
        snapCandidate(sibling.right, false, movingX)
      ])
    ]);
    const horizontalSnap = pickNearestSnap([
      snapCandidate(stageCenterY, true, [movingCenterY]),
      ...context.siblings.flatMap((sibling) => [
        snapCandidate(sibling.top, false, movingY),
        snapCandidate((sibling.top + sibling.bottom) / 2, false, movingY),
        snapCandidate(sibling.bottom, false, movingY)
      ])
    ]);

    const guides: AlignmentGuide[] = [];
    if (verticalSnap) {
      guides.push({
        emphasis: verticalSnap.emphasis,
        end: geometry.gridTop + geometry.gridHeight - geometry.originY,
        id: "v",
        offset: verticalSnap.value - geometry.originX,
        orientation: "vertical",
        start: geometry.gridTop - geometry.originY
      });
    }
    if (horizontalSnap) {
      guides.push({
        emphasis: horizontalSnap.emphasis,
        end: geometry.gridLeft + geometry.gridWidth - geometry.originX,
        id: "h",
        offset: horizontalSnap.value - geometry.originY,
        orientation: "horizontal",
        start: geometry.gridLeft - geometry.originX
      });
    }

    return guides;
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
        {showScreenTabs ? (
          <label className="content-slide-timing">
            <Timer size={15} aria-hidden="true" />
            <span>Slide time</span>
            <input
              aria-label="Slide time in seconds"
              max={20}
              min={2.5}
              onBlur={commitAutoplaySeconds}
              onChange={(event) => updateAutoplaySeconds(event.target.value)}
              step={0.5}
              type="number"
              value={autoplaySecondsDraft}
            />
            <span>s</span>
          </label>
        ) : null}
        <AssetPicker
          assets={mediaAssets}
          canUpload={canUploadHeroImage}
          confirmLabel="Use hero image"
          onOpenChange={setAssetPickerOpen}
          onSelectAsset={selectExistingImage}
          onUploadRequest={triggerUploadPicker}
          open={assetPickerOpen}
          title="Hero image"
          triggerClassName="ui-button ui-button-secondary ui-button-sm">
          <ImageIcon size={16} aria-hidden="true" />
          Image
        </AssetPicker>
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
      minHeight="none"
      reservedHeader={editorToolbar}
    >
      <input name="heroPresentation" type="hidden" value={serializedPresentation} readOnly />
      <input name="activeHeroSlideIndex" type="hidden" value={activeIndex} readOnly />
      {profileKey ? <input name="profileKey" type="hidden" value={profileKey} readOnly /> : null}
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
          <div className="content-hero-layer-plane" ref={layerPlaneRef}>
            {draggedLayout && dragMotion ? <HeroDotGrid activeLayout={draggedLayout} motion={dragMotion} /> : null}
            {draggingLayer && alignmentGuides.length ? <HeroAlignmentGuides guides={alignmentGuides} /> : null}
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
                dragging={draggingLayer === layout.type}
                selected={selectedLayer === layout.type}
                slide={activeSlide}
                updateActiveSlideField={updateActiveSlideField}
              />
            ))}
          </div>
        </div>
        <p className="content-hero-hint" aria-hidden="true">
          Drag assets to position them — they stop at the image edges and slide around each other instead of overlapping. Use arrow keys
          to nudge, Shift + arrows for bigger steps.
        </p>
      </section>

      <Modal className="content-layer-modal" onClose={() => setActiveModal(null)} open={activeModal === "add"} title="Add asset">
        <div className="content-layer-options">
          <button className="content-layer-option" onClick={addSlide} type="button">
            <ImageIcon size={18} aria-hidden="true" />
            <span>Slide</span>
          </button>
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

function HeroAlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  return (
    <div className="content-hero-guides" aria-hidden="true">
      {guides.map((guide) => (
        <span
          className="content-hero-guide"
          data-emphasis={guide.emphasis}
          data-orientation={guide.orientation}
          key={guide.id}
          style={
            guide.orientation === "vertical"
              ? { left: `${guide.offset}px`, top: `${guide.start}px`, height: `${Math.max(0, guide.end - guide.start)}px` }
              : { top: `${guide.offset}px`, left: `${guide.start}px`, width: `${Math.max(0, guide.end - guide.start)}px` }
          }
        />
      ))}
    </div>
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

// Stage layout measured once per gesture. originX/originY map viewport
// coordinates into stage-relative coordinates for drawing alignment guides.
function readGridGeometry(stage: HTMLDivElement): GridGeometry {
  const rect = stage.getBoundingClientRect();
  const styles = window.getComputedStyle(stage);
  const borderLeft = cssPixelValue(styles.borderLeftWidth);
  const borderTop = cssPixelValue(styles.borderTopWidth);
  const paddingLeft = cssPixelValue(styles.paddingLeft);
  const paddingRight = cssPixelValue(styles.paddingRight);
  const paddingTop = cssPixelValue(styles.paddingTop);
  const paddingBottom = cssPixelValue(styles.paddingBottom);
  const columnGap = cssPixelValue(styles.columnGap);
  const rowGap = cssPixelValue(styles.rowGap);
  const gridLeft = rect.left + borderLeft + paddingLeft;
  const gridTop = rect.top + borderTop + paddingTop;
  const gridWidth = stage.clientWidth - paddingLeft - paddingRight;
  const gridHeight = stage.clientHeight - paddingTop - paddingBottom;

  return {
    cellHeight: (gridHeight - (HERO_GRID_ROWS - 1) * rowGap) / HERO_GRID_ROWS,
    cellWidth: (gridWidth - (HERO_GRID_COLUMNS - 1) * columnGap) / HERO_GRID_COLUMNS,
    columnGap,
    gridHeight,
    gridLeft,
    gridTop,
    gridWidth,
    originX: rect.left + borderLeft,
    originY: rect.top + borderTop,
    rowGap
  };
}

function footprintRectFromGeometry(geometry: GridGeometry, gridColumn: number, gridRow: number, colSpan: number, rowSpan: number): Rect {
  const left = geometry.gridLeft + (gridColumn - 1) * (geometry.cellWidth + geometry.columnGap);
  const top = geometry.gridTop + (gridRow - 1) * (geometry.cellHeight + geometry.rowGap);
  const width = colSpan * geometry.cellWidth + (colSpan - 1) * geometry.columnGap;
  const height = rowSpan * geometry.cellHeight + (rowSpan - 1) * geometry.rowGap;

  return { bottom: top + height, left, right: left + width, top };
}

// The visible box, anchored inside its footprint the same way the CSS renders
// it: top-left of the footprint. The visible content can be taller/narrower
// than the footprint, and the clamps below keep that box inside the stage.
function contentRectFromGeometry(context: LayerDragContext, gridColumn: number, gridRow: number): Rect {
  const footprint = footprintRectFromGeometry(context.geometry, gridColumn, gridRow, context.colSpan, context.rowSpan);
  const left = footprint.left;
  const top = footprint.top;

  return { bottom: top + context.contentHeight, left, right: left + context.contentWidth, top };
}

// Largest column whose visible box still fits inside the stage on the right.
// Only the rendered content limits movement — the reserved footprint shrinks
// at the edge (see fitHeroElementLayoutToContent), so a short headline or
// button can sit flush against the right side of the image.
function clampColumnToContent(context: LayerDragContext, gridColumn: number) {
  const { geometry } = context;
  const stride = geometry.cellWidth + geometry.columnGap;
  if (stride <= 0) return clampInteger(gridColumn, 1, HERO_GRID_COLUMNS);

  const contentMax = Math.floor(1 + (geometry.gridWidth - context.contentWidth) / stride + 1e-3);
  return clampInteger(gridColumn, 1, Math.max(1, Math.min(HERO_GRID_COLUMNS, contentMax)));
}

// Largest row whose visible box still fits inside the stage at the bottom.
// Content is top-anchored, so row 1 always reaches the top and content grows
// downward until it hits the bottom edge.
function clampRowToContent(context: LayerDragContext, gridRow: number) {
  const { geometry } = context;
  const stride = geometry.cellHeight + geometry.rowGap;
  if (stride <= 0) return clampInteger(gridRow, 1, HERO_GRID_ROWS);

  const contentMax = Math.floor(1 + (geometry.gridHeight - context.contentHeight) / stride + 1e-3);
  return clampInteger(gridRow, 1, Math.max(1, Math.min(HERO_GRID_ROWS, contentMax)));
}

// Visible boxes may touch but never overlap; the small tolerance lets edges
// sit flush without counting as a collision.
function rectsOverlap(first: Rect, second: Rect) {
  const tolerance = 2;
  return (
    first.left < second.right - tolerance &&
    first.right > second.left + tolerance &&
    first.top < second.bottom - tolerance &&
    first.bottom > second.top + tolerance
  );
}

function collidesWithSiblings(context: LayerDragContext, gridColumn: number, gridRow: number) {
  const moving = contentRectFromGeometry(context, gridColumn, gridRow);
  return context.siblings.some((sibling) => rectsOverlap(moving, sibling));
}

// Where the drag actually lands: the target cell when it is clear, otherwise
// slide along whichever single axis stays clear, otherwise hold position.
function resolveDragPosition(
  context: LayerDragContext,
  currentColumn: number,
  currentRow: number,
  targetColumn: number,
  targetRow: number
) {
  if (!collidesWithSiblings(context, targetColumn, targetRow)) {
    return { gridColumn: targetColumn, gridRow: targetRow };
  }
  if (targetColumn !== currentColumn && !collidesWithSiblings(context, targetColumn, currentRow)) {
    return { gridColumn: targetColumn, gridRow: currentRow };
  }
  if (targetRow !== currentRow && !collidesWithSiblings(context, currentColumn, targetRow)) {
    return { gridColumn: currentColumn, gridRow: targetRow };
  }
  return { gridColumn: currentColumn, gridRow: currentRow };
}

type SnapCandidate = { delta: number; emphasis: boolean; value: number };

// Distance from the nearest moving anchor to a candidate snap line.
function snapCandidate(value: number, emphasis: boolean, movingAnchors: number[]): SnapCandidate {
  let delta = Number.POSITIVE_INFINITY;
  for (const anchor of movingAnchors) delta = Math.min(delta, Math.abs(anchor - value));
  return { delta, emphasis, value };
}

// Closest in-tolerance snap, preferring the emphasized stage centerline on ties.
function pickNearestSnap(candidates: SnapCandidate[]): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.delta > alignmentTolerancePx) continue;
    if (!best || candidate.delta < best.delta || (candidate.delta === best.delta && candidate.emphasis && !best.emphasis)) {
      best = candidate;
    }
  }
  return best;
}

function sameGuides(first: AlignmentGuide[], second: AlignmentGuide[]) {
  if (first.length !== second.length) return false;
  return first.every((guide, index) => {
    const other = second[index];
    return (
      guide.id === other.id &&
      guide.emphasis === other.emphasis &&
      Math.round(guide.offset) === Math.round(other.offset) &&
      Math.round(guide.start) === Math.round(other.start) &&
      Math.round(guide.end) === Math.round(other.end)
    );
  });
}

function cssPixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampInteger(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
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
  dragging,
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
  dragging: boolean;
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
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".content-inline-editor")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onSelect();

      const step = event.shiftKey ? coarseNudgeCells : 1;
      if (event.key === "ArrowLeft") onNudge(-step, 0);
      if (event.key === "ArrowRight") onNudge(step, 0);
      if (event.key === "ArrowUp") onNudge(0, -step);
      if (event.key === "ArrowDown") onNudge(0, step);
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
      data-dragging={dragging}
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

  // Size the headline box to its longest natural line so the selection outline
  // hugs the text, while max-width:100% (CSS) still forces wrapping before it
  // can run past the stage edge. Re-measure after web fonts load and whenever
  // the layer width changes; otherwise the fallback-font width can be frozen
  // into the inline style and make the final font wrap until editing begins.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (layout.type !== "HEADLINE" || editing) {
      content.style.width = "";
      return;
    }

    const headline = headlineRef.current;
    if (!headline) return;
    const contentElement = content;
    const headlineElement = headline;

    let cancelled = false;
    let animationFrame = 0;

    function measureHeadline() {
      if (cancelled) return;

      const previousWidth = contentElement.style.width;
      contentElement.style.width = "fit-content";

      const range = document.createRange();
      range.selectNodeContents(headlineElement);
      const lineWidths = Array.from(range.getClientRects())
        .map((rect) => rect.width)
        .filter((width) => width > 0);
      range.detach();

      const styles = window.getComputedStyle(contentElement);
      const horizontalInset =
        parseFloat(styles.paddingLeft) +
        parseFloat(styles.paddingRight) +
        parseFloat(styles.borderLeftWidth) +
        parseFloat(styles.borderRightWidth);
      const nextWidth = lineWidths.length ? Math.ceil(Math.max(...lineWidths) + horizontalInset) : null;

      contentElement.style.width = nextWidth ? `${nextWidth}px` : previousWidth;
    }

    function scheduleMeasurement() {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measureHeadline);
    }

    measureHeadline();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasurement);
    if (contentElement.parentElement) resizeObserver?.observe(contentElement.parentElement);

    void document.fonts.ready.then(scheduleMeasurement);
    document.fonts.addEventListener("loadingdone", scheduleMeasurement);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      document.fonts.removeEventListener("loadingdone", scheduleMeasurement);
    };
  }, [editing, headlineText, layout.columnSpan, layout.rowSpan, layout.type]);

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
    <div className="content-inline-editor" onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div className="content-inline-tools">
        <button aria-label="Remove asset" onClick={onHide} type="button">
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <button aria-label="Done editing" onClick={onStopEditing} type="button">
          <Check size={14} aria-hidden="true" />
        </button>
      </div>

      {layout.type === "HEADLINE" ? (
        <AutoSizeTextarea
          ariaLabel="Title text"
          autoFocus
          className="content-inline-text content-inline-title"
          onChange={(value) => updateActiveSlideField("headline", value)}
          value={slide.headline}
        />
      ) : null}

      {layout.type === "CAPTION" ? (
        <AutoSizeTextarea
          ariaLabel="Caption text"
          autoFocus
          className="content-inline-text content-inline-caption"
          onChange={(value) => updateActiveSlideField("caption", value)}
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

function AutoSizeTextarea({
  ariaLabel,
  autoFocus,
  className,
  onChange,
  value
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  className: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    const borderHeight =
      style.boxSizing === "border-box" ? parseFloat(style.borderTopWidth || "0") + parseFloat(style.borderBottomWidth || "0") : 0;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.ceil(textarea.scrollHeight + borderHeight)}px`;
  }, [value]);

  return (
    <textarea
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      className={className}
      onChange={(event) => onChange(event.target.value)}
      ref={ref}
      rows={1}
      value={value}
    />
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
