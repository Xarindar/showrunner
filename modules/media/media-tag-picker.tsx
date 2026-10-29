"use client";

import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import styles from "./media-library.module.css";

export function MediaTagPicker({ tags, selected, onChange }: { tags: string[]; selected: string[]; onChange: (tags: string[]) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const options = [...new Map([...tags, ...created, ...selected].map(tag => [tag.toLocaleLowerCase(), tag])).values()].sort((a,b) => a.localeCompare(b));
  function addTag() {
    const value = name.trim();
    if (!value || value.includes(",") || value.length > 80) { setError("Enter a tag under 80 characters without commas."); return; }
    const tag = options.find(option => option.toLocaleLowerCase() === value.toLocaleLowerCase()) || value;
    if (!selected.includes(tag) && selected.length >= 20) { setError("Choose up to 20 tags."); return; }
    setCreated(current => [...current, tag]);
    if (!selected.includes(tag)) onChange([...selected, tag]);
    setCreating(false); setQuery(""); setOpen(true); input.current?.focus();
  }
  return <>
    <div className={styles.tagPicker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); input.current?.focus(); } }}>
      <label className={styles.field} htmlFor={id}><span>Tags</span>
      <input ref={input} id={id} autoComplete="off" value={query} placeholder="Find or add tags" aria-controls={`${id}-options`}
        onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      {selected.length > 0 && <p className={styles.selectedTags}>{selected.join(", ")}</p>}
      {open && <div id={`${id}-options`} className={styles.tagOptions} role="group" aria-label="Available tags">
        <Button type="button" variant="ghost" onClick={() => { setName(query); setError(""); setCreating(true); setOpen(false); }}><Plus size={16} aria-hidden="true" />New Tag</Button>
        {options.filter(tag => tag.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(tag => <label key={tag}>
          <input type="checkbox" checked={selected.includes(tag)} disabled={!selected.includes(tag) && selected.length >= 20}
            onChange={event => onChange(event.target.checked ? [...selected, tag] : selected.filter(value => value !== tag))} />{tag}
        </label>)}
        {selected.length >= 20 && <small>Choose up to 20 tags.</small>}
      </div>}
    </div>
    <Modal open={creating} onClose={() => setCreating(false)} title="New tag" className={styles.folderModal}>
      <div className={styles.newFolder}>
        <label>Tag name<input form="" autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="module-modal-actions"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button type="button" onClick={addTag}>Create tag</Button></div>
      </div>
    </Modal>
  </>;
}
