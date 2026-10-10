"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Grid2X2, Grid3X3, Image as ImageIcon, ImagePlus, Settings, Upload } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { updatePortfolioGalleryStatusAction, uploadPortfolioPhotoAction } from "./actions";
import { albumPhotoError, albumPhotoTypes } from "./album-upload";
import styles from "./albums.module.css";

type Photo = { id: string; title: string; alt: string; thumbnail: string; largeThumbnail: string; url: string };
type AlbumPhotosProps = { galleryId: string; title: string; status: string; visibility: string; photos: Photo[]; children: ReactNode };

export function AlbumPhotos({ galleryId, title, status, visibility, photos, children }: AlbumPhotosProps) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [publishing, startPublication] = useTransition();
  const [active, setActive] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [largeThumbnails, setLargeThumbnails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [failed, setFailed] = useState<File[]>([]);
  const photo = active === null ? null : photos[active];
  const published = status === "PUBLISHED";
  const publicationLabel = published ? `Published (${visibility}) — switch to draft` : `${status === "ARCHIVED" ? "Archived" : "Draft"} — publish gallery`;

  function togglePublication() {
    const data = new FormData();
    data.set("id", galleryId);
    data.set("status", published ? "DRAFT" : "PUBLISHED");
    startPublication(async () => {
      try { await updatePortfolioGalleryStatusAction(data); }
      catch { setErrors(["Could not change publication status. Please try again."]); }
    });
  }

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

  return <section className={styles.photos} aria-label="Album photos" aria-busy={busy}
    onDragEnter={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current++;
      if (!busy) setDragging(true);
    }}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = busy ? "none" : "copy";
    }}
    onDragLeave={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void upload(Array.from(event.dataTransfer.files));
    }}>
    {dragging && <div className={styles.dropTarget}><div><Upload size={28} /><span>Drop photos to upload</span></div></div>}
    <header className={styles.galleryToolbar}>
      <ButtonLink className={styles.galleryIcon} size="sm" variant="ghost" href="/admin/modules/portfolio" aria-label="All albums" title="All albums"><ArrowLeft size={16} aria-hidden="true" /></ButtonLink>
      <div className={styles.galleryTitle}>
        <h1 title={title}>{title}</h1>
        <span className={styles.photoCount} role="img" aria-label={`${photos.length} photos`}><ImageIcon size={16} aria-hidden="true" /><span aria-hidden="true">{photos.length}</span></span>
        <Tooltip className={styles.galleryTooltip} content={publicationLabel} focusable={false}>
          <Button className={styles.galleryIcon} size="sm" variant="ghost" type="button" aria-label={publicationLabel} aria-pressed={published} disabled={publishing} onClick={togglePublication}>
            {published ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          </Button>
        </Tooltip>
      </div>
      <div className={styles.galleryActions}>
        <Tooltip className={styles.galleryTooltip} content={largeThumbnails ? "Use small thumbnails" : "Use large thumbnails"} focusable={false}>
          <Button className={styles.galleryIcon} size="sm" variant={largeThumbnails ? "secondary" : "ghost"} type="button" aria-label="Large thumbnails" aria-pressed={largeThumbnails} onClick={() => setLargeThumbnails(large => !large)}>
            {largeThumbnails ? <Grid2X2 size={16} aria-hidden="true" /> : <Grid3X3 size={16} aria-hidden="true" />}
          </Button>
        </Tooltip>
        <Button className={styles.galleryIcon} size="sm" type="button" aria-label={busy ? "Uploading photos" : "Upload photos"} title="Upload photos or drag them into the gallery" disabled={busy} onClick={() => picker.current?.click()}><Upload size={16} aria-hidden="true" /></Button>
        <Button className={styles.galleryIcon} size="sm" variant="ghost" type="button" aria-label="Gallery settings" title="Gallery settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><Settings size={16} aria-hidden="true" /></Button>
      </div>
      <input ref={picker} className={styles.fileInput} type="file" multiple accept={albumPhotoTypes.join(",")} aria-label="Choose album photos" disabled={busy} onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = ""; void upload(files);
      }} />
    </header>
    <p role="status" className={styles.feedback}>{message}</p>
    {errors.length > 0 && <div role="alert" className={styles.errors}><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>{failed.length > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => void upload(failed)}>Retry failed photos</Button>}</div>}
    {photos.length ? <div className={`${styles.photoGrid} ${largeThumbnails ? styles.photoGridLarge : ""}`}>{photos.map((item, index) => <button className={styles.photo} key={item.id} type="button" onClick={() => setActive(index)} aria-label={`View ${item.alt || item.title || `photo ${index + 1}`}`}>
      <img draggable={false} src={item.thumbnail} srcSet={`${item.thumbnail} 320w, ${item.largeThumbnail} 720w`} sizes={largeThumbnails ? "(max-width: 600px) 50vw, 320px" : "(max-width: 600px) 33vw, 200px"} alt={item.alt} loading={index < 6 ? "eager" : "lazy"} decoding="async" />
    </button>)}</div> : <div className={styles.galleryEmpty}><ImagePlus size={36} aria-hidden="true" /><h2>Your album starts here</h2><p>Drop photos here or choose files.</p><Button size="sm" type="button" disabled={busy} onClick={() => picker.current?.click()}>Choose photos</Button><small>JPG, PNG, WebP or GIF · Up to 12 MB per photo</small></div>}
    <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Gallery settings" className={styles.settingsPanel} bodyClassName={styles.settingsBody}>
      {children}
    </Modal>
    <Modal open={Boolean(photo)} onClose={() => setActive(null)} title={`${title} — photo ${(active ?? 0) + 1}`} closeLabel="Close photo viewer" className={styles.viewer} bodyClassName={styles.viewerBody}>
      {photo && <>
        <img draggable={false} className={styles.fullPhoto} src={photo.url} alt={photo.alt} />
        <button className={`${styles.viewerArrow} ${styles.previous}`} type="button" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => setActive(((active ?? 0) - 1 + photos.length) % photos.length)}><ArrowLeft size={16} /></button>
        <button className={`${styles.viewerArrow} ${styles.next}`} type="button" aria-label="Next photo" disabled={photos.length < 2} onClick={() => setActive(((active ?? 0) + 1) % photos.length)}><ArrowRight size={16} /></button>
        <div className={styles.viewerCaption}><span>{photo.title || title}</span><span aria-live="polite">{(active ?? 0) + 1} / {photos.length}</span></div>
      </>}
    </Modal>
  </section>;
}
