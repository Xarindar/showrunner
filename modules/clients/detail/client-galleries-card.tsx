"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Check, Copy, ExternalLink, ImagePlus, Images, Plus, Search, Upload } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import {
  addClientGalleryMediaAction, browseClientGalleryMediaAction, createClientGalleryAction, createClientGalleryLinkAction,
  getClientGalleryWorkspace, uploadClientGalleryPhotoAction
} from "@/modules/portfolio/client-actions";
import { clientGalleryBatchError, clientGalleryImageTypes, clientGalleryUploadMaxBytes, type ClientGalleryPhotoPage, type ClientGalleryWorkspace } from "@/modules/portfolio/client-gallery-validation";
import styles from "./client-galleries.module.css";

type UploadRow = { file: File; status: "ready" | "uploading" | "done" | "failed"; error?: string };
const emptyPage: ClientGalleryPhotoPage = { assets: [], total: 0, page: 1, pageCount: 1 };

function currencyAmount(cents: number | null, currency: string | null) {
  if (cents === null || !currency) return "Not configured";
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

export function ClientGalleriesCard({ clientId, initialWorkspace }: { clientId: string; initialWorkspace: ClientGalleryWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [galleryId, setGalleryId] = useState(initialWorkspace.galleries[0]?.id || "");
  const [creating, setCreating] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [packageKey, setPackageKey] = useState("");
  const [allowance, setAllowance] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<ClientGalleryPhotoPage>(emptyPage);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const stopUpload = useRef(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const gallery = workspace.galleries.find((item) => item.id === galleryId);
  const selectedPackage = workspace.packages.find((item) => `${item.orderId}:${item.productId}` === packageKey);

  useEffect(() => () => { stopUpload.current = true; }, []);

  useEffect(() => {
    if (!galleryId || !workspace.canManageMedia) return;
    let current = true;
    Promise.resolve().then(() => {
      if (!current) return;
      setPhotosLoading(true);
      setPhotosError("");
      return browseClientGalleryMediaAction({ clientId, galleryId, query, page, mode: pickerOpen ? "library" : "gallery" });
    })
      .then((result) => {
        if (!current || !result) return;
        if (result.ok) setPhotos(result.data);
        else { setPhotos(emptyPage); setPhotosError(result.error); }
      }).catch(() => { if (current) setPhotosError("Photos could not be loaded. Try again."); })
      .finally(() => { if (current) setPhotosLoading(false); });
    return () => { current = false; };
  }, [clientId, galleryId, query, page, pickerOpen, revision, workspace.canManageMedia]);

  useEffect(() => {
    if (!uploading) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [uploading]);

  async function reload() {
    setWorkspace(await getClientGalleryWorkspace(clientId));
    setRevision((value) => value + 1);
  }

  function resetBrowse() { setSearchDraft(""); setQuery(""); setPage(1); setSelected([]); }
  function openCreate() {
    setRequestId(crypto.randomUUID()); setPackageKey(""); setAllowance(""); setExtraPrice(""); setCurrency("");
    setError(""); setNotice(""); setCreating(true);
  }

  function choosePackage(key: string) {
    const item = workspace.packages.find((entry) => `${entry.orderId}:${entry.productId}` === key);
    setPackageKey(key);
    setAllowance(item?.allowance === null || item?.allowance === undefined ? "" : String(item.allowance));
    setExtraPrice(item?.extraPhotoPriceCents === null || item?.extraPhotoPriceCents === undefined ? "" : (item.extraPhotoPriceCents / 100).toFixed(2));
    setCurrency(item?.currency || "");
  }

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedPackage) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createClientGalleryAction({
        clientId, requestId, title: String(form.get("title") || ""), packageProductId: selectedPackage.productId,
        purchasedOrderId: selectedPackage.orderId, selectionAllowance: allowance, extraPhotoPrice: extraPrice, selectionCurrency: currency
      });
      if (!result.ok) { setError(result.error); return; }
      await reload(); setGalleryId(result.data.galleryId); resetBrowse(); setCreating(false);
      setNotice("Private shoot gallery created. Add photos, then copy the client’s link when you’re ready.");
    } catch { setError("The gallery could not be created. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function addSelected() {
    if (busy || !selected.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await addClientGalleryMediaAction({ clientId, galleryId, assetIds: selected });
      if (!result.ok) { setError(result.error); return; }
      await reload(); setPickerOpen(false); resetBrowse();
      setNotice(`${result.data.added} photo${result.data.added === 1 ? "" : "s"} added to this shoot.`);
    } catch { setError("Photos could not be added. Your selection is saved here; try again."); }
    finally { setBusy(false); }
  }

  async function uploadBatch() {
    if (uploading || busy || !uploads.some((row) => row.status === "ready")) return;
    const batchError = clientGalleryBatchError(uploads.map(row => row.file));
    if (batchError) { setError(batchError); return; }
    stopUpload.current = false; setUploading(true); setError(""); setNotice("");
    const rows = [...uploads];
    let completed = 0;
    try {
      for (let index = 0; index < rows.length; index += 1) {
        if (stopUpload.current) break;
        if (rows[index].status !== "ready") continue;
        rows[index] = { ...rows[index], status: "uploading" }; setUploads([...rows]);
        const form = new FormData();
        form.set("clientId", clientId); form.set("galleryId", galleryId); form.set("file", rows[index].file);
        try {
          const result = await uploadClientGalleryPhotoAction(form);
          rows[index] = { ...rows[index], status: result.ok ? "done" : "failed", error: result.ok ? undefined : result.error };
          if (result.ok) completed += 1;
        } catch {
          rows[index] = { ...rows[index], status: "failed", error: "Upload status is uncertain. Check this shoot or Media before uploading this file again." };
        }
        setUploads([...rows]);
      }
      await reload();
      setNotice(`${completed} photo${completed === 1 ? "" : "s"} uploaded to private Media and added to this shoot.${stopUpload.current ? " Remaining files were not uploaded." : ""}`);
    } catch { setError("The photo list could not refresh. Check the file statuses below before retrying."); }
    finally { setUploading(false); }
  }

  async function copyLink() {
    if (!gallery?.accessPath) return;
    try {
      await navigator.clipboard.writeText(new URL(gallery.accessPath, window.location.origin).toString());
      setNotice("Private link copied. Anyone holding this link can view this client’s shoot; share it only with the client."); setError("");
    } catch { setError("Copy was unavailable. Open the private gallery and copy its address from your browser."); }
  }

  async function createLink() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await createClientGalleryLinkAction({ clientId, galleryId });
      if (!result.ok) { setError(result.error); return; }
      await reload(); setNotice("Client access link created. Copy it when you’re ready to share.");
    } catch { setError("The private link could not be created. Please try again."); }
    finally { setBusy(false); }
  }

  const photoGrid = (
    <>
      {photosLoading ? <p className={styles.status} role="status">Loading photos…</p> : null}
      {photosError ? <div className="error" role="alert">{photosError} <Button size="sm" type="button" variant="ghost" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : null}
      {!photosLoading && !photosError && !photos.assets.length ? <p className={styles.empty}>{query ? "No private photos match this search. Try another name or folder." : pickerOpen ? "No private photos are available yet. Upload this shoot’s originals first." : "Add this shoot’s photos from Media, or upload a batch of originals below."}</p> : null}
      <div aria-busy={photosLoading} className={styles.photoGrid}>
        {!photosLoading && !photosError ? photos.assets.map((photo) => {
          const checked = selected.includes(photo.id);
          const content = <><Image alt={photo.alt} height={150} loading="lazy" src={photo.thumbnailUrl} unoptimized width={200} /><span className={styles.photoName}>{photo.filename}</span>{photo.folder ? <small>{photo.folder}</small> : null}</>;
          return pickerOpen ? (
            <label className={`${styles.photo} ${checked ? styles.selectedPhoto : ""} ${photo.alreadyAdded ? styles.addedPhoto : ""}`} key={photo.id}>
              {content}
              <span className={styles.photoChoice}><input aria-label={`Add ${photo.filename}`} checked={checked || photo.alreadyAdded} disabled={photo.alreadyAdded || busy || (!checked && selected.length >= 100)} onChange={() => setSelected((ids) => ids.includes(photo.id) ? ids.filter((id) => id !== photo.id) : [...ids, photo.id])} type="checkbox" />{photo.alreadyAdded ? "In this shoot" : checked ? "Selected" : "Select photo"}</span>
            </label>
          ) : <figure className={styles.photo} key={photo.id}>{content}</figure>;
        }) : null}
      </div>
      {photos.pageCount > 1 && !photosLoading ? <nav aria-label={pickerOpen ? "Media pages" : "Shoot photo pages"} className={styles.pagination}>
        <Button disabled={photos.page <= 1 || busy} onClick={() => setPage(photos.page - 1)} size="sm" type="button" variant="secondary">Previous</Button>
        <span>Page {photos.page} of {photos.pageCount} · {photos.total} photos</span>
        <Button disabled={photos.page >= photos.pageCount || busy} onClick={() => setPage(photos.page + 1)} size="sm" type="button" variant="secondary">Next</Button>
      </nav> : null}
    </>
  );

  return (
    <Card as="section" bodyClassName={styles.body} id="client-galleries" minHeight="none">
      <header className={styles.header}>
        <div><h2 className="section-title">Shoot galleries</h2><p className="ui-zero muted-text">Private photos, package selections, and delivery for this client.</p></div>
        <Button disabled={busy || uploading || creating} onClick={openCreate} size="sm" type="button" variant="secondary"><Plus aria-hidden="true" size={16} /> New shoot</Button>
      </header>
      {notice ? <p className="success-message" role="status">{notice}</p> : null}
      {error && !pickerOpen ? <p className="error" role="alert">{error}</p> : null}

      {creating ? <form className={styles.createForm} onSubmit={createGallery}>
        <h3>New private shoot</h3>
        {!workspace.packages.length ? <p className={styles.empty}>This client needs a paid or fulfilled service-package order before a shoot gallery can be created.</p> : <>
          <label className={styles.field}><span>Shoot name</span><input autoFocus maxLength={160} name="title" placeholder="e.g. Autumn family portraits" required /></label>
          <label className={styles.field}><span>Purchased package</span><select onChange={(event) => choosePackage(event.target.value)} required value={packageKey}><option value="">Choose a paid package</option>{workspace.packages.map((item) => <option key={`${item.orderId}:${item.productId}`} value={`${item.orderId}:${item.productId}`}>{item.name} · Order {item.orderNumber}</option>)}</select></label>
          <div className={styles.termsFields}>
            <label className={styles.field}><span>Included photos</span><input inputMode="numeric" max={10000} min={0} onChange={(event) => setAllowance(event.target.value)} required step={1} type="number" value={allowance} /></label>
            <label className={styles.field}><span>Price per extra photo</span><input inputMode="decimal" min={0} onChange={(event) => setExtraPrice(event.target.value)} required step="0.01" type="number" value={extraPrice} /></label>
            <label className={styles.field}><span>Currency</span><input maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} pattern="[A-Za-z]{3}" placeholder="USD" required value={currency} /></label>
          </div>
          <p className={styles.help}>Review the package values before saving. These terms are fixed for this shoot; enter any missing values explicitly. Only selected, entitled originals can be downloaded.</p>
        </>}
        <footer className={styles.actions}><Button disabled={busy} onClick={() => setCreating(false)} size="sm" type="button" variant="ghost">Cancel</Button>{workspace.packages.length ? <Button disabled={busy || !selectedPackage} size="sm" type="submit">{busy ? "Creating…" : "Create private shoot"}</Button> : null}</footer>
      </form> : null}

      {!creating && !workspace.galleries.length ? <div className={styles.empty}><Images aria-hidden="true" size={28} /><p>No shoot galleries yet. Create one from a purchased package, then add the client’s photos.</p></div> : null}
      {gallery && !creating ? <>
        <div className={styles.galleryToolbar}>
          <label className={styles.field}><span>Shoot</span><select disabled={busy || uploading} onChange={(event) => { setGalleryId(event.target.value); resetBrowse(); setUploads([]); setError(""); setNotice(""); if (uploadInput.current) uploadInput.current.value = ""; }} value={galleryId}>{workspace.galleries.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.photoCount} photos</option>)}</select></label>
          <span className="ui-badge">Private</span>
        </div>
        <div className={styles.terms}>
          <p><strong>{gallery.packageName}</strong><span>{gallery.selectionAllowance === null ? "Allowance not configured" : `${gallery.selectionAllowance} included photos`} · {currencyAmount(gallery.extraPhotoPriceCents, gallery.selectionCurrency)} per extra photo</span></p>
          <div className={styles.actions}>{gallery.accessPath ? <><Button disabled={busy || uploading} onClick={copyLink} size="sm" type="button" variant="secondary"><Copy aria-hidden="true" size={15} /> Copy client link</Button><a className={styles.openLink} href={gallery.accessPath} rel="noreferrer" target="_blank">Open private gallery <ExternalLink aria-hidden="true" size={14} /></a></> : <Button disabled={busy || uploading} onClick={createLink} size="sm" type="button" variant="secondary">Create client link</Button>}</div>
        </div>
        <p className={styles.help}>Keep the client link private. Photos stay in shared Media as private originals. Your public Portfolio remains separately curated.</p>
        <div className={styles.photosHeader}><h3>{gallery.photoCount} shoot photo{gallery.photoCount === 1 ? "" : "s"}</h3>{workspace.canManageMedia ? <Button disabled={busy || uploading} onClick={() => { resetBrowse(); setError(""); setPickerOpen(true); }} size="sm" type="button" variant="secondary"><ImagePlus aria-hidden="true" size={16} /> Choose from Media</Button> : null}</div>
        {!pickerOpen && workspace.canManageMedia ? photoGrid : null}
        {workspace.canManageMedia ? <section className={styles.uploadSection} aria-label="Upload shoot photos">
          <h3>Upload originals</h3>
          <p className={styles.help}>JPG, PNG, WebP, or GIF originals: up to 25 MiB and 80 megapixels each. Choose at most 100 photos totaling 250 MiB per batch. Files upload one at a time; RAW files are not supported.</p>
          {!workspace.canUpload ? <p className="error">Private uploads need configured server, S3, or R2 storage. Update Media storage settings to upload originals.</p> : <>
            <label className={styles.field}><span>Photo files</span><input accept={clientGalleryImageTypes.join(",")} disabled={uploading || busy} multiple onChange={(event) => {
              const files = Array.from(event.target.files || []);
              const batchError = clientGalleryBatchError(files);
              if (batchError) { setUploads([]); setError(batchError); event.target.value = ""; return; }
              setError("");
              setUploads(files.map((file) => ({ file, status: file.size > clientGalleryUploadMaxBytes || !(clientGalleryImageTypes as readonly string[]).includes(file.type) ? "failed" : "ready", error: file.size > clientGalleryUploadMaxBytes ? "Exceeds 25 MiB per photo." : !(clientGalleryImageTypes as readonly string[]).includes(file.type) ? "Use JPG, PNG, WebP, or GIF." : undefined })));
              setNotice("");
            }} ref={uploadInput} type="file" /></label>
            {uploads.length ? <ul aria-live="polite" className={styles.uploadList}>{uploads.map((row, index) => <li key={`${row.file.name}-${index}`}><span className={styles.uploadFilename}>{row.file.name}</span><span>{row.status === "done" ? <><Check aria-hidden="true" size={14} /> Added</> : row.status === "uploading" ? "Uploading…" : row.status === "failed" ? "Needs attention" : "Ready"}</span>{row.error ? <small className={styles.uploadError}>{row.error}</small> : null}</li>)}</ul> : null}
            <div className={styles.actions}><Button disabled={uploading || busy || !uploads.some((row) => row.status === "ready")} onClick={uploadBatch} size="sm" type="button"><Upload aria-hidden="true" size={16} />{uploading ? "Uploading…" : "Upload photos"}</Button>{uploading ? <Button onClick={() => { stopUpload.current = true; setNotice("Stopping after the current photo finishes."); }} size="sm" type="button" variant="ghost">Stop after this photo</Button> : uploads.length ? <Button onClick={() => { setUploads([]); if (uploadInput.current) uploadInput.current.value = ""; }} size="sm" type="button" variant="ghost">Clear file list</Button> : null}</div>
          </>}
        </section> : <p className={styles.help}>Media permission is required to browse or add shoot photos.</p>}
      </> : null}

      <Modal bodyClassName={styles.pickerBody} className={styles.picker} onClose={() => { if (!busy) { setPickerOpen(false); resetBrowse(); setError(""); } }} open={pickerOpen} title="Choose private photos from Media">
        <p className={styles.help}>Search across your private Media library by filename, description, folder, or exact tag. Selections stay checked as you browse pages.</p>
        <form className={styles.search} onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(searchDraft.trim()); }}><label className={styles.field}><span>Search private photos</span><input maxLength={180} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search photos or folders" type="search" value={searchDraft} /></label><Button disabled={busy} size="sm" type="submit" variant="secondary"><Search aria-hidden="true" size={16} /> Search</Button></form>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {photoGrid}
        <footer className={styles.pickerFooter}><span>{selected.length} selected{selected.length === 100 ? " · Add this batch to select more" : ""}</span><div className={styles.actions}><Button disabled={busy} onClick={() => { setPickerOpen(false); resetBrowse(); setError(""); }} size="sm" type="button" variant="ghost">Cancel</Button><Button disabled={busy || !selected.length} onClick={addSelected} size="sm" type="button">{busy ? "Adding…" : `Add ${selected.length || "selected"} photo${selected.length === 1 ? "" : "s"}`}</Button></div></footer>
      </Modal>
    </Card>
  );
}
