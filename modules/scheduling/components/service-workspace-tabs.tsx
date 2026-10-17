"use client";

import { useEffect, type ReactNode } from "react";

export type ServiceWorkspaceTab = { content: ReactNode; icon?: ReactNode; id: string; label: string };
export function ServiceWorkspaceTabs({ initialTab, tabs }: { initialTab?: string; tabs: ServiceWorkspaceTab[] }) {
  useEffect(() => { if (initialTab) document.getElementById(`service-workspace-panel-${initialTab}`)?.scrollIntoView({ block: "start" }); }, [initialTab]);
  return <div className="admin-editor-sections">{tabs.length > 1 && <nav className="admin-section-nav" aria-label="Scheduling rule sections">{tabs.map(tab => <a key={tab.id} href={`#service-workspace-panel-${tab.id}`}>{tab.label}</a>)}</nav>}{tabs.map(tab => <section className="admin-editor-section" id={`service-workspace-panel-${tab.id}`} key={tab.id} tabIndex={-1} aria-label={tab.label}>{tab.content}</section>)}</div>;
}
