"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Tab, Tabs } from "@/components/ui";
import { cx } from "@/components/ui/utils";

export type ProductEditorTab = {
  content: ReactNode;
  icon?: ReactNode;
  id: string;
  label: string;
};

type ProductEditorTabsProps = {
  initialTab?: string;
  tabs: ProductEditorTab[];
};

type TabBadgeContextValue = {
  setBadge: (id: string, value: number) => void;
};

const TabBadgeContext = createContext<TabBadgeContextValue | null>(null);

/**
 * Lets a panel (e.g. the variant table) surface an unsaved/error count on its own
 * tab label without the page knowing about it. No-ops when used outside the tabs.
 */
export function useEditorTabBadge(id: string, value: number) {
  const context = useContext(TabBadgeContext);
  useEffect(() => {
    context?.setBadge(id, value);
  }, [context, id, value]);
}

export function ProductEditorTabs({ initialTab, tabs }: ProductEditorTabsProps) {
  const firstTabId = tabs[0]?.id || "";
  const startTab = tabs.some((tab) => tab.id === initialTab) ? (initialTab as string) : firstTabId;
  const [activeId, setActiveId] = useState(startTab);
  const [badges, setBadges] = useState<Record<string, number>>({});

  const setBadge = useCallback((id: string, value: number) => {
    setBadges((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const selectTab = (id: string) => {
    setActiveId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id === firstTabId) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    url.searchParams.delete("saved");
    url.searchParams.delete("error");
    // Update the URL without an RSC navigation so unsaved field edits survive.
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  return (
    <TabBadgeContext.Provider value={{ setBadge }}>
      <div className="product-editor-tabs">
        <Tabs className="product-editor-tablist">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            const badge = badges[tab.id] || 0;
            return (
              <Tab
                aria-controls={`product-editor-panel-${tab.id}`}
                aria-selected={selected}
                className={cx("product-editor-tab", selected && "is-active")}
                id={`product-editor-tab-${tab.id}`}
                key={tab.id}
                onClick={() => selectTab(tab.id)}>
                {tab.icon}
                {tab.label}
                {badge ? <span className="product-editor-tab-badge">{badge}</span> : null}
              </Tab>
            );
          })}
        </Tabs>

        {tabs.map((tab) => (
          <div
            aria-labelledby={`product-editor-tab-${tab.id}`}
            className="product-editor-panel"
            hidden={tab.id !== activeId}
            id={`product-editor-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel">
            {tab.content}
          </div>
        ))}
      </div>
    </TabBadgeContext.Provider>
  );
}
