"use client";

import { Fragment, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./utils";

export type FolderTab = {
  content: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  id: string;
  label: string;
};

type FolderTabsProps = {
  ariaLabel?: string;
  className?: string;
  initialTab?: string;
  panelClassName?: string;
  tabParamName?: string;
  tabs: FolderTab[];
};

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function FolderTabs({
  ariaLabel = "Folder tabs",
  className,
  initialTab,
  panelClassName,
  tabParamName = "tab",
  tabs
}: FolderTabsProps) {
  const generatedId = useId();
  const rootId = safeDomId(`folder-tabs-${generatedId}`);
  const firstTabId = tabs[0]?.id || "";
  const startTab = tabs.some((tab) => tab.id === initialTab) ? (initialTab as string) : firstTabId;
  const [activeId, setActiveId] = useState(startTab);

  if (!tabs.length) return null;

  const selectTab = (id: string) => {
    setActiveId(id);
    if (typeof window === "undefined" || !tabParamName) return;
    const url = new URL(window.location.href);
    if (id === firstTabId) url.searchParams.delete(tabParamName);
    else url.searchParams.set(tabParamName, id);
    url.searchParams.delete("saved");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  const moveFocus = (currentIndex: number, direction: number) => {
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    const nextElement = document.getElementById(`${rootId}-tab-${safeDomId(nextTab.id)}`);
    nextElement?.focus();
    selectTab(nextTab.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(currentIndex, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(currentIndex, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstTab = tabs[0];
      document.getElementById(`${rootId}-tab-${safeDomId(firstTab.id)}`)?.focus();
      selectTab(firstTab.id);
    } else if (event.key === "End") {
      event.preventDefault();
      const lastTab = tabs[tabs.length - 1];
      document.getElementById(`${rootId}-tab-${safeDomId(lastTab.id)}`)?.focus();
      selectTab(lastTab.id);
    }
  };

  return (
    <section className={cx("ui-folder-tabs", className)}>
      <div aria-label={ariaLabel} className="ui-folder-tablist" role="tablist">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          const safeId = safeDomId(tab.id);
          return (
            <button
              aria-controls={`${rootId}-panel-${safeId}`}
              aria-selected={selected}
              className={cx("ui-folder-tab", selected && "is-active")}
              data-folder-tab-id={tab.id}
              id={`${rootId}-tab-${safeId}`}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button">
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => {
        const safeId = safeDomId(tab.id);
        return (
          <Fragment key={tab.id}>
            <div
              aria-labelledby={`${rootId}-tab-${safeId}`}
              className={cx("ui-folder-panel", panelClassName)}
              hidden={tab.id !== activeId}
              id={`${rootId}-panel-${safeId}`}
              role="tabpanel">
              {tab.content}
            </div>
            {tab.footer ? (
              <div className="ui-folder-tab-footer" hidden={tab.id !== activeId}>
                {tab.footer}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </section>
  );
}
