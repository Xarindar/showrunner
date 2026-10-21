"use client";

import { ImageFramingControl } from "@/modules/content/studio/image-framing-control";
import { readImageFraming } from "@/modules/content/studio/image-framing";
import { saveServiceImageFramingAction } from "../actions";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import { AssetPicker, Button, type AssetPickerAsset } from "@/components/ui";
import styles from "../service-editor.module.css";

export function BookingPhotoField({ assets, canUpload, imageAlt, imageUrl, framingUrl, imageFraming, updatedAt, serviceId, uploadFormId, attachFormId, removeFormId }: {
  assets: AssetPickerAsset[];
  canUpload: boolean;
  imageAlt: string;
  imageUrl: string;
  framingUrl?: string;
  imageFraming?: unknown;
  updatedAt: string;
  serviceId: string;
  uploadFormId: string;
  attachFormId: string;
  removeFormId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const framing = readImageFraming(imageFraming);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : "");
  }

  return <section aria-labelledby="booking-photo-title" className={styles.bookingPhoto}>
    <div className={styles.photoFieldHeading}>
      <h3 id="booking-photo-title">Booking photo</h3>
      {imageUrl && !file ? <Button aria-label="Remove booking photo" form={removeFormId} type="submit" variant="ghost" size="sm">Remove</Button> : null}
    </div>
    <p id="booking-photo-help" className={styles.photoHelp}>Clients see this photo when choosing this session on your booking page.</p>
    <input accept="image/*" aria-label="Upload booking photo" className="ui-sr-only" disabled={!canUpload} form={uploadFormId} name="file" onChange={event => chooseFile(event.currentTarget.files?.[0] || null)} ref={input} type="file" />
    <input form={uploadFormId} name="serviceId" type="hidden" value={serviceId} />
    <input form={uploadFormId} name="alt" type="hidden" value={imageAlt} />
    <div aria-describedby="booking-photo-help" className={styles.photoDropzone}
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        const dropped = event.dataTransfer.files[0];
        if (!canUpload || !dropped || !input.current) return;
        const transfer = new DataTransfer();
        transfer.items.add(dropped);
        input.current.files = transfer.files;
        chooseFile(dropped);
      }}>
      {preview || imageUrl ? <div style={{ width: 160, height: 160, overflow: "hidden", borderRadius: 12 }}><NextImage alt={file ? "Selected booking photo, not yet uploaded" : imageAlt} className={styles.photoPreview} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transformOrigin: `${framing.imagePositionX}% ${framing.imagePositionY}%`, transform: `scale(${framing.imageZoom})` }} width={160} height={160} src={preview || imageUrl} unoptimized /></div> : null}
      <div className={styles.photoActions}>
        <Button disabled={!canUpload} onClick={() => input.current?.click()} size="sm" type="button" variant="secondary">{file ? "Choose another" : "Upload new"}</Button>
        <AssetPicker assets={assets} attachFields={{ serviceId }} attachFormId={attachFormId} canUpload={canUpload} defaultAlt={imageAlt}
          title="Select booking photo" triggerClassName={styles.photoLibraryButton} uploadFields={{ serviceId }} uploadFormId={`${uploadFormId}-library`}
          uploadUnavailableMessage="Photo uploads are not configured. You can still choose from the library.">
          Select existing
        </AssetPicker>
      </div>
      <p className={styles.photoHelp}>{file ? file.name : canUpload ? "Drag and drop an image here, or upload from your device." : "Uploads are not configured. Choose an existing library image."}</p>
      {file ? <div className={styles.photoActions}>
        <Button form={uploadFormId} type="submit" size="sm">Upload photo</Button>
        <Button onClick={() => { chooseFile(null); if (input.current) input.current.value = ""; }} size="sm" type="button" variant="ghost">Cancel</Button>
      </div> : null}
    </div>
    {imageUrl && !file && <fieldset disabled={saving}><ImageFramingControl source={framingUrl || imageUrl} ratio={1} value={framing} onChange={async next => {
      setSaving(true); setStatus("Saving framing…");
      try { const result = await saveServiceImageFramingAction({ id: serviceId, updatedAt, framing: next }); setStatus(result.error || "Framing saved."); if (!result.error) router.refresh(); }
      catch { setStatus("Framing could not be saved. Try again."); }
      finally { setSaving(false); }
    }} /></fieldset>}
    <p role="status" className={styles.photoHelp}>{status}</p>
    {file ? <p className={styles.photoHelp} role="status">This photo is ready to upload. Your current booking photo stays in place until you upload it.</p> : null}
  </section>;
}
