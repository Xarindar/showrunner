"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Grip, Maximize2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button, DashboardCardFrame, EmptyState, Modal } from "@/components/ui";
import { moduleIcons } from "@/shell/module-icons";
import {
  dashboardCardGridRowHeight,
  dashboardCardMaxColumns,
  dashboardCardMaxRows,
  dashboardCardMinColumns,
  dashboardCardMinRows,
  dashboardLayoutColumns,
  type DashboardCardSize
} from "@/shell/dashboard-layout";
import { addDashboardCardAction, removeDashboardCardAction, saveDashboardCardLayoutAction } from "./actions";

type DashboardBoardCard = {
  body: ReactNode;
  cardId: string;
  columns: number;
  description: string;
  instanceId: string;
  moduleHref: string;
  moduleIcon: keyof typeof moduleIcons;
  rows: number;
  size: DashboardCardSize;
  title: string;
};

type DashboardCatalogCard = {
  defaultSize: DashboardCardSize;
  description: string;
  id: string;
  title: string;
};

type DashboardCatalogGroup = {
  cards: DashboardCatalogCard[];
  module: {
    icon: keyof typeof moduleIcons;
    id: string;
    label: string;
  };
};

type DashboardWidgetsBoardProps = {
  cards: DashboardBoardCard[];
  catalogGroups: DashboardCatalogGroup[];
};

type SaveState = "idle" | "saving" | "saved" | "error";
type DashboardBoardLayoutItem = Pick<DashboardBoardCard, "columns" | "instanceId" | "rows">;

function getLayoutFromCards(cards: DashboardBoardCard[]): DashboardBoardLayoutItem[] {
  return cards.map((card) => ({
    columns: card.columns,
    instanceId: card.instanceId,
    rows: card.rows
  }));
}

function reorderLayout(items: DashboardBoardLayoutItem[], activeId: string, overId: string) {
  const activeIndex = items.findIndex((item) => item.instanceId === activeId);
  const overIndex = items.findIndex((item) => item.instanceId === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return items;

  const nextItems = [...items];
  const [activeItem] = nextItems.splice(activeIndex, 1);
  nextItems.splice(overIndex, 0, activeItem);
  return nextItems;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function lockDocumentInteraction(cursor: string) {
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";

  return () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
  };
}

export function DashboardWidgetsBoard({ cards, catalogGroups }: DashboardWidgetsBoardProps) {
  const router = useRouter();
  const gridRef = useRef<HTMLDivElement>(null);
  const initialLayout = useMemo(() => getLayoutFromCards(cards), [cards]);
  const layoutRef = useRef(initialLayout);
  const resetSaveStateRef = useRef<number | null>(null);
  const [layoutItems, setLayoutItems] = useState(initialLayout);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<"move" | "resize" | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const cardsByInstanceId = useMemo(() => new Map(cards.map((card) => [card.instanceId, card])), [cards]);
  const items = layoutItems
    .map((layoutItem) => {
      const card = cardsByInstanceId.get(layoutItem.instanceId);
      return card ? { ...card, columns: layoutItem.columns, rows: layoutItem.rows } : null;
    })
    .filter((item): item is DashboardBoardCard => Boolean(item));

  useEffect(() => {
    return () => {
      if (resetSaveStateRef.current) window.clearTimeout(resetSaveStateRef.current);
    };
  }, []);

  function updateLayout(updater: (current: DashboardBoardLayoutItem[]) => DashboardBoardLayoutItem[]) {
    setLayoutItems((current) => {
      const next = updater(current);
      layoutRef.current = next;
      return next;
    });
  }

  function persistLayout(nextItems: DashboardBoardLayoutItem[]) {
    if (resetSaveStateRef.current) window.clearTimeout(resetSaveStateRef.current);
    setSaveState("saving");
    startTransition(() => {
      void saveDashboardCardLayoutAction(
        nextItems.map((item) => ({
          columns: item.columns,
          instanceId: item.instanceId,
          rows: item.rows
        }))
      )
        .then(() => {
          setSaveState("saved");
          router.refresh();
          resetSaveStateRef.current = window.setTimeout(() => setSaveState("idle"), 1800);
        })
        .catch((error) => {
          console.error("[dashboard-layout-save-failed]", error);
          setSaveState("error");
        });
    });
  }

  function beginMove(instanceId: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveInstanceId(instanceId);
    setInteraction("move");
    const unlock = lockDocumentInteraction("grabbing");

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const cardElement = target instanceof Element ? (target.closest("[data-dashboard-instance-id]") as HTMLElement | null) : null;
      const overId = cardElement?.dataset.dashboardInstanceId;
      if (!overId || overId === instanceId) return;

      updateLayout((current) => reorderLayout(current, instanceId, overId));
    };

    const finishMove = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishMove);
      window.removeEventListener("pointercancel", finishMove);
      unlock();
      setActiveInstanceId(null);
      setInteraction(null);
      persistLayout(layoutRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishMove, { once: true });
    window.addEventListener("pointercancel", finishMove, { once: true });
  }

  function beginResize(card: DashboardBoardCard, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const grid = gridRef.current;
    if (!grid) return;

    const gridStyle = window.getComputedStyle(grid);
    const columnGap = Number.parseFloat(gridStyle.columnGap || "0") || 0;
    const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
    const rowHeight = Number.parseFloat(gridStyle.getPropertyValue("--dashboard-card-row-height")) || dashboardCardGridRowHeight;
    const gridWidth = grid.getBoundingClientRect().width;
    const columnWidth = (gridWidth - columnGap * (dashboardLayoutColumns - 1)) / dashboardLayoutColumns;
    const columnStep = columnWidth + columnGap;
    const rowStep = rowHeight + rowGap;
    const startX = event.clientX;
    const startY = event.clientY;
    const startColumns = card.columns;
    const startRows = card.rows;
    const unlock = lockDocumentInteraction("nwse-resize");

    setActiveInstanceId(card.instanceId);
    setInteraction("resize");

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextColumns = clamp(startColumns + (moveEvent.clientX - startX) / columnStep, dashboardCardMinColumns, dashboardCardMaxColumns);
      const nextRows = clamp(startRows + (moveEvent.clientY - startY) / rowStep, dashboardCardMinRows, dashboardCardMaxRows);

      updateLayout((current) =>
        current.map((item) =>
          item.instanceId === card.instanceId
            ? {
                ...item,
                columns: nextColumns,
                rows: nextRows
              }
            : item
        )
      );
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      unlock();
      setActiveInstanceId(null);
      setInteraction(null);
      persistLayout(layoutRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  }

  const availableCardCount = catalogGroups.reduce((total, group) => total + group.cards.length, 0);
  const saveStatus =
    saveState === "saving" ? "Saving layout" : saveState === "saved" ? "Layout saved" : saveState === "error" ? "Layout could not be saved" : "";

  return (
    <section className="dashboard-quickcards" aria-label="Dashboard widgets">
      <div className="dashboard-quickcards-toolbar">
        <div>
          <h2>Widgets</h2>
          <p>Arrange the information you want close at hand.</p>
        </div>
        <div className="dashboard-quickcards-actions">
          {saveStatus ? (
            <span className={`dashboard-layout-save-state dashboard-layout-save-state-${saveState}`} aria-live="polite">
              {saveStatus}
            </span>
          ) : null}
          <Button onClick={() => setModalOpen(true)} type="button" variant="secondary">
            <Plus size={16} />
            Add widget
          </Button>
        </div>
      </div>

      {items.length ? (
        <div
          className="dashboard-card-grid"
          ref={gridRef}
          style={
            {
              "--dashboard-card-row-height": `${dashboardCardGridRowHeight}px`,
              "--dashboard-layout-columns": dashboardLayoutColumns
            } as CSSProperties
          }
        >
          {items.map((item) => {
            const Icon = moduleIcons[item.moduleIcon];
            const isActive = activeInstanceId === item.instanceId;

            return (
              <div
                className={`dashboard-layout-card${isActive ? ` dashboard-layout-card-${interaction}` : ""}`}
                data-dashboard-instance-id={item.instanceId}
                key={item.instanceId}
                style={
                  {
                    "--dashboard-card-columns": item.columns,
                    "--dashboard-card-rows": item.rows
                  } as CSSProperties
                }
              >
                <DashboardCardFrame
                  actions={
                    <details className="dashboard-card-menu">
                      <summary aria-label={`More options for ${item.title}`} className="dashboard-card-action-button" title="Widget options">
                        <MoreHorizontal size={17} />
                      </summary>
                      <div className="dashboard-card-menu-popover">
                        <form action={removeDashboardCardAction} className="dashboard-card-remove-form">
                          <input name="instanceId" type="hidden" value={item.instanceId} />
                          <input name="returnTo" type="hidden" value="/admin" />
                          <button type="submit">
                            <Trash2 size={15} />
                            Remove widget
                          </button>
                        </form>
                      </div>
                    </details>
                  }
                  href={item.moduleHref}
                  icon={<Icon size={18} />}
                  size={item.size}
                  title={item.title}
                >
                  {item.body}
                </DashboardCardFrame>
                <button
                  aria-label={`Move ${item.title}`}
                  className="dashboard-card-corner-handle dashboard-card-move-handle"
                  onPointerDown={(event) => beginMove(item.instanceId, event)}
                  title="Move widget"
                  type="button"
                >
                  <Grip size={16} />
                </button>
                <button
                  aria-label={`Resize ${item.title}`}
                  className="dashboard-card-corner-handle dashboard-card-resize-handle"
                  onPointerDown={(event) => beginResize(item, event)}
                  title="Resize widget"
                  type="button"
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dashboard-empty-panel">
          <EmptyState title="No widgets yet" description="Add a widget from one of your enabled modules to build this workspace.">
            <Button onClick={() => setModalOpen(true)} type="button" variant="secondary">
              <Plus size={16} />
              Add widget
            </Button>
          </EmptyState>
        </div>
      )}

      <Modal
        bodyClassName="dashboard-quickcard-dialog-body"
        className="dashboard-quickcard-dialog"
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="Add widget"
      >
        {availableCardCount ? (
          <div className="dashboard-catalog-groups">
            {catalogGroups.map(({ cards: moduleCards, module }) => {
              const Icon = moduleIcons[module.icon];

              return (
                <section className="dashboard-catalog-group" key={module.id}>
                  <h3>
                    <Icon size={18} />
                    {module.label}
                  </h3>
                  <div className="dashboard-catalog-list">
                    {moduleCards.map((card) => (
                      <form action={addDashboardCardAction} className="dashboard-catalog-row" key={card.id}>
                        <input name="cardId" type="hidden" value={card.id} />
                        <input name="returnTo" type="hidden" value="/admin" />
                        <input name="size" type="hidden" value={card.defaultSize} />
                        <span>
                          <strong>{card.title}</strong>
                          <small>{card.description}</small>
                        </span>
                        <Button size="sm" type="submit" variant="secondary">
                          <Plus size={15} />
                          Add
                        </Button>
                      </form>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState title="All widgets are added" description="Remove a widget if you want to swap in another module view." />
        )}
      </Modal>
    </section>
  );
}
