"use client";

import { useRef, useState } from "react";
import { AssetPicker } from "@/components/ui/asset-picker";
import { blockRegistry, emptyFields, type Field } from "./registry";
import type { ContentBlockConfig, ContentManifest } from "./manifest";
import { saveStudioBlock } from "./actions";
import styles from "./studio.module.css";
import { renderContentRichText } from "./rich-text";

export type Choice = { id: string; label: string };
export function StudioEditor({ block, pages, initialPayload, initialRevision, initialPages, choices = [] }: {
  block: ContentBlockConfig; pages: ContentManifest["pages"]; initialPayload: Record<string, unknown>; initialRevision: number; initialPages: string[]; choices?: Choice[];
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [revision, setRevision] = useState(initialRevision);
  const [pageIds, setPageIds] = useState(initialPages);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const fields = Object.fromEntries(Object.entries(blockRegistry[block.type].fields).filter(([key]) => block.editableFields.includes(key)).map(([key, value]) => [key, { ...value, ...(block.limits?.[key] !== undefined ? { max: block.limits[key] } : {}) }]));
  return <section className={styles.card} aria-labelledby={`${block.id}-title-heading`}>
    <h2 id={`${block.id}-title-heading`}>{block.label}</h2>
    {block.type === "business" ? <p>Contact details used throughout your site. Omitted weekdays are closed. Secondary locations inherit contact details and hours unless an override is selected.</p> : null}
    {block.type === "contact" || block.type === "footer" ? <p>Contact details and social links come from Contact / Business Info.</p> : null}
    {block.type === "coupon" ? <p>The code is displayed on your site. Configure redemption with your store provider.</p> : null}
    <form onSubmit={async event => {
      event.preventDefault(); setPending(true); setMessage("");
      try {
        const result = await saveStudioBlock({ id: block.id, revision, payload: Object.fromEntries(block.editableFields.map(key => [key, payload[key]])), pageIds });
        setError(Boolean(result.error)); setMessage(result.error || "Saved.");
        if (result.revision !== undefined) setRevision(result.revision);
      } catch { setError(true); setMessage("Could not save. Your edits are still here."); }
      finally { setPending(false); }
    }}>
      <fieldset disabled={pending} className={styles.fields}>
        <Fields fields={fields} value={payload} prefix={block.id} onChange={setPayload} choices={choices} />
        {block.allowPageTargeting ? <fieldset><legend>Show on pages</legend>{pages.filter(page => block.pageIds.includes(page.id)).map(page => <label key={page.id} className={styles.check}><input type="checkbox" checked={pageIds.includes(page.id)} onChange={event => setPageIds(current => event.target.checked ? [...current, page.id] : current.filter(id => id !== page.id))} />{page.label}</label>)}</fieldset> : null}
        <button type="submit">{pending ? "Saving…" : "Save changes"}</button>
      </fieldset>
      <p role={error ? "alert" : "status"} aria-live="polite">{message}</p>
    </form>
  </section>;
}

export function Fields({ fields, value, prefix, onChange, choices = [] }: { fields: Record<string, Field>; value: Record<string, unknown>; prefix: string; onChange: (next: Record<string, unknown>) => void; choices?: Choice[] }) {
  return <>{Object.entries(fields).map(([key, field]) => {
    const id = `${prefix}-${key}`;
    const update = (next: unknown) => onChange({ ...value, [key]: next });
    if (field.kind === "checkbox") return <label className={styles.check} key={key} htmlFor={id}><input type="checkbox" id={id} checked={Boolean(value[key])} onChange={event => update(event.target.checked)} />{field.label}</label>;
    if (field.kind === "list") {
      const rows = (value[key] || []) as Record<string, unknown>[];
      return <fieldset key={key} className={styles.list}><legend>{field.label}</legend>
        {rows.map((row, index) => <div key={String(row.id)} className={styles.item}>
          <Fields fields={field.fields!} value={row} prefix={`${id}-${row.id}`} choices={choices} onChange={next => update(rows.map((current, i) => i === index ? next : current))} />
          <button type="button" onClick={() => update(rows.filter((_, i) => i !== index))}>Remove {field.label.toLowerCase()} item {index + 1}</button>
        </div>)}
        <button type="button" disabled={rows.length >= (field.max ?? 12)} onClick={() => update([...rows, { id: crypto.randomUUID(), ...emptyFields(field.fields!) }])}>Add {field.label.toLowerCase()}</button>
      </fieldset>;
    }
    if (key === "referenceId") return <label key={key} htmlFor={id}>Item<select id={id} value={String(value[key] || "")} onChange={event => update(event.target.value)}><option value="">Select an item</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>;
    const media = key === "imageUrl" || (key === "url" && "alt" in fields);
    return <div key={key} className={styles.field}><label htmlFor={id}>{field.label}</label>
      {field.kind === "richtext" ? <RichText id={id} value={String(value[key] || "")} maxLength={field.max} onChange={update} /> : field.kind === "multiline" ? <textarea id={id} rows={4} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} /> : <input id={id} type={field.kind === "email" ? "email" : "text"} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} />}
      {media ? <AssetPicker assets={[]} canUpload={false} loadFromServer title="Choose an image" onSelectAsset={asset => update(asset.url || asset.thumbnailUrl)}><span>Choose from media library</span></AssetPicker> : null}
    </div>;
  })}</>;
}
function RichText({ id, value, maxLength, onChange }: { id: string; value: string; maxLength?: number; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const format = (before: string, after: string) => {
    const start = input.current?.selectionStart || 0;
    const end = input.current?.selectionEnd || start;
    onChange(value.slice(0, start) + before + (value.slice(start, end) || "text") + after + value.slice(end));
    input.current?.focus();
  };
  return <><div role="group" aria-label="Text formatting"><button type="button" onClick={() => format("**", "**")}>Bold</button> <button type="button" onClick={() => format("_", "_")}>Italic</button> <button type="button" onClick={() => format("\n\n- ", "\n\n")}>Bullet</button></div>
    <textarea ref={input} id={id} rows={5} maxLength={maxLength} value={value} onChange={event => onChange(event.target.value)} />
    <details><summary>Preview formatted text</summary><div dangerouslySetInnerHTML={{ __html: renderContentRichText(value) }} /></details></>;
}
