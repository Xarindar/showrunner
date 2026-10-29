"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { SessionOffering } from "@/lib/scheduling/session-offering";
import type { ServiceLibraryItem, ServiceLibraryResults } from "@/lib/scheduling/service-library";
import styles from "./session-packages-editor.module.css";

export function ServiceLibraryMenu({ selectedItems, onChoose, onCreate, onBrowse }: {
  selectedItems: SessionOffering["coverageItems"];
  onChoose: (item: ServiceLibraryItem) => void;
  onCreate: () => void;
  onBrowse: () => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ q: "", category: "", tag: "" });
  const [results, setResults] = useState<ServiceLibraryResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (open) document.getElementById(`${id}-search`)?.focus(); }, [open, id]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/scheduling/service-library?${new URLSearchParams(filters)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
        const data: ServiceLibraryResults = await response.json();
        if (!controller.signal.aborted) setResults(data);
      } catch { if (!controller.signal.aborted) setError("Could not load services. Try again or open the full library."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, filters, retry]);
  function close() { menu.current?.hidePopover(); }
  return <>
    <Button ref={trigger} type="button" variant="ghost" disabled={selectedItems.length >= 100} aria-expanded={open} aria-controls={id} onClick={() => {
      if (open) { close(); return; }
      const panel = menu.current;
      if (!panel || !trigger.current) return;
      setLoading(true); panel.showPopover();
      const rect = trigger.current.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect.left, document.documentElement.clientWidth - panel.offsetWidth - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - Math.min(480, window.innerHeight - 24) - 12))}px`;
    }}>+ Add item</Button>
    <div ref={menu} id={id} popover="auto" role="dialog" aria-label="Choose an included service" className={styles.libraryMenu}
      onToggle={event => setOpen(event.newState === "open")} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); }
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      }}>
      <Field label="Search services"><Input id={`${id}-search`} type="search" maxLength={120} value={filters.q} onChange={event => { setLoading(true); setFilters({ ...filters, q: event.target.value }); }} /></Field>
      <div className={styles.tierNumbers}>
        <Field label="Category"><Select value={filters.category} onChange={event => { setLoading(true); setFilters({ ...filters, category: event.target.value }); }}><option value="">All categories</option>{results?.categories.map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Tag"><Select value={filters.tag} onChange={event => { setLoading(true); setFilters({ ...filters, tag: event.target.value }); }}><option value="">All tags</option>{results?.tags.map(value => <option key={value}>{value}</option>)}</Select></Field>
      </div>
      <div className={styles.menuResults} aria-busy={loading}>
        <p role="status">{loading ? "Loading services…" : error || !results?.items.length ? "" : `${results.items.length} services`}</p>
        {error && !loading ? <><p role="alert">{error}</p><Button type="button" variant="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Try again</Button></> : !results?.items.length ? !loading && <p>No matching services.</p> : results.items.map(item => {
          const added = selectedItems.some(selected => selected.libraryItemId === item.id || selected.name.toLowerCase() === item.name.toLowerCase());
          return <Button key={item.id} type="button" variant="ghost" disabled={loading || added} onClick={() => { close(); onChoose(item); }}>{item.name}{added ? " · Added" : ""}</Button>;
        })}
      </div>
      <Button type="button" variant="ghost" onClick={() => { close(); onCreate(); }}>+ Create new service</Button>
      <Button type="button" variant="ghost" onClick={() => { close(); onBrowse(); }}>Open full service library</Button>
    </div>
  </>;
}
