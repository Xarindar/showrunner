"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon, Plus } from "lucide-react";
import { imageFirst, type LinkOptions } from "./field-layout";
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

export function Fields({ canUpload = false, fixedRows = false, assetBaseUrl, linkOptions, fields, limits, minimums, value, prefix, onChange, choices = [] }: { canUpload?: boolean; fixedRows?: boolean; assetBaseUrl?: string; linkOptions?: LinkOptions; fields: Record<string, Field>; limits?: Record<string, number>; minimums?: Record<string, number>; value: Record<string, unknown>; prefix: string; onChange: (next: Record<string, unknown>) => void; choices?: Choice[] }) {
  return <>{imageFirst(fields).map(([key, field]) => {
    const buttonPairs: Record<string, string> = { buttonLabel: "buttonHref", ctaLabel: "ctaHref", label: "href" };
    if (linkOptions && Object.entries(buttonPairs).some(([label, href]) => key === href && fields[label])) return null;
    if (linkOptions && buttonPairs[key] && fields[buttonPairs[key]]) {
      const href = buttonPairs[key];
      return <div className={styles.buttonSettings} key={key}><h3>Button</h3><Fields fields={{ [key]: { ...field, label: "Title" } }} prefix={prefix} value={value} onChange={onChange} /><DestinationField id={`${prefix}-${href}`} value={String(value[href] || "")} options={linkOptions} onChange={next => onChange({ ...value, [href]: next })} /></div>;
    }
    const id = `${prefix}-${key}`;
    const update = (next: unknown) => onChange({ ...value, [key]: next });
    if (field.kind === "checkbox") return <label className={styles.check} key={key} htmlFor={id}><input type="checkbox" id={id} checked={Boolean(value[key])} onChange={event => update(event.target.checked)} />{field.label}</label>;
    if (field.kind === "list") {
      const rows = (value[key] || []) as Record<string, unknown>[];
      const maximum = limits?.[key] ?? field.max ?? 12;
      const minimum = minimums?.[key] ?? 0;
      return <div key={key} className={styles.contentList}>
        {key !== "slides" && <h3>{field.label}</h3>}
        {rows.map((row, index) => <details key={String(row.id)} className={styles.contentGroup} open onFocusCapture={() => { if (key === "slides") window.dispatchEvent(new CustomEvent("showrunner:focus-item", { detail: { id: row.id } })); }} onClick={() => { if (key === "slides") window.dispatchEvent(new CustomEvent("showrunner:focus-item", { detail: { id: row.id } })); }}>
          <summary>{key === "slides" ? `Header ${index + 1}` : String(row.name || row.title || row.author || row.question || `${field.label === "Images" ? "Image" : "Item"} ${index + 1}`)}</summary>
          <div className={styles.groupFields}><Fields canUpload={canUpload} assetBaseUrl={assetBaseUrl} linkOptions={linkOptions} fields={field.fields!} value={row} prefix={`${id}-${row.id}`} choices={choices} onChange={next => update(rows.map((current, i) => i === index ? next : current))} />
          {!fixedRows && <button className={styles.removeItem} type="button" disabled={rows.length <= minimum} onClick={() => update(rows.filter((_, i) => i !== index))}>Remove {key === "slides" ? "header" : "item"}</button>}</div>
        </details>)}
        {!fixedRows && <button className={styles.addContent} type="button" disabled={rows.length >= maximum} onClick={() => update([...rows, { id: crypto.randomUUID(), ...emptyFields(field.fields!) }])}><Plus size={16} aria-hidden="true" />Add {field.label === "Header" ? "header" : field.label.toLowerCase()}</button>}
      </div>;
    }
    if (key === "referenceId") return <label key={key} htmlFor={id}>Item<select id={id} value={String(value[key] || "")} onChange={event => update(event.target.value)}><option value="">Select an item</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>;
    const media = key === "imageUrl" || (key === "url" && "alt" in fields);
    const source = String(value[key] || "");
    const preview = media && source && assetBaseUrl && !source.startsWith("/") ? new URL(source, assetBaseUrl).toString() : source;
    return <div key={key} className={styles.field}>{media ? <span>Image</span> : <label htmlFor={id}>{field.label}</label>}
      {media ? <StudioMediaPicker canUpload={canUpload} context={prefix} preview={preview} defaultAlt={String(value.alt || value.imageAlt || "Website image")} onSelect={asset => {
        const next: Record<string, unknown> = { ...value, [key]: asset.url || asset.thumbnailUrl };
        if ("alt" in fields && !String(value.alt || "").trim()) next.alt = asset.alt;
        if ("imageAlt" in fields && !String(value.imageAlt || "").trim()) next.imageAlt = asset.alt;
        onChange(next);
      }} /> : field.kind === "richtext" ? <RichText id={id} value={String(value[key] || "")} maxLength={field.max} onChange={update} /> : field.kind === "multiline" ? <textarea id={id} rows={3} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} /> : <input id={id} type={field.kind === "email" ? "email" : "text"} maxLength={field.max} value={source} onChange={event => update(event.target.value)} />}
    </div>;
  })}</>;
}

function DestinationField({ id, value, options, onChange }: { id: string; value: string; options: LinkOptions; onChange: (value: string) => void }) {
  const infer = (href: string) => options.services.some(service => service.href === href) ? "service" : !href || options.pages.some(page => new URL(href, "https://site.invalid").pathname === page.path) ? "page" : "url";
  const [kind, setKind] = useState(() => infer(value));
  const selectedKind = value ? infer(value) : kind;
  return <><label htmlFor={`${id}-type`}>Link to<select id={`${id}-type`} value={selectedKind} onChange={event => { setKind(event.target.value); onChange(""); }}><option value="page">Page</option>{options.services.length > 0 && <option value="service">Service</option>}<option value="url">Web address</option></select></label>
    {selectedKind === "url" ? <label htmlFor={id}>Web address<input id={id} value={value} onChange={event => onChange(event.target.value)} /></label> : <label htmlFor={id}>{selectedKind === "service" ? "Service" : "Page"}<select id={id} value={value} onChange={event => onChange(event.target.value)}><option value="">Choose {selectedKind === "service" ? "a service" : "a page"}</option>{(selectedKind === "service" ? options.services.map(service => ({ label: service.label, value: service.href })) : options.pages.map(page => ({ label: page.label, value: page.path }))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}{value && !(selectedKind === "service" ? options.services.some(service => service.href === value) : options.pages.some(page => page.path === value)) && <option value={value}>Current destination</option>}</select></label>}
    {selectedKind === "service" && <small>Opens booking at this service’s next available date.</small>}
  </>;
}

function StudioMediaPicker({ canUpload, context, defaultAlt, preview, onSelect }: { canUpload: boolean; context: string; defaultAlt: string; preview: string; onSelect: (asset: AssetPickerAsset) => void }) {
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
      triggerClassName={styles.imageTrigger}
    >
      <span className={styles.mediaPreview} style={{ backgroundImage: preview ? `url(${JSON.stringify(preview)})` : undefined }}>{!preview && <ImageIcon aria-hidden="true" size={30} />}</span>
      <span className={`${styles.imageHint} ${!preview ? styles.emptyImageHint : ""}`}>{uploading ? "Uploading…" : "Choose or upload"}</span>
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
