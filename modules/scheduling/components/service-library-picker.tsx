"use client";

import { useEffect, useId, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { serviceLibraryInputSchema, type ServiceLibraryItem, type ServiceLibraryResults } from "@/lib/scheduling/service-library";
import type { SessionOffering } from "@/lib/scheduling/session-offering";
import { saveServiceLibraryItemAction } from "../service-library-actions";
import styles from "./service-library-picker.module.css";

type IncludedItem = SessionOffering["coverageItems"][number];

export function ServiceLibraryPicker({ selectedItems, editingItem, onChoose, onClose, inline = false }: {
  inline?: boolean;
  selectedItems: IncludedItem[];
  editingItem?: IncludedItem;
  onChoose: (items: ServiceLibraryItem[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [view, setView] = useState<"library" | "edit">(editingItem ? "edit" : "library");
  const [form, setForm] = useState({ id: editingItem?.libraryItemId, name: editingItem?.name || "", description: editingItem?.description || "", category: editingItem?.category || "", tags: editingItem?.tags?.join(", ") || "" });
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ServiceLibraryResults>({ items: [], categories: [], tags: [], total: 0, page: 1, pageCount: 1 });
  const [picked, setPicked] = useState<ServiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const remaining = 100 - selectedItems.length;

  useEffect(() => {
    document.getElementById(`${id}-${view === "library" ? "search" : "name"}`)?.focus();
  }, [id, view]);

  useEffect(() => {
    if (view !== "library") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, category, tag, page: String(page) });
        const response = await fetch(`/api/scheduling/service-library?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Library unavailable");
        const data: ServiceLibraryResults = await response.json();
        if (!controller.signal.aborted) setResults(data);
      } catch {
        if (!controller.signal.aborted) setError("The service library could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, category, tag, page, view, reload]);

  function changeFilter(setValue: (value: string) => void, value: string) {
    setValue(value);
    setPage(1);
    setLoading(true);
  }

  function showSaveError(message: string) {
    setError(message);
    requestAnimationFrame(() => document.getElementById(`${id}-error`)?.focus());
  }

  async function save() {
    const parsed = serviceLibraryInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      document.getElementById(`${id}-${String(parsed.error.issues[0].path[0])}`)?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await saveServiceLibraryItemAction(form);
      if (result.error) { showSaveError(result.error); return; }
      if (result.item) onChoose([...picked.filter(item => item.id !== result.item.id), result.item]);
    } catch {
      showSaveError("The service could not be saved. Your details are still here; please try again.");
    } finally { setSaving(false); }
  }

  const content = <>
    {view === "library" ? <>
      <div className={styles.toolbar}>
        <Field label="Search services"><Input id={`${id}-search`} type="search" value={q} maxLength={120} placeholder="Name, description or tag" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} onChange={event => changeFilter(setQ, event.target.value)} /></Field>
        <Button type="button" variant="secondary" disabled={picked.length >= remaining} onClick={() => { setForm({ id: undefined, name: "", description: "", category: "", tags: "" }); setError(""); setView("edit"); }}><Plus size={16} />New service</Button>
      </div>
      <div className={styles.filters}>
        <Field label="Category"><Select value={category} onChange={event => changeFilter(setCategory, event.target.value)}><option value="">All categories</option>{results.categories.map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Tag"><Select value={tag} onChange={event => changeFilter(setTag, event.target.value)}><option value="">All tags</option>{results.tags.map(value => <option key={value}>{value}</option>)}</Select></Field>
      </div>
      {error ? <div className={styles.error} role="alert"><p>{error}</p><Button type="button" variant="secondary" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Try again</Button></div> : null}
      <div className={styles.results} aria-busy={loading} aria-label="Library services">
        {loading ? <p role="status" className={styles.hint}>Loading services…</p> : !error && <>
          <p className={styles.hint} role="status">{results.total} {results.total === 1 ? "service" : "services"}</p>
          {results.items.length === 0 ? <div className={styles.empty}>
            <h3>{q || category || tag ? "No matching services" : "Your service library is empty"}</h3>
            <p>{q || category || tag ? "Try another search or clear the filters." : "Create your first reusable service with a name and description."}</p>
            {(q || category || tag) && <Button type="button" variant="ghost" onClick={() => { setQ(""); setCategory(""); setTag(""); setPage(1); setLoading(true); }}>Clear filters</Button>}
          </div> : results.items.map(item => {
            const added = selectedItems.some(selected => selected.libraryItemId === item.id || selected.name.toLowerCase() === item.name.toLowerCase());
            const checked = picked.some(selected => selected.id === item.id);
            return <label key={item.id} className={styles.option} data-added={added}>
              <input type="checkbox" aria-label={`Select ${item.name}`} checked={added || checked} disabled={added || (!checked && picked.length >= remaining)} onChange={event => setPicked(current => event.target.checked ? [...current, item] : current.filter(selected => selected.id !== item.id))} />
              <span className={styles.serviceCopy}><strong>{item.name}</strong><span className={styles.description}>{item.description || "No description yet"}</span>
                {(item.category || item.tags.length > 0) && <span className={styles.metadata}>{[item.category, ...item.tags.map(value => `#${value}`)].filter(Boolean).join(" · ")}</span>}
              </span>
              {added && <span className={styles.hint}>Added</span>}
            </label>;
          })}
          {results.pageCount > 1 && <div className={styles.pagination}>
            <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => { setPage(value => value - 1); setLoading(true); }}>Previous</Button>
            <span className={styles.hint}>Page {results.page} of {results.pageCount}</span>
            <Button type="button" variant="ghost" disabled={page >= results.pageCount} onClick={() => { setPage(value => value + 1); setLoading(true); }}>Next</Button>
          </div>}
        </>}
      </div>
      <footer className={styles.footer}><span className={styles.hint}>{picked.length} selected</span><div>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!picked.length} onClick={() => onChoose(picked)}>Add {picked.length || "selected"} {picked.length === 1 ? "service" : "services"}</Button>
      </div></footer>
    </> : <>
      <div className={styles.editBody} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (!saving) void save(); } }}>
        {!editingItem && <Button type="button" variant="ghost" className={styles.back} disabled={saving} onClick={() => { setError(""); setView("library"); }}><ArrowLeft size={16} />Service library</Button>}
        <p className={styles.hint}>Save a reusable service. Its description can be used in client-facing session and package details.</p>
        <Field label="Service name"><Input id={`${id}-name`} value={form.name} required maxLength={120} disabled={saving} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Description" hint="Describe what the client receives. Avoid private or internal notes."><Textarea id={`${id}-description`} value={form.description} maxLength={2000} rows={4} disabled={saving} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label="Category" hint="For example, Weddings or Portraits."><Input id={`${id}-category`} value={form.category} maxLength={120} disabled={saving} onChange={event => setForm({ ...form, category: event.target.value })} /></Field>
        <Field label="Tags" hint="Separate tags with commas."><Input id={`${id}-tags`} value={form.tags} maxLength={1500} disabled={saving} onChange={event => setForm({ ...form, tags: event.target.value })} /></Field>
        {error && <p id={`${id}-error`} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}
      </div>
      <footer className={styles.footer}><span className={styles.hint}>Library changes are saved immediately.</span><div>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : inline ? "Done" : editingItem ? "Save changes" : "Create and add"}</Button>
      </div></footer>
    </>}
  </>;
  return inline ? <div className={styles.inlineEditor}>{content}</div> : <Modal open title={view === "library" ? "Service library" : editingItem?.name ? "Edit service" : "New service"}
    className={styles.modal} bodyClassName={styles.body} onClose={() => { if (!saving) onClose(); }}>{content}</Modal>;
}
