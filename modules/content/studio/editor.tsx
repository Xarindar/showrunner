"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import { AssetPicker, type AssetPickerAsset } from "@/components/ui/asset-picker";
import { blockRegistry, emptyFields, type Field } from "./registry";
import type { ContentBlockConfig, ContentManifest } from "./manifest";
import { saveStudioBlock, uploadStudioAsset } from "./actions";
import styles from "./studio.module.css";
import { renderContentRichText } from "./rich-text";
import { VisualBlock } from "./visual-block";

export type Choice = { description?: string; id: string; imageUrl?: string; label: string };
export function StudioEditor({ block, canUpload = false, pages, initialPayload, initialRevision, initialPages, choices = [] }: {
  block: ContentBlockConfig; canUpload?: boolean; pages: ContentManifest["pages"]; initialPayload: Record<string, unknown>; initialRevision: number; initialPages: string[]; choices?: Choice[];
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [revision, setRevision] = useState(initialRevision);
  const [pageIds, setPageIds] = useState(initialPages);
  const [savedPages, setSavedPages] = useState(initialPages);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [savedPayload, setSavedPayload] = useState(initialPayload);
  const dirty = JSON.stringify(payload) !== JSON.stringify(savedPayload) || JSON.stringify(pageIds) !== JSON.stringify(savedPages);
  const fields = Object.fromEntries(Object.entries(blockRegistry[block.type].fields).filter(([key]) => block.editableFields.includes(key)).map(([key, value]) => [key, { ...value, ...(block.limits?.[key] !== undefined ? { max: block.limits[key] } : {}) }]));
  return <section className={styles.card} aria-labelledby={`${block.id}-title-heading`}>
    <h2 id={`${block.id}-title-heading`}>{block.label}</h2>
    {block.type === "contact" || block.type === "footer" ? <p>Contact details and social links come from Contact / Business Info.</p> : null}
    {block.type === "coupon" ? <p>The code is displayed on your site. Configure redemption with your store provider.</p> : null}
    <form onSubmit={async event => {
      event.preventDefault(); setPending(true); setMessage("");
      try {
        const result = await saveStudioBlock({ id: block.id, revision, payload: Object.fromEntries(block.editableFields.map(key => [key, payload[key]])), pageIds });
        setError(Boolean(result.error)); setMessage(result.error || "Saved.");
        if (result.revision !== undefined) { setRevision(result.revision); setSavedPayload(payload); setSavedPages(pageIds); }
      } catch { setError(true); setMessage("Could not save. Your edits are still here."); }
      finally { setPending(false); }
    }}>
      <fieldset disabled={pending} className={styles.fields}>
        <VisualBlock block={block} choices={choices} payload={payload} fields={fields} canUpload={canUpload} onChange={setPayload} />
        {block.allowPageTargeting ? <fieldset><legend>Show on pages</legend>{pages.filter(page => block.pageIds.includes(page.id)).map(page => <label key={page.id} className={styles.check}><input type="checkbox" checked={pageIds.includes(page.id)} onChange={event => setPageIds(current => event.target.checked ? [...current, page.id] : current.filter(id => id !== page.id))} />{page.label}</label>)}</fieldset> : null}
        {dirty ? <div className={styles.saveBar}><span>Unpublished changes</span><button type="button" onClick={() => { setPayload(savedPayload); setPageIds(savedPages); setMessage(""); }}>Discard</button><button type="submit">{pending ? "Publishing…" : "Publish changes"}</button></div> : null}
      </fieldset>
      <p role={error ? "alert" : "status"} aria-live="polite">{message}</p>
    </form>
  </section>;
}

export function Fields({ canUpload = false, fields, limits, minimums, value, prefix, onChange, choices = [] }: { canUpload?: boolean; fields: Record<string, Field>; limits?: Record<string, number>; minimums?: Record<string, number>; value: Record<string, unknown>; prefix: string; onChange: (next: Record<string, unknown>) => void; choices?: Choice[] }) {
  return <>{Object.entries(fields).map(([key, field]) => {
    const id = `${prefix}-${key}`;
    const update = (next: unknown) => onChange({ ...value, [key]: next });
    if (field.kind === "checkbox") return <label className={styles.check} key={key} htmlFor={id}><input type="checkbox" id={id} checked={Boolean(value[key])} onChange={event => update(event.target.checked)} />{field.label}</label>;
    if (field.kind === "list") {
      const rows = (value[key] || []) as Record<string, unknown>[];
      const maximum = limits?.[key] ?? field.max ?? 12;
      const minimum = minimums?.[key] ?? 0;
      return <fieldset key={key} className={styles.list}><legend>{field.label}</legend>
        {rows.map((row, index) => <div key={String(row.id)} className={styles.item}>
          <Fields canUpload={canUpload} fields={field.fields!} value={row} prefix={`${id}-${row.id}`} choices={choices} onChange={next => update(rows.map((current, i) => i === index ? next : current))} />
          <button type="button" disabled={rows.length <= minimum} onClick={() => update(rows.filter((_, i) => i !== index))}>Remove {field.label.toLowerCase()} item {index + 1}</button>
        </div>)}
        {minimum > 0 ? <small>Keep at least {minimum} {field.label.toLowerCase()}.</small> : null}
        <button type="button" disabled={rows.length >= maximum} onClick={() => update([...rows, { id: crypto.randomUUID(), ...emptyFields(field.fields!) }])}>Add {field.label.toLowerCase()}</button>
      </fieldset>;
    }
    if (key === "referenceId") return <label key={key} htmlFor={id}>Item<select id={id} value={String(value[key] || "")} onChange={event => update(event.target.value)}><option value="">Select an item</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>;
    const media = key === "imageUrl" || (key === "url" && "alt" in fields);
    return <div key={key} className={styles.field}><label htmlFor={id}>{field.label}</label>
      {field.kind === "richtext" ? <RichText id={id} value={String(value[key] || "")} maxLength={field.max} onChange={update} /> : field.kind === "multiline" ? <textarea id={id} rows={4} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} /> : <input id={id} type={field.kind === "email" ? "email" : "text"} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} />}
      {media ? <StudioMediaPicker
        canUpload={canUpload}
        context={prefix}
        defaultAlt={String(value.alt || value.imageAlt || "Website image")}
        onSelect={(asset) => {
          const next: Record<string, unknown> = { ...value, [key]: asset.url || asset.thumbnailUrl };
          if ("alt" in fields && !String(value.alt || "").trim()) next.alt = asset.alt;
          if ("imageAlt" in fields && !String(value.imageAlt || "").trim()) next.imageAlt = asset.alt;
          onChange(next);
        }}
      /> : null}
    </div>;
  })}</>;
}

function StudioMediaPicker({ canUpload, context, defaultAlt, onSelect }: { canUpload: boolean; context: string; defaultAlt: string; onSelect: (asset: AssetPickerAsset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("alt", defaultAlt);
    formData.set("context", context);
    try {
      const result = await uploadStudioAsset(formData);
      if (result.asset) {
        onSelect(result.asset);
        setMessage(`${result.asset.filename} uploaded and selected.`);
      } else {
        setMessage(result.error || "Image upload failed.");
      }
    } catch {
      setMessage("Image upload failed.");
    } finally {
      fileInput.value = "";
      setUploading(false);
    }
  }

  return <div className={styles.mediaPicker}>
    <AssetPicker
      assets={[]}
      canUpload={canUpload && !uploading}
      loadFromServer
      onSelectAsset={onSelect}
      onUploadRequest={() => input.current?.click()}
      title="Choose an image"
      triggerClassName="ui-button ui-button-secondary ui-button-sm"
    >
      <ImageIcon aria-hidden="true" size={15} />
      {uploading ? "Uploading…" : "Choose or upload image"}
    </AssetPicker>
    <input accept="image/*" className="ui-hidden" onChange={handleUpload} ref={input} type="file" />
    {message ? <small aria-live="polite">{message}</small> : null}
  </div>;
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
