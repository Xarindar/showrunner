"use client";

import { useState, type ReactNode } from "react";
import { Tab, Tabs } from "@/components/ui";
import { cx } from "@/components/ui/utils";

export type ServiceWorkspaceTab = {
  content: ReactNode;
  icon?: ReactNode;
  id: string;
  label: string;
};

type ServiceWorkspaceTabsProps = {
  initialTab?: string;
  tabs: ServiceWorkspaceTab[];
};

export function ServiceWorkspaceTabs({ initialTab, tabs }: ServiceWorkspaceTabsProps) {
  const firstTabId = tabs[0]?.id || "";
  const startTab = tabs.some((tab) => tab.id === initialTab) ? (initialTab as string) : firstTabId;
  const [activeId, setActiveId] = useState(startTab);

  const selectTab = (id: string) => {
    setActiveId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id === firstTabId) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    url.searchParams.delete("saved");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  return (
    <div className="product-editor-tabs service-workspace-tabs">
      <Tabs className="product-editor-tablist service-workspace-tablist">
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <Tab
              aria-controls={`service-workspace-panel-${tab.id}`}
              aria-selected={selected}
              className={cx("product-editor-tab", selected && "is-active")}
              id={`service-workspace-tab-${tab.id}`}
              key={tab.id}
              onClick={() => selectTab(tab.id)}>
              {tab.icon}
              {tab.label}
            </Tab>
          );
        })}
      </Tabs>

      {tabs.map((tab) => (
        <div
          aria-labelledby={`service-workspace-tab-${tab.id}`}
          className="product-editor-panel service-workspace-panel"
          hidden={tab.id !== activeId}
          id={`service-workspace-panel-${tab.id}`}
          key={tab.id}
          role="tabpanel">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
