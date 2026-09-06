"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import { AssetPicker, type AssetPickerAsset } from "@/components/ui/asset-picker";
import { blockRegistry, emptyFields, type Field } from "./registry";
import type { ContentBlockConfig, ContentManifest } from "./manifest";
import { saveStudioBlock, uploadStudioAsset } from "./actions";
import styles from "./studio.module.css";
import { renderContentRichText } from "./rich-text";

export type Choice = { description?: string; id: string; imageUrl?: string; label: string };
export function StudioEditor({ block, canUpload = false, pages, initialPayload, initialRevision, initialPages, choices = [] }: {
  block: ContentBlockConfig; canUpload?: boolean; pages: ContentManifest["pages"]; initialPayload: Record<string, unknown>; initialRevision: number; initialPages: string[]; choices?: Choice[];
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
        <StudioBlockPreview block={block} choices={choices} payload={payload} />
        <Fields canUpload={canUpload} fields={fields} value={payload} prefix={block.id} onChange={setPayload} choices={choices} />
        {block.allowPageTargeting ? <fieldset><legend>Show on pages</legend>{pages.filter(page => block.pageIds.includes(page.id)).map(page => <label key={page.id} className={styles.check}><input type="checkbox" checked={pageIds.includes(page.id)} onChange={event => setPageIds(current => event.target.checked ? [...current, page.id] : current.filter(id => id !== page.id))} />{page.label}</label>)}</fieldset> : null}
        <button type="submit">{pending ? "Saving…" : "Save changes"}</button>
      </fieldset>
      <p role={error ? "alert" : "status"} aria-live="polite">{message}</p>
    </form>
  </section>;
}

export function Fields({ canUpload = false, fields, value, prefix, onChange, choices = [] }: { canUpload?: boolean; fields: Record<string, Field>; value: Record<string, unknown>; prefix: string; onChange: (next: Record<string, unknown>) => void; choices?: Choice[] }) {
  return <>{Object.entries(fields).map(([key, field]) => {
    const id = `${prefix}-${key}`;
    const update = (next: unknown) => onChange({ ...value, [key]: next });
    if (field.kind === "checkbox") return <label className={styles.check} key={key} htmlFor={id}><input type="checkbox" id={id} checked={Boolean(value[key])} onChange={event => update(event.target.checked)} />{field.label}</label>;
    if (field.kind === "list") {
      const rows = (value[key] || []) as Record<string, unknown>[];
      return <fieldset key={key} className={styles.list}><legend>{field.label}</legend>
        {rows.map((row, index) => <div key={String(row.id)} className={styles.item}>
          <Fields canUpload={canUpload} fields={field.fields!} value={row} prefix={`${id}-${row.id}`} choices={choices} onChange={next => update(rows.map((current, i) => i === index ? next : current))} />
          <button type="button" onClick={() => update(rows.filter((_, i) => i !== index))}>Remove {field.label.toLowerCase()} item {index + 1}</button>
        </div>)}
        <button type="button" disabled={rows.length >= (field.max ?? 12)} onClick={() => update([...rows, { id: crypto.randomUUID(), ...emptyFields(field.fields!) }])}>Add {field.label.toLowerCase()}</button>
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

function StudioBlockPreview({ block, choices, payload }: { block: ContentBlockConfig; choices: Choice[]; payload: Record<string, unknown> }) {
  if (block.presentation?.variant === "event-strip") {
    const rows = Array.isArray(payload.items) ? payload.items as { referenceId?: string }[] : [];
    const items = rows.map(row => choices.find(choice => choice.id === row.referenceId)).filter((choice): choice is Choice => Boolean(choice));
    const featureImage = previewMediaUrl(String(payload.imageUrl || ""), block.presentation.assetBaseUrl);
    return <section aria-label="Events panel preview" className={styles.eventPreview}>
      <div className={styles.eventFeature} style={featureImage ? { backgroundImage: `url("${featureImage.replace(/"/g, "%22")}")` } : undefined}><span>Events</span></div>
      <div className={styles.eventContent}>
        <div><h3>{String(payload.heading || "Events")}</h3><p>{String(payload.copy || "")}</p></div>
        <div className={styles.eventCards}>
          {[0, 1, 2].map(index => {
            const item = items[index];
            const imageUrl = previewMediaUrl(item?.imageUrl || "", block.presentation?.assetBaseUrl);
            return <article key={item?.id || `empty-${index}`}>
              <div className={styles.eventCardImage} style={imageUrl ? { backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")` } : undefined} />
              <strong>{item?.label || "Choose an event"}</strong>
              <p>{item?.description || "This slot will use the selected service details."}</p>
              <span>Book now</span>
            </article>;
          })}
        </div>
      </div>
    </section>;
  }

  if (block.presentation?.variant === "image-strip") {
    const images = Array.isArray(payload.images) ? payload.images as { id?: string; url?: string; alt?: string }[] : [];
    return <section aria-label="Image carousel preview" className={styles.imageStripPreview}>
      {images.map((image, index) => {
        const imageUrl = previewMediaUrl(image.url || "", block.presentation?.assetBaseUrl);
        return <div aria-label={image.alt || `Carousel image ${index + 1}`} key={image.id || index} role="img" style={imageUrl ? { backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")` } : undefined} />;
      })}
    </section>;
  }

  return null;
}

function previewMediaUrl(value: string, assetBaseUrl?: string) {
  const url = value.trim();
  if (!url || /^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  if (!assetBaseUrl) return url;
  try { return new URL(url, assetBaseUrl).toString(); }
  catch { return url; }
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
