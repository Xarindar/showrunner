"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Film, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { uploadLibraryAsset } from "@/modules/media/actions";
import { uploadImageQueue } from "@/lib/media-upload-queue";
import type { AssetPickerAsset } from "./asset-picker";
import { Button } from "./button";
import styles from "./asset-upload-panel.module.css";

export type AssetUploadAction = (data: FormData) => Promise<{ asset?: AssetPickerAsset; error?: string }>;
type QueuedImage = { key: string; file: File; alt: string; status: "queued" | "uploading" | "uploaded" | "error"; error?: string };

function UploadThumbnail({ file }: { file: File }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => { if (file.type.startsWith("video/")) return; const url = URL.createObjectURL(file); if (preview.current) preview.current.src = url; return () => URL.revokeObjectURL(url); }, [file]);
  // eslint-disable-next-line @next/next/no-img-element -- The browser owns and releases this local file preview.
  return <span className={styles.thumbnail}>{file.type.startsWith("video/") ? <Film aria-hidden="true" size={28} /> : <img ref={preview} alt="" width={64} height={64} />}</span>
}

export function AssetUploadPanel({ canUpload, allowVideo = false, defaultFolder = "", folders = [], defaultAlt = "", initialFiles = [], showMetadata = false, uploadAction = uploadLibraryAsset, onBusyChange, onDone }: {
  canUpload: boolean; allowVideo?: boolean; defaultFolder?: string; folders?: string[]; defaultAlt?: string; initialFiles?: File[]; showMetadata?: boolean; uploadAction?: AssetUploadAction;
  onBusyChange: (busy: boolean) => void; onDone: (assets: AssetPickerAsset[]) => void;
}) {
  const router = useRouter();
  const toImage = (file: File): QueuedImage => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file, alt: defaultAlt, status: "queued" });
  const [images, setImages] = useState<QueuedImage[]>(() => initialFiles.slice(0, 50).map(toImage));
  const [busy, setBusy] = useState(false);
  const [decorative, setDecorative] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const saved = useRef<AssetPickerAsset[]>([]);
  const active = useRef(true);
  const uploading = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const pending = images.filter(image => image.status === "queued" || image.status === "error");

  function addFiles(files: FileList | null) {
    if (!files || uploading.current) return;
    if (!allowVideo && Array.from(files).some(file => !file.type.startsWith("image/"))) { setNotice("Choose image files for this image field."); return; }
    const incoming = Array.from(files).map(file => ({ ...toImage(file), alt: files.length === 1 ? defaultAlt : "" }));
    const combined = [...images, ...incoming.filter(image => !images.some(existing => existing.key === image.key))];
    setImages(Array.from(new Map(combined.map(image => [image.key, image])).values()).slice(0, 50));
    setNotice(combined.length > 50 ? "The first 50 files were added. Upload this batch before adding more." : "");
  }

  async function submit() {
    if (uploading.current || !canUpload || !pending.length) return;
    if (!allowVideo && pending.some(row => !row.file.type.startsWith("image/"))) { setNotice("Choose image files for this image field."); return; }
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
        return { error: result.error || (!result.asset ? "The file was not saved. Try again." : undefined) };
      }, (image, error) => {
        if (active.current) setImages(current => current.map(row => row.key === image.key ? { ...row, status: error ? "error" : "uploaded", error } : row));
      }, () => active.current);
    } finally {
      uploading.current = false;
      if (active.current) { setBusy(false); onBusyChange(false); router.refresh(); }
    }
  }

  return <div className={`${styles.panel} ${dragging ? styles.dragging : ""}`} ref={panel}
    onDragOver={event => { if (canUpload && !busy && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (canUpload && !busy) addFiles(event.dataTransfer.files); }}>
    <div className={styles.scroll}>
      {!showMetadata && defaultFolder && <input form="" type="hidden" name="folder" value={defaultFolder} />}
      <input ref={fileInput} form="" type="file" className="ui-sr-only" aria-label={allowVideo ? "Choose images or videos to upload" : "Choose images to upload"} accept={allowVideo ? "image/*,video/mp4,video/webm,video/quicktime" : "image/*"} disabled={!canUpload || busy} multiple onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <div className={styles.toolbar}>
        <Button disabled={!canUpload || busy} onClick={() => fileInput.current?.click()} type="button" variant="secondary"><Upload aria-hidden="true" size={16} />{images.length ? "Add files" : "Choose files"}</Button>
        <p>{dragging ? "Drop to add these files" : allowVideo ? "Images up to 12 MB · MP4, WebM, MOV up to 25 MB" : "or drop images here · up to 12 MB each"}</p>
      </div>
      {!canUpload && <p role="status">Uploads are temporarily unavailable. Please try again later or contact support.</p>}
      {notice && <p role="status">{notice}</p>}
      {showMetadata && <details className={styles.settings}><summary>Upload settings</summary><fieldset className={styles.metadata} disabled={busy}>
        <legend>Apply to these uploads</legend>
        <label>Folder<input form="" name="folder" defaultValue={defaultFolder} list="upload-folder-options" placeholder="Choose or enter a folder" /></label>
        <datalist id="upload-folder-options">{folders.map(folder => <option key={folder} value={folder} />)}</datalist>
        <label>Tags<input form="" name="tags" placeholder="venue, banner" /></label>
        <label className={styles.check}><input form="" checked={decorative} name="isDecorative" onChange={event => setDecorative(event.target.checked)} type="checkbox" />These images are decorative</label>
        <label className={styles.check}><input form="" name="isPrivate" type="checkbox" />Private — require signed delivery</label>
      </fieldset></details>}
      <ul className={styles.queue} aria-label={allowVideo ? "Files to upload" : "Images to upload"}>
        {images.map(image => <li key={image.key}>
          <UploadThumbnail file={image.file} />
          <div className={styles.fileDetails}>
          <div className={styles.rowHead}><strong>{image.file.name}</strong><span>{image.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(image.file.size / 1024))} KB` : `${(image.file.size / 1024 / 1024).toFixed(1)} MB`}</span>
            {image.status !== "uploaded" && <Button aria-label={`Remove ${image.file.name}`} disabled={busy} onClick={() => setImages(current => current.filter(row => row.key !== image.key))} size="sm" type="button" variant="ghost"><X aria-hidden="true" size={16} /></Button>}</div>
          {image.status !== "uploaded" && !image.file.type.startsWith("video/") && <label className={styles.description}><span className="ui-sr-only">Image description</span><input form="" aria-label={`Image description for ${image.file.name}`} disabled={busy || decorative} onChange={event => setImages(current => current.map(row => row.key === image.key ? { ...row, alt: event.target.value } : row))} placeholder="Describe the image for accessibility" required={!decorative} value={image.alt} /></label>}
          <small className={image.error ? styles.error : styles.fileStatus}>{image.status === "uploaded" && <Check aria-hidden="true" size={14} />}{image.error || (image.status === "uploaded" ? "Uploaded" : image.status === "uploading" ? "Uploading…" : "Ready to upload")}</small>
          </div>
        </li>)}
      </ul>
    </div>
    <footer className={styles.footer}>
      <p role="status">{images.length ? `${images.filter(image => image.status === "uploaded").length} of ${images.length} uploaded${busy ? " — uploading…" : ""}` : `Select up to 50 ${allowVideo ? "files" : "images"}`}</p>
      <div className="module-modal-actions"><Button disabled={busy} onClick={() => onDone(saved.current)} size="sm" type="button" variant={images.length > 0 && !pending.length ? "primary" : "ghost"}>{images.some(image => image.status === "uploaded") ? "Done" : "Back"}</Button>
      {(pending.length > 0 || !images.length) && <Button disabled={!canUpload || busy || !pending.length} onClick={submit} size="sm" type="button">{busy ? "Uploading…" : `${pending.length && pending.every(image => image.status === "error") ? "Retry" : "Upload"} ${pending.length || ""} ${allowVideo ? pending.length === 1 ? "file" : "files" : pending.length === 1 ? "image" : "images"}`}</Button>}</div>
    </footer>
  </div>;
}
