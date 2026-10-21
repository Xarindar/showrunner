"use client";

import NextImage from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { readImageFraming } from "./image-framing";
import { summarizeMediaTags } from "@/lib/media-tags";
import styles from "./service-picker.module.css";

export type ServiceOption = { id: string; label: string; imageUrl?: string; description?: string; category?: string; group?: string; tags?: string[]; imageFraming?: unknown };

export function ServicePicker({ value, options, onChange, title = "Pick service" }: { value: string; options: ServiceOption[]; onChange: (id: string) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [tag, setTag] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const searchId = useId();
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  const groups = [...new Set(options.map(option => option.group || option.category || "").filter(Boolean))].sort();
  const tags = summarizeMediaTags(options, Infinity);
  const selected = options.find(option => option.id === value);
  const matches = options.filter(option => (!group || (option.group || option.category) === group) && (!tag || option.tags?.some(value => value.toLowerCase() === tag.toLowerCase())) && `${option.label} ${option.group || ""} ${option.category || ""} ${option.description || ""} ${(option.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <Button type="button" variant="secondary" onClick={() => { setQuery(""); setGroup(""); setTag(""); setOpen(true); }}>{selected ? `${selected.label} · Change` : value ? "Unavailable service · Choose replacement" : title}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={title} className={styles.dialog} bodyClassName={styles.body}>
      <div className={styles.search}><Search size={17} aria-hidden="true" /><label className="ui-sr-only" htmlFor={searchId}>Search services</label><input ref={search} id={searchId} type="search" placeholder="Search services, businesses, or tags…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear service search" type="button" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}</div>
      <div className={styles.filters}>
        <label><span className="ui-sr-only">Business</span><select aria-label="Business" value={group} onChange={event => setGroup(event.target.value)}><option value="">All businesses</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span className="ui-sr-only">Tag</span><select aria-label="Tag" value={tag} onChange={event => setTag(event.target.value)}><option value="">All tags</option>{tags.map(item => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}</select></label>
      </div>
      <span className={styles.count} role="status">{matches.length} {matches.length === 1 ? "service" : "services"}</span>
      <div className={styles.results}>
        {matches.map(option => { const framing = readImageFraming(option.imageFraming); return <button key={option.id} type="button" className={styles.result} aria-pressed={value === option.id} onClick={() => { onChange(option.id); setOpen(false); }}>
          <span className={styles.photo}>{option.imageUrl ? <NextImage src={option.imageUrl} alt="" width={88} height={88} style={{ objectPosition: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transformOrigin: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transform: `scale(${framing.imageZoom})` }} unoptimized /> : <ImageIcon aria-hidden="true" size={24} />}</span>
          <span className={styles.copy}><strong>{option.label}</strong>{(option.group || option.category) && <span>{option.group || option.category}</span>}{option.description && <span>{option.description}</span>}</span>
        </button>; })}
        {!matches.length && <p role="status">{options.length ? "No services match. Try another search." : "No active services are available."}</p>}
      </div>
      <div className="module-modal-actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
    </Modal>
  </>;
}
