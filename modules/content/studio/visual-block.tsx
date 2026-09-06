"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Fields, type Choice } from "./editor";
import { emptyFields, type Field } from "./registry";
import type { ContentBlockConfig } from "./manifest";
import styles from "./studio.module.css";

type Selection = { label: string; fields: Record<string, Field>; draft: Record<string, unknown>; key?: string; index?: number };
export function EditSurface({ label, children, onEdit, className = "" }: { label: string; children: ReactNode; onEdit: () => void; className?: string }) {
  return <div className={`${styles.editSurface} ${className}`}><div>{children}</div><button type="button" className={styles.editOverlay} onClick={onEdit} aria-label={label}><Pencil size={14} aria-hidden="true" />{label}</button></div>;
}

export function VisualBlock({ block, choices, payload, fields, canUpload, onChange }: { block: ContentBlockConfig; choices: Choice[]; payload: Record<string, unknown>; fields: Record<string, Field>; canUpload: boolean; onChange: (next: Record<string, unknown>) => void }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const mediaUrl = (value: unknown) => {
    const url = String(value || "");
    if (!url || /^https?:\/\//i.test(url) || url.startsWith("/")) return url;
    try { return new URL(url, block.presentation?.assetBaseUrl).toString(); } catch { return url; }
  };
  const image = (url: unknown, alt: unknown) => <div className={styles.visualImage} role="img" aria-label={String(alt || "Website image")} style={{ backgroundImage: url ? `url(${JSON.stringify(mediaUrl(url))})` : undefined }} />;
  function edit(keys: string[], label: string) {
    setSelection({ label, fields: Object.fromEntries(keys.filter(key => fields[key]).map(key => [key, fields[key]])), draft: payload });
  }
  function rowEditor(key: string, index: number, row: Record<string, unknown>) {
    setSelection({ label: `${fields[key].label} ${index + 1}`, key, index, fields: fields[key].fields!, draft: row });
  }
  function apply(remove = false) {
    if (!selection) return;
    if (selection.key) {
      const rows = [...(payload[selection.key] as Record<string, unknown>[] || [])];
      if (remove) rows.splice(selection.index!, 1);
      else rows[selection.index!] = selection.draft;
      onChange({ ...payload, [selection.key]: rows });
    } else onChange({ ...payload, ...Object.fromEntries(Object.keys(selection.fields).map(key => [key, selection.draft[key]])) });
    setSelection(null);
  }
  const textKeys = Object.keys(fields).filter(key => fields[key].kind !== "list" && !["imageUrl", "imageAlt"].includes(key));
  const heading = <EditSurface label="Edit text" onEdit={() => edit(textKeys, block.label)}><h3>{String(payload.heading || payload.title || payload.businessName || block.label)}</h3><p>{String(payload.copy || payload.description || payload.message || payload.tagline || "")}</p>{block.type === "business" ? <p>{[payload.line1, payload.city, payload.phone, payload.email].filter(Boolean).join(" · ")}</p> : null}</EditSurface>;
  const rows = (key: string) => (Array.isArray(payload[key]) ? payload[key] : []) as Record<string, unknown>[];
  const add = (key: string) => <button type="button" className={styles.addItem} disabled={rows(key).length >= (block.limits?.[key] ?? fields[key].max ?? 12)} onClick={() => rowEditor(key, rows(key).length, { id: crypto.randomUUID(), ...emptyFields(fields[key].fields!) })}><Plus size={16} />Add {fields[key].label.toLowerCase()}</button>;
  return <>
    {block.presentation?.variant === "hero-slide" ? <div className={styles.heroSlide} style={{ backgroundImage: `url(${JSON.stringify(mediaUrl(payload.imageUrl))})` }}><button type="button" className={styles.heroImageButton} onClick={() => edit(["imageUrl"], "Hero image")}><Pencil size={14} />Change image</button><EditSurface label="Edit hero text" onEdit={() => edit(textKeys, "Hero text")}><h3>{String(payload.headline || "")}</h3><p>{String(payload.caption || "")}</p><span>{String(payload.ctaLabel || "")}</span></EditSurface></div> : block.presentation?.variant === "event-strip" ? <div className={styles.eventPreview}>
      <EditSurface className={styles.featureSurface} label="Change image" onEdit={() => edit(["imageUrl", "imageAlt"], "Events image")}>{image(payload.imageUrl, payload.imageAlt)}</EditSurface>
      <div className={styles.eventContent}>{heading}<div className={styles.eventCards}>{rows("items").map((row, index) => {
        const choice = choices.find(item => item.id === row.referenceId);
        return <EditSurface key={String(row.id)} label="Edit or replace" onEdit={() => rowEditor("items", index, row)}><article>{image(choice?.imageUrl, choice?.label)}<strong>{String(row.title || choice?.label || "Choose an event")}</strong><p>{String(row.description || choice?.description || "")}</p><span>Book now</span></article></EditSurface>;
      })}</div></div>
    </div> : <div className={styles.visualSection}>
      {heading}
      {fields.imageUrl ? <EditSurface label="Change image" onEdit={() => edit(["imageUrl", "imageAlt"], "Image")}>{image(payload.imageUrl, payload.imageAlt)}</EditSurface> : null}
      {Object.entries(fields).filter(([, field]) => field.kind === "list").map(([key]) => <div key={key}><div className={key === "images" ? styles.imageStripPreview : styles.visualGrid}>{rows(key).map((row, index) => <EditSurface key={String(row.id)} label={key === "images" ? "Change image" : "Edit item"} onEdit={() => rowEditor(key, index, row)}>
        {key === "images" || row.imageUrl ? image(row.url || row.imageUrl, row.alt || row.imageAlt) : null}
        <h4>{String(row.name || row.question || row.author || row.caption || row.day || row.platform || row.label || "")}</h4>
        <p>{String(row.offer || row.quote || row.answer || row.description || row.bio || row.href || [row.opens, row.closes].filter(Boolean).join(" - "))}</p>
      </EditSurface>)}</div>{add(key)}</div>)}
    </div>}
    <Modal open={Boolean(selection)} title={selection?.label || "Edit content"} onClose={() => setSelection(null)}>
      {selection ? <div className={styles.fields} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); apply(); } }}><Fields canUpload={canUpload} fields={selection.fields} value={selection.draft} prefix={`${block.id}-selected`} choices={choices} onChange={draft => setSelection({ ...selection, draft })} />
        <div className={styles.dialogActions}>{selection.key && selection.index! < rows(selection.key).length ? <button type="button" disabled={rows(selection.key).length <= (block.minimums?.[selection.key] || 0)} onClick={() => apply(true)}><Trash2 size={14} />Remove</button> : null}<button type="button" onClick={() => setSelection(null)}>Cancel</button><button type="button" onClick={() => apply()}>Apply</button></div>
      </div> : null}
    </Modal>
  </>;
}
