"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Search, Settings, Smartphone, Trash2 } from "lucide-react";
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
import type { DashboardWidgetSettingDefinition, DashboardWidgetSettings } from "@/shell/dashboard-widget-types";
import {
  addDashboardCardAction,
  removeDashboardCardAction,
  saveDashboardCardLayoutAction,
  updateDashboardCardSettingsAction
} from "./actions";

type DashboardBoardCard = {
  body: ReactNode;
  cardId: string;
  columns: number;
  description: string;
  instanceId: string;
  minColumns: number;
  minRows: number;
  moduleHref: string;
  moduleIcon: keyof typeof moduleIcons;
  rows: number;
  settingsDefinition: DashboardWidgetSettingDefinition[];
  settingsValues: DashboardWidgetSettings;
  size: DashboardCardSize;
  title: string;
};

type DashboardCatalogCard = {
  body: ReactNode;
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
const dashboardDesktopLayoutMedia = "(min-width: 861px)";

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
  const [editMode, setEditMode] = useState(false);
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ instanceId: string; title: string } | null>(null);
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

  useEffect(() => {
    const desktopLayout = window.matchMedia(dashboardDesktopLayoutMedia);
    const exitEditModeOnNarrowScreens = () => {
      if (!desktopLayout.matches) setEditMode(false);
    };

    exitEditModeOnNarrowScreens();
    desktopLayout.addEventListener("change", exitEditModeOnNarrowScreens);
    return () => desktopLayout.removeEventListener("change", exitEditModeOnNarrowScreens);
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
    if (event.button !== 0 || !window.matchMedia(dashboardDesktopLayoutMedia).matches) return;
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
    if (event.button !== 0 || !window.matchMedia(dashboardDesktopLayoutMedia).matches) return;
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
      const nextColumns = clamp(
        startColumns + (moveEvent.clientX - startX) / columnStep,
        Math.max(dashboardCardMinColumns, card.minColumns),
        dashboardCardMaxColumns
      );
      const nextRows = clamp(
        startRows + (moveEvent.clientY - startY) / rowStep,
        Math.max(dashboardCardMinRows, card.minRows),
        dashboardCardMaxRows
      );

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
  const filteredCatalogGroups = useMemo(() => {
    const query = catalogQuery.trim().toLocaleLowerCase();
    if (!query) return catalogGroups;

    return catalogGroups
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) =>
          [group.module.label, card.title, card.description].some((value) => value.toLocaleLowerCase().includes(query))
        )
      }))
      .filter((group) => group.cards.length);
  }, [catalogGroups, catalogQuery]);
  const visibleCardCount = filteredCatalogGroups.reduce((total, group) => total + group.cards.length, 0);
  const saveStatus =
    saveState === "saving" ? "Saving layout" : saveState === "saved" ? "Layout saved" : saveState === "error" ? "Layout could not be saved" : "";

  return (
    <section className={`dashboard-quickcards${editMode ? " is-editing" : ""}`} aria-label="Dashboard widgets">
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
          <Button
            aria-pressed={editMode}
            className="dashboard-desktop-edit-control"
            onClick={() => {
              if (!window.matchMedia(dashboardDesktopLayoutMedia).matches) return;
              setSettingsInstanceId(null);
              setEditMode((current) => !current);
            }}
            type="button"
            variant={editMode ? "primary" : "secondary"}
          >
            {editMode ? <Check size={16} /> : <Pencil size={15} />}
            {editMode ? "Done editing" : "Edit dashboard"}
          </Button>
          <span className="dashboard-mobile-layout-note">
            <Smartphone aria-hidden="true" size={15} />
            Mobile layout adjusts automatically
          </span>
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
            const settingsOpen = settingsInstanceId === item.instanceId;

            return (
              <div
                className={`dashboard-layout-card${isActive ? ` dashboard-layout-card-${interaction}` : ""}${
                  settingsOpen ? " dashboard-layout-card-settings-open" : ""
                }`}
                data-dashboard-instance-id={item.instanceId}
                key={item.instanceId}
                style={
                  {
                     "--dashboard-card-columns": item.columns,
                    "--dashboard-card-tablet-columns": item.columns <= 6 ? 1 : 2,
                     "--dashboard-card-rows": item.rows
                  } as CSSProperties
                }
              >
                <DashboardCardFrame
                  actions={
                    <button
                      aria-label={settingsOpen ? `Back to ${item.title}` : `Settings for ${item.title}`}
                      className="dashboard-card-action-button"
                      onClick={() => setSettingsInstanceId(settingsOpen ? null : item.instanceId)}
                      title={settingsOpen ? "Back to widget" : "Widget settings"}
                      type="button"
                    >
                      {settingsOpen ? <ArrowLeft size={16} /> : <Settings size={16} />}
                    </button>
                  }
                  icon={<Icon size={18} />}
                  overlay={
                    settingsOpen ? (
                      <div aria-label={`${item.title} settings`} className="dashboard-card-settings-panel">
                        <div className="dashboard-card-settings-panel-heading">
                          <strong>Widget settings</strong>
                          <small>Choose what appears on this dashboard.</small>
                        </div>
                        {item.settingsDefinition.length ? (
                          <form action={updateDashboardCardSettingsAction} className="dashboard-card-settings-form">
                            <input name="instanceId" type="hidden" value={item.instanceId} />
                            <input name="returnTo" type="hidden" value="/admin" />
                            <fieldset>
                              <legend>Visible details</legend>
                              {item.settingsDefinition.map((setting) => {
                                if (setting.type === "date-range") {
                                  const savedValue = item.settingsValues[setting.id];
                                  const range = typeof savedValue === "object" ? savedValue : setting.defaultValue;

                                  return (
                                    <div className="dashboard-card-date-setting" key={setting.id}>
                                      <span>
                                        <strong>{setting.label}</strong>
                                        {setting.description ? <small>{setting.description}</small> : null}
                                      </span>
                                      <div className="dashboard-card-date-range">
                                        <label>
                                          <span className="ui-sr-only">Start date</span>
                                          <input
                                            aria-label={`${setting.label} start date`}
                                            defaultValue={range.start}
                                            inputMode="numeric"
                                            maxLength={8}
                                            name={`setting.${setting.id}.start`}
                                            pattern="[0-9]{2}/[0-9]{2}/[0-9]{2}"
                                            placeholder="MM/DD/YY"
                                            type="text"
                                          />
                                        </label>
                                        <span aria-hidden="true">–</span>
                                        <label>
                                          <span className="ui-sr-only">End date</span>
                                          <input
                                            aria-label={`${setting.label} end date`}
                                            defaultValue={range.end}
                                            inputMode="numeric"
                                            maxLength={8}
                                            name={`setting.${setting.id}.end`}
                                            pattern="[0-9]{2}/[0-9]{2}/[0-9]{2}"
                                            placeholder="MM/DD/YY"
                                            type="text"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  );
                                }

                                const savedValue = item.settingsValues[setting.id];
                                return (
                                  <label className="dashboard-card-toggle-setting" key={setting.id}>
                                    <input
                                      defaultChecked={typeof savedValue === "boolean" ? savedValue : setting.defaultValue}
                                      name={`setting.${setting.id}`}
                                      type="checkbox"
                                    />
                                    <span>
                                      <strong>{setting.label}</strong>
                                      {setting.description ? <small>{setting.description}</small> : null}
                                    </span>
                                  </label>
                                );
                              })}
                            </fieldset>
                            <Button size="sm" type="submit" variant="secondary">
                              Save settings
                            </Button>
                          </form>
                        ) : (
                          <p className="dashboard-card-settings-empty">This widget has no configurable details yet.</p>
                        )}
                      </div>
                    ) : null
                  }
                  size={item.size}
                  title={item.title}
                >
                  {item.body}
                </DashboardCardFrame>
                {settingsOpen ? (
                  <button
                    aria-label={`Remove ${item.title} widget`}
                    className="dashboard-card-delete-widget"
                    onClick={() => setRemoveTarget({ instanceId: item.instanceId, title: item.title })}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    <span role="tooltip">Remove widget</span>
                  </button>
                ) : editMode ? (
                  <>
                    <button
                      aria-label={`Move ${item.title}`}
                      className="dashboard-card-move-handle"
                      onPointerDown={(event) => beginMove(item.instanceId, event)}
                      title="Move widget"
                      type="button"
                    />
                    <button
                      aria-label={`Resize ${item.title}`}
                      className="dashboard-card-corner-handle dashboard-card-resize-handle"
                      onPointerDown={(event) => beginResize(item, event)}
                      title="Resize widget"
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20">
                        <path d="M3 18.5 18.5 3M9 18.5l9.5-9.5M15 18.5l3.5-3.5" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <Link aria-label={`View ${item.title} module`} className="dashboard-card-open-module" href={item.moduleHref}>
                    <span>View module</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                )}
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
        onClose={() => {
          setCatalogQuery("");
          setModalOpen(false);
        }}
        open={modalOpen}
        title="Add widget"
      >
        {availableCardCount ? (
          <div className="dashboard-catalog">
            <div className="dashboard-catalog-intro">
              <label className="dashboard-catalog-search">
                <Search aria-hidden="true" size={16} />
                <span className="ui-sr-only">Search widgets</span>
                <input
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Search widgets or modules"
                  type="search"
                  value={catalogQuery}
                />
              </label>
              <span>{catalogQuery ? `${visibleCardCount} found` : `${availableCardCount} available`}</span>
            </div>
            {filteredCatalogGroups.length ? (
              <div className="dashboard-catalog-groups">
                {filteredCatalogGroups.map(({ cards: moduleCards, module }) => {
                  const Icon = moduleIcons[module.icon];

                  return (
                    <section className="dashboard-catalog-group" key={module.id}>
                      <h3>
                        <Icon size={15} />
                        {module.label}
                        <span>{moduleCards.length}</span>
                      </h3>
                      <div className="dashboard-catalog-gallery">
                        {moduleCards.map((card) => (
                          <form
                            action={addDashboardCardAction}
                            className={`dashboard-catalog-preview dashboard-catalog-preview-${card.defaultSize}`}
                            key={card.id}
                          >
                            <input name="cardId" type="hidden" value={card.id} />
                            <input name="returnTo" type="hidden" value="/admin" />
                            <input name="size" type="hidden" value={card.defaultSize} />
                            <div className="dashboard-catalog-preview-title">
                              <strong>{card.title}</strong>
                            </div>
                            <div className="dashboard-catalog-widget-shell">
                              <div aria-hidden="true" className="dashboard-catalog-widget" inert>
                                <div className="dashboard-catalog-widget-canvas">
                                  <DashboardCardFrame icon={<Icon size={18} />} size={card.defaultSize} title={card.title}>
                                    {card.body}
                                  </DashboardCardFrame>
                                </div>
                              </div>
                              <button aria-label={`Add ${card.title}`} className="dashboard-catalog-add-overlay" type="submit">
                                <span aria-hidden="true">
                                  <Plus size={24} />
                                </span>
                              </button>
                            </div>
                          </form>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="dashboard-catalog-no-results">
                <Search aria-hidden="true" size={20} />
                <strong>No matching widgets</strong>
                <small>Try a module name such as “Payments” or a task such as “appointments.”</small>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="All widgets are added" description="Remove a widget if you want to swap in another module view." />
        )}
      </Modal>

      <Modal
        className="dashboard-remove-dialog"
        onClose={() => setRemoveTarget(null)}
        open={Boolean(removeTarget)}
        title="Remove widget?"
      >
        <p>
          Remove <strong>{removeTarget?.title}</strong> from this dashboard? You can add it again later.
        </p>
        <div className="dashboard-remove-dialog-actions">
          <Button onClick={() => setRemoveTarget(null)} type="button" variant="secondary">
            Cancel
          </Button>
          <form action={removeDashboardCardAction}>
            <input name="instanceId" type="hidden" value={removeTarget?.instanceId || ""} />
            <input name="returnTo" type="hidden" value="/admin" />
            <Button type="submit" variant="danger">
              <Trash2 size={16} />
              Remove widget
            </Button>
          </form>
        </div>
      </Modal>
    </section>
  );
}
