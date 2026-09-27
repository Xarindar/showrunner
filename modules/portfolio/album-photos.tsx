"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { uploadPortfolioPhotoAction } from "./actions";
import { albumPhotoError, albumPhotoTypes } from "./album-upload";
import styles from "./albums.module.css";

type Photo = { id: string; title: string; alt: string; thumbnail: string; url: string };
export function AlbumPhotos({ galleryId, photos }: { galleryId: string; photos: Photo[] }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [failed, setFailed] = useState<File[]>([]);
  const photo = active === null ? null : photos[active];

  useEffect(() => {
    if (active === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setActive(index => index === null ? null : (index + (event.key === "ArrowLeft" ? -1 : 1) + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos.length]);

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true); setErrors([]); setFailed([]);
    const failures: File[] = [];
    const problems: string[] = [];
    let saved = 0;
    // ponytail: sequential uploads bound memory and request size; add concurrency only for measured throughput needs.
    for (const [index, file] of files.entries()) {
      setMessage(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      let error = albumPhotoError(file);
      if (!error) {
        const data = new FormData(); data.set("galleryId", galleryId); data.set("file", file);
        try { error = (await uploadPortfolioPhotoAction(data)).error || ""; }
        catch { error = "Upload interrupted. Check the album before retrying."; }
      }
      if (error) { failures.push(file); problems.push(`${file.name}: ${error}`); }
      else saved++;
    }
    setErrors(problems); setFailed(failures); setBusy(false);
    setMessage(`${saved} photo${saved === 1 ? "" : "s"} added${failures.length ? `; ${failures.length} not uploaded` : ""}.`);
    router.refresh();
  }

  return <section className={styles.photos} aria-label="Album photos" aria-busy={busy}>
    <div className={styles.photoToolbar}>
      <div><h2>Photos <span className={styles.count}>{photos.length}</span></h2><p>Select a photo to view it full size.</p></div>
      <Button type="button" disabled={busy} onClick={() => picker.current?.click()}><Upload size={17} />{busy ? "Uploading…" : "Upload photos"}</Button>
      <input ref={picker} className={styles.fileInput} type="file" multiple accept={albumPhotoTypes.join(",")} aria-label="Choose album photos" disabled={busy} onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = ""; void upload(files);
      }} />
    </div>
    <p className={styles.hint}>JPG, PNG, WebP or GIF · Up to 12 MB per photo</p>
    <p role="status" className={styles.feedback}>{message}</p>
    {errors.length > 0 && <div role="alert" className={styles.errors}><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul><Button type="button" variant="secondary" disabled={busy} onClick={() => void upload(failed)}>Retry failed photos</Button></div>}
    {photos.length ? <div className={styles.photoGrid}>{photos.map((item, index) => <button className={styles.photo} key={item.id} type="button" onClick={() => setActive(index)} aria-label={`View ${item.alt || item.title || `photo ${index + 1}`}`}>
      <img src={item.thumbnail} alt={item.alt} loading="lazy" /><span>{item.title || `Photo ${index + 1}`}</span>
    </button>)}</div> : <div className={styles.empty}><ImagePlus size={36} aria-hidden="true" /><h3>Your album starts here</h3><p>Upload photos to fill these pages. The first photo becomes the cover.</p><Button type="button" disabled={busy} onClick={() => picker.current?.click()}>Choose photos</Button></div>}
    <Modal open={Boolean(photo)} onClose={() => setActive(null)} title={photo?.title || "Photo"} className={styles.viewer}>
      {photo && <><img className={styles.fullPhoto} src={photo.url} alt={photo.alt} /><div className={styles.viewerControls}>
        <Button type="button" variant="secondary" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => setActive(((active || 0) - 1 + photos.length) % photos.length)}><ArrowLeft size={18} /></Button>
        <span aria-live="polite">{(active || 0) + 1} / {photos.length}</span>
        <Button type="button" variant="secondary" aria-label="Next photo" disabled={photos.length < 2} onClick={() => setActive(((active || 0) + 1) % photos.length)}><ArrowRight size={18} /></Button>
      </div></>}
    </Modal>
  </section>;
}
