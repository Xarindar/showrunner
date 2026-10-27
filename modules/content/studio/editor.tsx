"use client";

import { TimeInput } from "@/components/ui/time-input";

import { useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Plus } from "lucide-react";
import { destinationKind, imageFirst, type LinkOptions } from "./field-layout";
import { AssetPicker, type AssetPickerAsset } from "@/components/ui/asset-picker";
import { emptyFields, type Field } from "./registry";
import { uploadStudioAsset } from "./actions";
import styles from "./studio.module.css";
import { renderContentRichText } from "./rich-text";
import { HeaderFrameRatios, ImageFramingControl } from "./image-framing-control";
import { ServicePicker } from "./service-picker";
import { centeredFraming, framingImageSource, readImageFraming } from "./image-framing";

export type Choice = { group?: string; tags?: string[]; framingUrl?: string; imageFraming?: unknown; catalog?: import("./showcase").CatalogCard; description?: string; id: string; imageUrl?: string; label: string };
export function Fields({ headerId, canUpload = false, fixedRows = false, assetBaseUrl, linkOptions, fields, limits, minimums, value, prefix, onChange, choices = [] }: { headerId?: string; canUpload?: boolean; fixedRows?: boolean; assetBaseUrl?: string; linkOptions?: LinkOptions; fields: Record<string, Field>; limits?: Record<string, number>; minimums?: Record<string, number>; value: Record<string, unknown>; prefix: string; onChange: (next: Record<string, unknown>) => void; choices?: Choice[] }) {
  const ratios = useContext(HeaderFrameRatios);
  const [framingField, setFramingField] = useState<string | null>(null);
  return <>{imageFirst(fields).map(([key, field]) => {
    const buttonPairs: Record<string, string> = { buttonLabel: "buttonHref", ctaLabel: "ctaHref", label: "href" };
    if (linkOptions && Object.entries(buttonPairs).some(([label, href]) => key === href && fields[label])) return null;
    if (linkOptions && key === "buttonAlignment" && fields.buttonLabel && fields.buttonHref) return null;
    if (linkOptions && buttonPairs[key] && fields[buttonPairs[key]]) {
      const href = buttonPairs[key];
      return <div className={styles.buttonSettings} key={key}><h3>Button</h3><Fields fields={{ [key]: { ...field, label: "Title" }, ...(key === "buttonLabel" && fields.buttonAlignment ? { buttonAlignment: fields.buttonAlignment } : {}) }} prefix={prefix} value={value} onChange={onChange} /><DestinationField id={`${prefix}-${href}`} value={String(value[href] || "")} options={linkOptions} onChange={next => onChange({ ...value, [href]: next })} /></div>;
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
          <div className={styles.groupFields}><Fields headerId={headerId} canUpload={canUpload} assetBaseUrl={assetBaseUrl} linkOptions={linkOptions} fields={field.fields!} value={row} prefix={`${id}-${row.id}`} choices={choices} onChange={next => update(rows.map((current, i) => i === index ? next : current))} />
          {!fixedRows && <Button variant="secondary" className={styles.removeItem} type="button" disabled={rows.length <= minimum} onClick={() => update(rows.filter((_, i) => i !== index))}>Remove {key === "slides" ? "header" : field.label === "Team member" ? "team member" : "item"}</Button>}</div>
        </details>)}
        {!fixedRows && <Button variant="secondary" className={styles.addContent} type="button" disabled={rows.length >= maximum} onClick={() => update([...rows, { id: crypto.randomUUID(), ...emptyFields(field.fields!) }])}><Plus size={16} aria-hidden="true" />Add {field.label === "Header" ? "header" : field.label.toLowerCase()}</Button>}
      </div>;
    }
    if (field.options) return <label key={key} htmlFor={id}>{field.label}<select id={id} value={String(value[key] || "")} onChange={event => update(event.target.value)}><option value="">Site default</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
    if (key === "catalogKey" || key === "referenceId") return <div className={styles.field} key={key}><span>{key === "catalogKey" ? "Service or product" : "Service"}</span><ServicePicker title={key === "catalogKey" ? "Pick service or product" : "Pick service"} value={String(value[key] || "")} options={choices.map(choice => ({ ...choice, imageUrl: choice.imageUrl || choice.catalog?.imageUrl, imageFraming: choice.imageFraming || choice.catalog?.imageFraming }))} onChange={update} /></div>;
    const media = key === "imageUrl" || (key === "url" && "alt" in fields);
    const servicePhoto = media && ("referenceId" in fields || "catalogKey" in fields);
    const choice = servicePhoto ? choices.find(choice => choice.id === (value.referenceId || value.catalogKey)) : undefined;
    const inherited = servicePhoto && value.imageSource !== "custom" && !value[key];
    const source = String(value[key] || (inherited ? (choice?.imageUrl || choice?.catalog?.imageUrl) : "") || "");
    const preview = media && source && assetBaseUrl && !source.startsWith("/") ? new URL(source, assetBaseUrl).toString() : source;
    return <div key={key} id={`${id}-field`} className={styles.field}>{media ? <span>Image</span> : <label htmlFor={id}>{field.label}</label>}
      {media && ("referenceId" in fields || "catalogKey" in fields) && <label htmlFor={`${id}-source`}>Photo source<select id={`${id}-source`} value={inherited ? "service" : "custom"} onChange={event => onChange({ ...value, imageSource: event.target.value, useServiceFraming: true, [key]: "", ...centeredFraming })}><option value="service">Booking card photo</option><option value="custom">Choose or upload a photo</option></select></label>}
      {media ? <StudioMediaPicker canUpload={canUpload} context={prefix} preview={inherited && value.useServiceFraming === false ? choice?.framingUrl || choice?.catalog?.framingUrl || preview : preview} ratio={ratios[headerId || prefix]} framing={readImageFraming(inherited && value.useServiceFraming !== false ? choice?.imageFraming || choice?.catalog?.imageFraming : value)} defaultAlt={String(value.alt || value.imageAlt || "Website image")} onSelect={asset => {
        const next: Record<string, unknown> = { ...value, [key]: framingImageSource(asset.url || asset.thumbnailUrl), ...(servicePhoto ? { imageSource: "custom", useServiceFraming: false } : {}), ...centeredFraming };
        if ("alt" in fields && !String(value.alt || "").trim()) next.alt = asset.alt;
        if ("imageAlt" in fields && !String(value.imageAlt || "").trim()) next.imageAlt = asset.alt;
        onChange(next);
        setFramingField(id);
      }} /> : field.kind === "time" ? <TimeInput id={id} value={String(value[key] || "")} onValueChange={update} /> : field.kind === "richtext" ? <RichText id={id} value={String(value[key] || "")} maxLength={field.max} onChange={update} /> : field.kind === "multiline" ? <textarea id={id} rows={3} maxLength={field.max} value={String(value[key] || "")} onChange={event => update(event.target.value)} /> : <input id={id} type={field.kind === "email" ? "email" : "text"} maxLength={field.max} value={source} onChange={event => update(event.target.value)} />}
      {media && <ImageFramingControl open={framingField === id} onOpenChange={open => setFramingField(open ? id : null)} source={inherited ? choice?.framingUrl || choice?.catalog?.framingUrl || preview : preview} blockId={headerId || prefix} value={inherited && value.useServiceFraming !== false ? readImageFraming(choice?.imageFraming || choice?.catalog?.imageFraming) : value} onChange={framing => onChange({ ...value, [key]: inherited ? "" : framingImageSource(source), ...(servicePhoto ? { useServiceFraming: false } : {}), ...framing })} />}
    </div>;
  })}</>;
}

function DestinationField({ id, value, options, onChange }: { id: string; value: string; options: LinkOptions; onChange: (value: string) => void }) {
  const [selection, setSelection] = useState(() => ({ value, kind: destinationKind(value, options) as string, authored: null as string | null }));
  if (selection.value !== value) setSelection({ ...selection, value, kind: selection.authored === value ? selection.kind : destinationKind(value, options) });
  const selectedKind = selection.kind;
  function edit(next: string, kind = selectedKind) {
    setSelection({ value, kind, authored: next });
    onChange(next);
  }
  return <><label htmlFor={`${id}-type`}>Link to<select id={`${id}-type`} value={selectedKind} onChange={event => { edit("", event.target.value); }}><option value="page">Page</option>{options.services.length > 0 && <option value="service">Service</option>}<option value="url">Web address</option></select></label>
    {selectedKind === "service" ? <ServicePicker value={value} options={options.services.map(service => ({ ...service, id: service.href }))} onChange={edit} /> : selectedKind === "url" ? <label htmlFor={id}>Web address<input id={id} value={value} onChange={event => edit(event.target.value)} /></label> : <label htmlFor={id}>Page<select id={id} value={value} onChange={event => edit(event.target.value)}><option value="">Choose a page</option>{options.pages.map(page => <option key={page.path} value={page.path}>{page.label}</option>)}{value && !options.pages.some(page => page.path === value) && <option value={value}>Current destination</option>}</select></label>}
    {selectedKind === "service" && <small>Opens booking at this service’s next available date.</small>}
  </>;
}

function StudioMediaPicker({ canUpload, context, defaultAlt, preview, ratio, framing, onSelect }: { canUpload: boolean; context: string; defaultAlt: string; preview: string; ratio?: number; framing: ReturnType<typeof readImageFraming>; onSelect: (asset: AssetPickerAsset) => void }) {
  return <div className={styles.mediaPicker}>
    <AssetPicker assets={[]} canUpload={canUpload} loadFromServer onSelectAsset={onSelect} onUploadedAssets={assets => { if (assets[0]) onSelect(assets[0]); }}
      uploadAction={data => { data.set("context", context); return uploadStudioAsset(data); }} defaultAlt={defaultAlt}
      title="Choose an image" triggerClassName={styles.imageTrigger}>
      <span className={styles.mediaPreview} style={{ aspectRatio: ratio }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" style={{ objectPosition: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transformOrigin: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transform: `scale(${framing.imageZoom})` }} /> : <ImageIcon aria-hidden="true" size={30} />}
      </span>
      <span className={`${styles.imageHint} ${!preview ? styles.emptyImageHint : ""}`}>Choose or upload</span>
    </AssetPicker>
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
  return <><div role="group" aria-label="Text formatting"><Button variant="secondary" type="button" onClick={() => format("**", "**")}>Bold</Button> <Button variant="secondary" type="button" onClick={() => format("_", "_")}>Italic</Button> <Button variant="secondary" type="button" onClick={() => format("\n\n- ", "\n\n")}>Bullet</Button></div>
    <textarea ref={input} id={id} rows={5} maxLength={maxLength} value={value} onChange={event => onChange(event.target.value)} />
    <details><summary>Preview formatted text</summary><div dangerouslySetInnerHTML={{ __html: renderContentRichText(value) }} /></details></>;
}
