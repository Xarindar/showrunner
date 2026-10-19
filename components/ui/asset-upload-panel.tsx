"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadLibraryAsset } from "@/modules/media/actions";
import { uploadImageQueue } from "@/lib/media-upload-queue";
import type { AssetPickerAsset } from "./asset-picker";
import { Button } from "./button";
import { UploadField } from "./upload-field";
import styles from "./asset-upload-panel.module.css";

export type AssetUploadAction = (data: FormData) => Promise<{ asset?: AssetPickerAsset; error?: string }>;
type QueuedImage = { key: string; file: File; alt: string; status: "queued" | "uploading" | "uploaded" | "error"; error?: string };

export function AssetUploadPanel({ canUpload, defaultFolder = "", folders = [], defaultAlt = "", initialFiles = [], showMetadata = false, uploadAction = uploadLibraryAsset, onBusyChange, onDone }: {
  canUpload: boolean; defaultFolder?: string; folders?: string[]; defaultAlt?: string; initialFiles?: File[]; showMetadata?: boolean; uploadAction?: AssetUploadAction;
  onBusyChange: (busy: boolean) => void; onDone: (assets: AssetPickerAsset[]) => void;
}) {
  const router = useRouter();
  const toImage = (file: File): QueuedImage => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file, alt: defaultAlt, status: "queued" });
  const [images, setImages] = useState<QueuedImage[]>(() => initialFiles.slice(0, 50).map(toImage));
  const [busy, setBusy] = useState(false);
  const [decorative, setDecorative] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const saved = useRef<AssetPickerAsset[]>([]);
  const active = useRef(true);
  const uploading = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const pending = images.filter(image => image.status === "queued" || image.status === "error");

  function addFiles(files: FileList | null) {
    if (!files || uploading.current) return;
    const incoming = Array.from(files).map(file => ({ ...toImage(file), alt: files.length === 1 ? defaultAlt : "" }));
    setImages(current => Array.from(new Map([...current, ...incoming.filter(image => !current.some(existing => existing.key === image.key))].map(image => [image.key, image])).values()).slice(0, 50));
    setNotice("You can queue up to 50 images. Each image uploads separately, up to 12 MB each.");
  }

  async function submit() {
    if (uploading.current || !canUpload || !pending.length) return;
    const inputs = Array.from(panel.current?.querySelectorAll<HTMLInputElement>("input") || []);
    if (inputs.some(input => !input.disabled && !input.reportValidity())) return;
    const metadata = new FormData();
    for (const input of inputs) {
      if (input.name && !input.disabled && input.type !== "file" && (input.type !== "checkbox" || input.checked)) metadata.append(input.name, input.value);
    }
    uploading.current = true;
    setBusy(true); onBusyChange(true); setNotice("");
    try {
      await uploadImageQueue(pending, async image => {
        setImages(current => current.map(row => row.key === image.key ? { ...row, status: "uploading", error: undefined } : row));
        const data = new FormData();
        for (const [key, value] of metadata) data.append(key, value);
        data.set("file", image.file); data.set("alt", image.alt);
        const result = await uploadAction(data);
        if (result.asset) saved.current.push(result.asset);
        return { error: result.error || (!result.asset ? "The image was not saved. Try again." : undefined) };
      }, (image, error) => {
        if (active.current) setImages(current => current.map(row => row.key === image.key ? { ...row, status: error ? "error" : "uploaded", error } : row));
      }, () => active.current);
    } finally {
      uploading.current = false;
      if (active.current) { setBusy(false); onBusyChange(false); router.refresh(); }
    }
  }

  return <div className={styles.panel} ref={panel}>
    <div className={styles.scroll}>
      <UploadField form="" accept="image/*" disabled={!canUpload || busy} disabledMessage={busy ? "Uploading this batch. You can add more images when it finishes." : undefined} label="Drop images here, or choose files" description="Select multiple images · up to 12 MB per image" multiple name="pickedFiles" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      {!canUpload && <p role="status">Uploads are temporarily unavailable. Please try again later or contact support.</p>}
      {notice && <p role="status">{notice}</p>}
      {showMetadata && <fieldset className={styles.metadata} disabled={busy}>
        <legend>Apply to these uploads</legend>
        <label>Folder<input form="" name="folder" defaultValue={defaultFolder} list="upload-folder-options" placeholder="Choose or enter a folder" /></label>
        <datalist id="upload-folder-options">{folders.map(folder => <option key={folder} value={folder} />)}</datalist>
        <label>Tags<input form="" name="tags" placeholder="venue, banner" /></label>
        <label className={styles.check}><input form="" checked={decorative} name="isDecorative" onChange={event => setDecorative(event.target.checked)} type="checkbox" />These images are decorative</label>
        <label className={styles.check}><input form="" name="isPrivate" type="checkbox" />Private — require signed delivery</label>
      </fieldset>}
      <ul className={styles.queue} aria-label="Images to upload">
        {images.map(image => <li key={image.key}>
          <div className={styles.rowHead}><strong>{image.file.name}</strong><span>{image.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(image.file.size / 1024))} KB` : `${(image.file.size / 1024 / 1024).toFixed(1)} MB`}</span>
            {image.status !== "uploaded" && <Button aria-label={`Remove ${image.file.name}`} disabled={busy} onClick={() => setImages(current => current.filter(row => row.key !== image.key))} size="sm" type="button" variant="ghost">Remove</Button>}</div>
          {image.status !== "uploaded" && <label>Image description<input form="" aria-label={`Image description for ${image.file.name}`} disabled={busy || decorative} onChange={event => setImages(current => current.map(row => row.key === image.key ? { ...row, alt: event.target.value } : row))} placeholder="Describe this image for people who cannot see it" required={!decorative} value={image.alt} /></label>}
          <small className={image.error ? styles.error : undefined}>{image.error || (image.status === "uploaded" ? "Uploaded to your library" : image.status === "uploading" ? "Uploading…" : "Ready to upload")}</small>
        </li>)}
      </ul>
    </div>
    <footer className={styles.footer}>
      <p role="status">{images.length ? `${images.filter(image => image.status === "uploaded").length} of ${images.length} uploaded${busy ? " — uploading…" : ""}` : "Choose or drop images to get started"}</p>
      <div className="module-modal-actions"><Button disabled={busy} onClick={() => onDone(saved.current)} size="sm" type="button" variant="ghost">{images.some(image => image.status === "uploaded") ? "Done" : "Back"}</Button>
      <Button disabled={!canUpload || busy || !pending.length} onClick={submit} size="sm" type="button">{busy ? "Uploading…" : `${pending.length && pending.every(image => image.status === "error") ? "Retry" : "Upload"} ${pending.length || ""} ${pending.length === 1 ? "image" : "images"}`}</Button></div>
    </footer>
  </div>;
}
