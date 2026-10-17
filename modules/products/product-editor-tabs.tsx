"use client";

import { useEffect, type ReactNode } from "react";

export type ProductEditorTab = { content: ReactNode; icon?: ReactNode; id: string; label: string };
export function ProductEditorTabs({ initialTab, tabs }: { initialTab?: string; tabs: ProductEditorTab[] }) {
  useEffect(() => { if (initialTab) document.getElementById(`product-editor-panel-${initialTab}`)?.scrollIntoView({ block: "start" }); }, [initialTab]);
  return <div className="admin-editor-sections">{tabs.map(tab => <section className="admin-editor-section" id={`product-editor-panel-${tab.id}`} key={tab.id} aria-label={tab.label}>{tab.content}</section>)}</div>;
}
