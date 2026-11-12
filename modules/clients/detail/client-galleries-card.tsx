"use client";
import { useNotify } from "@/components/ui/notifications";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Folder, ImagePlus, Mail, Search, Upload, X } from "lucide-react";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { childMediaFolders } from "@/lib/media-folders";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
import { SkeletonBlock } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import {
  addClientGalleryMediaAction, browseClientGalleryMediaAction, createClientGalleryAction, createClientGalleryLinkAction, configureClientGalleryProofingAction,
  getClientGalleryWorkspace, sendClientGalleryEmailAction, uploadClientGalleryPhotoAction
} from "@/modules/portfolio/client-actions";
import { clientGalleryLocalImageStatus, clientGalleryBatchError, clientGalleryPageSize, clientGalleryImageTypes, clientGalleryUploadMaxBytes, type ClientGalleryPhotoPage, type ClientGalleryWorkspace } from "@/modules/portfolio/client-gallery-validation";
import styles from "./client-galleries.module.css";
import { ServiceLibraryPicker } from "@/modules/scheduling/components/service-library-picker";
import type { ServiceLibraryItem } from "@/lib/scheduling/service-library";
import mediaStyles from "@/modules/media/media-library.module.css";

type UploadRow = { file: File; status: "ready" | "uploading" | "done" | "failed"; error?: string };
const emptyPage: ClientGalleryPhotoPage = { assets: [], folders: [], total: 0, page: 1, pageCount: 1 };

function currencyAmount(cents: number | null, currency: string | null) {
  if (cents === null || !currency) return "Not configured";
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

export function ClientSessionDetail({ clientId, initialWorkspace, initialGalleryId = "", initialBookingId = "", openUpload = false }: {
  clientId: string; initialWorkspace: ClientGalleryWorkspace; initialGalleryId?: string; initialBookingId?: string; openUpload?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [galleryId, setGalleryId] = useState(initialGalleryId);
  const [creating, setCreating] = useState(openUpload);
  const [photoSource, setPhotoSource] = useState<"upload" | "media">("upload");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [bookingId, setBookingId] = useState(initialBookingId);
  const [uploadTargetId, setUploadTargetId] = useState(openUpload ? initialGalleryId : "");
  const [packageKey, setPackageKey] = useState("");
  const [allowance, setAllowance] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [proofSettingsOpen, setProofSettingsOpen] = useState(false);
  const [addOnPicker, setAddOnPicker] = useState(false);
  const [editingProofAddOn, setEditingProofAddOn] = useState(false);
  const [proofAddOn, setProofAddOn] = useState<ServiceLibraryItem | null>(null);
  const [sendRequestId, setSendRequestId] = useState(() => crypto.randomUUID());
  const [emailNotice, setEmailNotice] = useState("");
  const notify = useNotify();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<ClientGalleryPhotoPage>(emptyPage);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewPhotos, setPreviewPhotos] = useState<ClientGalleryPhotoPage>(emptyPage);
  const [previewError, setPreviewError] = useState("");
  const [loadedPreviewId, setLoadedPreviewId] = useState("");
  const [failedPreviewId, setFailedPreviewId] = useState("");
  const previewPage = previewIndex === null ? 1 : Math.floor(previewIndex / clientGalleryPageSize) + 1;
  const previewLoading = previewPhotos.page !== previewPage;
  const previewPhoto = previewIndex === null || previewLoading ? null : previewPhotos.assets[previewIndex % clientGalleryPageSize];
  const [photosLoading, setPhotosLoading] = useState(Boolean(initialGalleryId && initialWorkspace.canManageMedia));
  const [photosError, setPhotosError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const stopUpload = useRef(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = workspace.galleries.find(item => item.id === uploadTargetId);
  const gallery = workspace.galleries.find((item) => item.id === galleryId);
  const sessionTitle = gallery?.title || workspace.sessions.find(session => session.id === initialBookingId)?.name || "Session";
  const imageStatus = clientGalleryLocalImageStatus(gallery?.imageStatus, uploading, uploads);
  const processingImages = imageStatus === "Images processing";
  const finishedUploads = uploads.filter(row => row.status === "done" || row.status === "failed").length;
  const showGallerySkeleton = !pickerOpen && (photosLoading || processingImages);
  const selectedProofAddOn = proofAddOn || gallery?.extraPhotoAddOn;
  const selectedPackage = workspace.packages.find((item) => `${item.orderId}:${item.productId}` === packageKey);

  const scopeWorkspace = useCallback((next: ClientGalleryWorkspace): ClientGalleryWorkspace => ({
    ...next,
    galleries: next.galleries.filter(item => initialBookingId ? item.bookingId === initialBookingId : item.id === initialGalleryId),
    sessions: next.sessions.filter(item => item.id === initialBookingId)
  }), [initialBookingId, initialGalleryId]);

  useEffect(() => () => { stopUpload.current = true; }, []);

  useEffect(() => {
    if (!galleryId || !workspace.canManageMedia) return;
    let current = true;
    Promise.resolve().then(() => {
      if (!current) return;
      setPhotosLoading(true);
      setPhotosError("");
      return browseClientGalleryMediaAction({ clientId, galleryId, query, page, folder, mode: pickerOpen ? "library" : "gallery" });
    })
      .then((result) => {
        if (!current || !result) return;
        if (result.ok) setPhotos(result.data);
        else { setPhotos(emptyPage); setPhotosError(result.error); }
      }).catch(() => { if (current) setPhotosError("Photos could not be loaded. Try again."); })
      .finally(() => { if (current) setPhotosLoading(false); });
    return () => { current = false; };
  }, [clientId, galleryId, query, page, folder, pickerOpen, revision, workspace.canManageMedia]);

  useEffect(() => {
    if (!uploading) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const preventNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      event.preventDefault(); event.stopPropagation();
      notify("Images are still processing. Wait for the batch to finish, or stop after the current photo.", "neutral");
    };
    window.addEventListener("beforeunload", preventExit);
    document.addEventListener("click", preventNavigation, true);
    return () => { window.removeEventListener("beforeunload", preventExit); document.removeEventListener("click", preventNavigation, true); };
  }, [uploading, notify]);

  useEffect(() => {
    if (uploading || gallery?.imageStatus !== "Images processing") return;
    let current = true;
    const timer = setInterval(() => { void getClientGalleryWorkspace(clientId).then(next => {
      if (current) { setWorkspace(scopeWorkspace(next)); setRevision(value => value + 1); }
    }).catch(() => {}); }, 3000);
    return () => { current = false; clearInterval(timer); };
  }, [clientId, gallery?.imageStatus, uploading, scopeWorkspace]);

  async function reload() {
    setWorkspace(scopeWorkspace(await getClientGalleryWorkspace(clientId)));
    setRevision((value) => value + 1);
  }

  function resetBrowse() { setFolder(""); setSearchDraft(""); setQuery(""); setPage(1); setSelected([]); }
  function openCreate(sessionId: string, targetGalleryId = "") {
    setPhotoSource("upload");
    setUploadTargetId(targetGalleryId);
    if (targetGalleryId) setGalleryId(targetGalleryId);
    setUploads([]); setBookingId(sessionId); setRequestId(crypto.randomUUID()); setPackageKey(""); setAllowance(""); setExtraPrice(""); setCurrency("");
    setCreating(true);
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
    if (busy || (!bookingId && !uploadTargetId)) return;
    if (uploadTargetId) {
      setBusy(true); setCreating(false);
      try { await uploadBatch(uploadTargetId); }
      finally { setBusy(false); }
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await createClientGalleryAction({
        clientId, requestId, bookingId, title: String(form.get("title") || ""),
        description: String(form.get("description") || ""), sessionDate: String(form.get("sessionDate") || ""),
        ...(selectedPackage ? { packageProductId: selectedPackage.productId, purchasedOrderId: selectedPackage.orderId,
          selectionAllowance: allowance, extraPhotoPrice: extraPrice, selectionCurrency: currency } : {})
      });
      if (!result.ok) { notify(result.error, "danger"); return; }
      await reload(); setGalleryId(result.data.galleryId); resetBrowse(); setCreating(false);
      if (photoSource === "media") setPickerOpen(true);
      else await uploadBatch(result.data.galleryId);
    } catch { notify("The gallery could not be created. Check your connection and try again.", "danger"); }
    finally { setBusy(false); }
  }

  async function addSelected() {
    if (busy || !selected.length) return;
    setBusy(true);
    try {
      const result = await addClientGalleryMediaAction({ clientId, galleryId, assetIds: selected });
      if (!result.ok) { notify(result.error, "danger"); return; }
      await reload(); setPickerOpen(false); resetBrowse();
      notify(`${result.data.added} photo${result.data.added === 1 ? "" : "s"} added to this shoot.`);
    } catch { notify("Photos could not be added. Your selection is saved here; try again.", "danger"); }
    finally { setBusy(false); }
  }

  function selectUploads(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const batchError = clientGalleryBatchError(files);
    if (batchError) { setUploads([]); notify(batchError, "danger"); event.target.value = ""; return; }
    setUploads(files.map((file) => ({ file, status: file.size > clientGalleryUploadMaxBytes || !(clientGalleryImageTypes as readonly string[]).includes(file.type) ? "failed" : "ready", error: file.size > clientGalleryUploadMaxBytes ? "Exceeds 25 MiB per photo." : !(clientGalleryImageTypes as readonly string[]).includes(file.type) ? "Use JPG, PNG, WebP, or GIF." : undefined })));
  }

  async function uploadBatch(targetGalleryId = galleryId) {
    if (uploading || !uploads.some((row) => row.status === "ready")) return;
    const batchError = clientGalleryBatchError(uploads.map(row => row.file));
    if (batchError) { notify(batchError, "danger"); return; }
    stopUpload.current = false; setUploading(true);
    const rows = [...uploads];
    let completed = 0;
    try {
      for (let index = 0; index < rows.length; index += 1) {
        if (stopUpload.current) break;
        if (rows[index].status !== "ready") continue;
        rows[index] = { ...rows[index], status: "uploading" }; setUploads([...rows]);
        const form = new FormData();
        form.set("clientId", clientId); form.set("galleryId", targetGalleryId); form.set("file", rows[index].file);
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
      if (completed) notify(`${completed} photo${completed === 1 ? "" : "s"} added to this shoot.`);
    } catch { notify("The photo list could not refresh. Check the file statuses below before retrying.", "danger"); }
    finally { setUploading(false); }
  }

  async function copyLink() {
    if (!gallery?.accessPath) return;
    try {
      await navigator.clipboard.writeText(new URL(gallery.accessPath, window.location.origin).toString());
      notify("Private link copied.");
    } catch { notify("Copy was unavailable. Open the private gallery and copy its address from your browser.", "danger"); }
  }

  async function createLink() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createClientGalleryLinkAction({ clientId, galleryId });
      if (!result.ok) { notify(result.error, "danger"); return; }
      await reload(); notify("Client access link created.");
    } catch { notify("The private link could not be created. Please try again.", "danger"); }
    finally { setBusy(false); }
  }

  async function saveProofSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await configureClientGalleryProofingAction({ clientId, galleryId, includedCount: Number(form.get("includedCount")), addOnId: proofAddOn?.id || gallery?.extraPhotoAddOnId, currency: String(form.get("currency")) });
      if (!result.ok) { notify(result.error, "danger"); return; }
      await reload(); setProofSettingsOpen(false); notify("Photo selection settings saved.");
    } catch { notify("Selection settings could not be saved. Try again.", "danger"); }
    finally { setBusy(false); }
  }

  async function sendEmail() {
    if (sending || busy || uploading || imageStatus !== "Ready") return;
    setSending(true);
    try {
      const result = await sendClientGalleryEmailAction({ clientId, galleryId, requestId: sendRequestId });
      if (!result.ok) { notify(result.error, "danger"); return; }
      setEmailNotice(`Email queued for ${result.data.recipientEmail}. Track delivery in Communications.`);
      setSendRequestId(crypto.randomUUID()); setSendOpen(false);
      notify("Session photo email queued.");
    } catch { notify("Email status is uncertain. Check Communications before retrying.", "danger"); }
    finally { setSending(false); }
  }

  useEffect(() => {
    if (previewIndex === null) return;
    const navigatePhoto = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewIndex(index => index === null ? null : Math.max(0, Math.min(previewPhotos.total - 1, index + (event.key === "ArrowRight" ? 1 : -1))));
      }
    };
    window.addEventListener("keydown", navigatePhoto);
    return () => window.removeEventListener("keydown", navigatePhoto);
  }, [previewIndex, previewPhotos.total]);

  useEffect(() => {
    if (previewIndex === null) return;
    let current = true;
    Promise.resolve().then(() => {
      if (!current) return;
      setPreviewError("");
      if (previewPhotos.page === previewPage) return;
      return browseClientGalleryMediaAction({ clientId, galleryId, query, page: previewPage, folder: "", mode: "gallery" });
    }).then(result => {
      if (!current || !result) return;
      if (result.ok && result.data.assets.length) setPreviewPhotos(result.data);
      else setPreviewError(result.ok ? "This photo is no longer available." : result.error);
    }).catch(() => { if (current) setPreviewError("The photo could not load. Go back or close the viewer and try again."); });
    return () => { current = false; };
  }, [clientId, galleryId, query, previewPage, previewPhotos.page, previewIndex]);

  const photoGrid = (
    <>
      {photosLoading && pickerOpen ? <p className={styles.status} role="status">Loading photos…</p> : null}
      {photosError ? <div className="error" role="alert">{photosError} <Button size="sm" type="button" variant="ghost" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : null}
      {!showGallerySkeleton && !photosLoading && !photosError && !photos.assets.length && !(pickerOpen && !query && childMediaFolders(photos.folders.map(name => ({ name, count: 0 })), folder).length) ? <p className={styles.empty}>{query ? "No private photos match this search. Try another name or folder." : pickerOpen ? "No private photos are available yet. Upload this shoot’s originals first." : "Upload photos or choose from Media to get started."}</p> : null}
      {pickerOpen ? <nav aria-label="Media folders" className={styles.actions}><Button type="button" variant="ghost" onClick={() => { setFolder(""); setPage(1); }}>Media Home</Button>{folder.split("/").filter(Boolean).map((part, index, parts) => <Button key={index} type="button" variant="ghost" onClick={() => { setFolder(parts.slice(0, index + 1).join("/")); setPage(1); }}>{part}</Button>)}</nav> : null}
      <div aria-label={showGallerySkeleton ? "Loading session photos" : undefined} aria-busy={photosLoading || processingImages} className={pickerOpen ? styles.photoGrid : styles.galleryGrid}>
        {showGallerySkeleton ? Array.from({ length: 8 }, (_, index) => <SkeletonBlock aria-hidden="true" className={styles.photoSkeleton} key={index} />) : null}
        {pickerOpen && !query && !photosLoading ? childMediaFolders(photos.folders.map(name => ({ name, count: 0 })), folder).map(item => <Button key={item.name} type="button" variant="secondary" onClick={() => { setFolder(item.name); setPage(1); }}><Folder aria-hidden="true" size={24} />{item.label}</Button>) : null}
        {!showGallerySkeleton && !photosLoading && !photosError ? photos.assets.map((photo, index) => {
          const checked = selected.includes(photo.id);
          const content = <><Image alt={photo.alt} height={150} loading="lazy" src={photo.thumbnailUrl} unoptimized width={200} /><span className={styles.photoName} title={photo.filename}>{photo.filename}</span>{pickerOpen && photo.folder ? <small>{photo.folder}</small> : null}</>;
          return pickerOpen ? (
            <label className={`${styles.photo} ${checked ? styles.selectedPhoto : ""} ${photo.alreadyAdded ? styles.addedPhoto : ""}`} key={photo.id}>
              {content}
              <span className={styles.photoChoice}><input aria-label={`Add ${photo.filename}`} checked={checked || photo.alreadyAdded} disabled={photo.alreadyAdded || busy || (!checked && selected.length >= 100)} onChange={() => setSelected((ids) => ids.includes(photo.id) ? ids.filter((id) => id !== photo.id) : [...ids, photo.id])} type="checkbox" />{photo.alreadyAdded ? "In this shoot" : checked ? "Selected" : "Select photo"}</span>
            </label>
          ) : <button aria-label={`View ${photo.filename}`} className={styles.galleryTile} key={photo.id} onClick={() => { setPreviewPhotos(photos); setPreviewError(""); setPreviewIndex((photos.page - 1) * clientGalleryPageSize + index); }} type="button">
            <span className={`${mediaStyles.thumb} ${styles.galleryThumb}`}><Image alt={photo.alt} height={300} loading={index < 6 ? "eager" : "lazy"} src={photo.thumbnailUrl} unoptimized width={400} /></span>
          </button>;
        }) : null}
      </div>
      {photos.pageCount > 1 && !photosLoading && !showGallerySkeleton ? <nav aria-label={pickerOpen ? "Media pages" : "Shoot photo pages"} className={styles.pagination}>
        <Button disabled={photos.page <= 1 || busy} onClick={() => setPage(photos.page - 1)} size="sm" type="button" variant="secondary">Previous</Button>
        <span>Page {photos.page} of {photos.pageCount} · {photos.total} photos</span>
        <Button disabled={photos.page >= photos.pageCount || busy} onClick={() => setPage(photos.page + 1)} size="sm" type="button" variant="secondary">Next</Button>
      </nav> : null}
    </>
  );

  return (
    <div className={`${styles.body} ${mediaStyles.libraryWorkspace} stack has-mobile-shell-header`}>
      <AdminMobileHeaderSlot backHref={`/admin/clients/${clientId}`} title={sessionTitle} />
      <header className={`page-header clients-detail-header ${styles.sessionHeader}`}><div className={`clients-detail-heading ${styles.sessionHeading}`}><ButtonLink href={`/admin/clients/${clientId}`} size="sm" variant="ghost"><ArrowLeft aria-hidden="true" size={15} /><span className={styles.clientBackName}>{workspace.clientName || "Client"}</span><span className={styles.mobileBackLabel}>Back</span></ButtonLink><h1 title={sessionTitle}>{sessionTitle}</h1></div><div className={styles.headerActions}>
        <Button aria-label="Upload photos" disabled={busy || uploading || sending || (!workspace.canUpload && !workspace.canManageMedia)} onClick={() => openCreate(initialBookingId, gallery?.id || "")} size="sm" type="button" variant="secondary"><Upload aria-hidden="true" size={15} /><span className={styles.headerActionLabel}>Upload</span></Button>
        <Button aria-label="Send to client" disabled={!gallery || busy || uploading || sending || imageStatus !== "Ready"} onClick={() => setSendOpen(true)} size="sm" type="button"><Mail aria-hidden="true" size={15} /><span className={styles.headerActionLabel}>Send</span></Button>
      </div></header>
      {processingImages ? <aside className={`ui-card ${styles.processingNotice}`}>
        <p role="status">Client Images Processing</p>
        <div aria-label="Image processing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploading && uploads.length ? Math.round(finishedUploads / uploads.length * 100) : undefined} aria-valuetext={uploading && uploads.length ? `${finishedUploads} of ${uploads.length} files finished` : "Preparing image previews"} className="ui-progress" role="progressbar">
          <span className={`ui-progress-fill ${!uploading ? styles.processingIndeterminate : ""}`} style={uploading ? { width: `${uploads.length ? finishedUploads / uploads.length * 100 : 0}%` } : undefined} />
        </div>
      </aside> : null}
      {imageStatus === "Needs attention" ? <p className={styles.uploadError} role="alert">Some client images could not be processed. Check the upload results or retry from Media.</p> : null}
      <Modal open={sendOpen} title="Send to client" onClose={() => { if (!sending && !busy) setSendOpen(false); }}>
        <div className={styles.deliveryBody}>
          <p><strong>{workspace.clientName}</strong><br />{workspace.clientEmail || "Add an email in the client profile to send photos."}</p>
          {gallery ? <>
            <p className={styles.help}>{gallery.photoCount} photos · Private gallery link</p>
            {gallery.selectionAllowance !== null ? <p className={styles.help}>{gallery.packageName}: {gallery.selectionAllowance} included photos / {currencyAmount(gallery.extraPhotoPriceCents, gallery.selectionCurrency)} per extra photo</p> : null}
            <p className={styles.help}>Only share this link with the client. Photos are viewed in the gallery, not attached to the email.</p>
            {gallery.bookingId && (gallery.selectionAllowance === null || gallery.extraPhotoAddOnId) ? <Button disabled={busy || sending || uploading} onClick={() => { setSendOpen(false); setProofAddOn(null); setProofSettingsOpen(true); }} size="sm" type="button" variant="secondary">Photo selection settings</Button> : null}
            <div className={styles.actions}>
              {gallery.accessPath ? <><Button disabled={busy || uploading || sending} onClick={copyLink} size="sm" type="button" variant="secondary"><Copy aria-hidden="true" size={15} />Copy client link</Button><a className={styles.openLink} href={gallery.accessPath} rel="noreferrer" target="_blank">Preview gallery <ExternalLink aria-hidden="true" size={14} /></a></> : <Button disabled={busy || uploading || sending} onClick={createLink} size="sm" type="button" variant="secondary">Create client link</Button>}
            </div>
            {imageStatus !== "Ready" ? <p className={styles.help}>Email becomes available once all session images are ready.</p> : !workspace.canSendEmail ? <p className={styles.help}>Email delivery requires Communications and a valid client email.</p> : null}
          </> : null}
          <footer className="module-modal-actions"><Button disabled={sending || busy} onClick={() => setSendOpen(false)} type="button" variant="secondary">Cancel</Button><Button disabled={sending || busy || uploading || !workspace.canSendEmail || imageStatus !== "Ready"} onClick={sendEmail} type="button"><Mail aria-hidden="true" size={15} />{sending ? "Queuing…" : "Send email"}</Button></footer>
        </div>
      </Modal>
      <Modal open={proofSettingsOpen} title="Photo selection settings" onClose={() => { if (!busy) setProofSettingsOpen(false); }}>
        <form className={styles.createForm} onSubmit={saveProofSettings}>
          <label className={styles.field}><span>Included photos</span><input defaultValue={gallery?.selectionAllowance ?? workspace.sessions.find(session => session.id === initialBookingId)?.includedPhotos ?? ""} min={0} max={10000} name="includedCount" required type="number" /></label>
          <div className={styles.field}><span>Extra-photo pricing add-on</span><Button onClick={() => { setEditingProofAddOn(false); setAddOnPicker(true); }} type="button" variant="secondary">{proofAddOn?.name || gallery?.extraPhotoAddOnName || "Choose a per-unit add-on"}</Button>{selectedProofAddOn ? <Button onClick={() => { setEditingProofAddOn(true); setAddOnPicker(true); }} size="sm" type="button" variant="ghost">Edit add-on</Button> : null}</div>
          <p className={styles.help}>{proofAddOn?.priceCents != null ? `${currencyAmount(proofAddOn.priceCents, gallery?.selectionCurrency || "USD")} per extra photo.` : "Choose or create a per-unit add-on that adds one photo. Its saved price is used for each extra photo."}</p>
          <label className={styles.field}><span>Currency</span><input defaultValue={gallery?.selectionCurrency || "USD"} maxLength={3} name="currency" pattern="[A-Za-z]{3}" required /></label>
          <footer className="module-modal-actions"><Button disabled={busy} onClick={() => setProofSettingsOpen(false)} type="button" variant="secondary">Cancel</Button><Button disabled={busy || !(proofAddOn?.id || gallery?.extraPhotoAddOnId)} type="submit">{busy ? "Saving…" : "Save settings"}</Button></footer>
        </form>
      </Modal>
      {addOnPicker ? <ServiceLibraryPicker optional editingItem={editingProofAddOn && selectedProofAddOn ? { ...selectedProofAddOn, libraryItemId: selectedProofAddOn.id } : undefined} rates={[]} onRateSaved={() => {}} selectedItems={[]} onChoose={items => { if (items.length !== 1 || items[0].pricingType !== "PER_UNIT" || items[0].priceCents === null) { notify("Choose one per-unit add-on with a saved price.", "danger"); return; } setProofAddOn(items[0]); setAddOnPicker(false); }} onClose={() => setAddOnPicker(false)} /> : null}
      <section aria-label="Session photos" className={styles.galleryWorkspace}>
        <div className={styles.galleryToolbar}>
          <span className={styles.help}>{gallery ? `${gallery.photoCount} photos` : "No photos yet"}</span>
          {gallery && workspace.canManageMedia ? <form className={styles.gallerySearch} onSubmit={event => { event.preventDefault(); setPage(1); setQuery(searchDraft.trim()); }}>
            <input aria-label="Search session photos" maxLength={180} onChange={event => setSearchDraft(event.target.value)} placeholder="Search photos" type="search" value={searchDraft} />
            <Button aria-label="Search session photos" disabled={busy || uploading} size="sm" type="submit" variant="ghost"><Search aria-hidden="true" size={16} /></Button>
          </form> : null}
        </div>
        <div className={styles.galleryContent}>
        {emailNotice ? <p className={styles.help} role="status">{emailNotice}</p> : null}
        {!gallery ? <p>No photos yet. Upload this session’s photos to get started.</p> : null}
      <Modal open={creating} title={uploadTarget ? `Upload photos: ${uploadTarget.title}` : "Upload session photos"} onClose={() => { if (!busy && !uploading) setCreating(false); }}>
        <form className={styles.createForm} onSubmit={createGallery}>
          {!workspace.sessions.length && !uploadTargetId ? <p className={styles.empty}>Schedule a session for this client before adding photos. <Link href="/admin/appointments/new">Schedule a session</Link></p> : <>
            {!uploadTarget ? <>
            <label className={styles.field}><span>Session name</span><input autoFocus defaultValue={workspace.sessions.find(session => session.id === bookingId)?.name || ""} disabled={busy} maxLength={160} name="title" placeholder="e.g. Wedding Shoot" required /></label>
            <label className={styles.field}><span>Description (optional)</span><textarea disabled={busy} maxLength={4000} name="description" rows={3} /></label>
            <label className={styles.field}><span>Date</span><input defaultValue={workspace.today} disabled={busy} name="sessionDate" required type="date" /></label>
            {workspace.packages.length ? <label className={styles.field}><span>Photo-selection package (optional)</span><select disabled={busy} onChange={event => choosePackage(event.target.value)} value={packageKey}><option value="">Deliver all session photos</option>{workspace.packages.map(item => <option key={`${item.orderId}:${item.productId}`} value={`${item.orderId}:${item.productId}`}>{item.name} · Order {item.orderNumber}</option>)}</select></label> : null}
            {selectedPackage ? <div className={styles.termsFields}>
              <label className={styles.field}><span>Included photos</span><input disabled={busy} min={0} max={10000} onChange={event => setAllowance(event.target.value)} required step={1} type="number" value={allowance} /></label>
              <label className={styles.field}><span>Price per extra photo</span><input disabled={busy} min={0} onChange={event => setExtraPrice(event.target.value)} required step="0.01" type="number" value={extraPrice} /></label>
              <label className={styles.field}><span>Currency</span><input disabled={busy} maxLength={3} onChange={event => setCurrency(event.target.value.toUpperCase())} pattern="[A-Za-z]{3}" required value={currency} /></label>
            </div> : null}
            </> : null}
            {uploadTarget && workspace.canManageMedia ? <Button disabled={busy} onClick={() => { setCreating(false); resetBrowse(); setPickerOpen(true); }} size="sm" type="button" variant="secondary"><ImagePlus aria-hidden="true" size={16} />Choose from Media</Button> : null}
            {!uploadTarget && workspace.canManageMedia ? <label className={styles.field}><span>Photo source</span><select disabled={busy} value={photoSource} onChange={event => { setPhotoSource(event.target.value as "upload" | "media"); setUploads([]); }}><option value="upload">Upload new photos</option><option value="media">Choose from Media</option></select></label> : null}
            {photoSource === "upload" ? <><label className={styles.field}><span>Photos</span><input accept={clientGalleryImageTypes.join(",")} disabled={busy} multiple onChange={selectUploads} ref={uploadInput} required type="file" /></label>
            {uploads.filter(row => row.error).map((row, index) => <p className="error" key={index} role="alert">{row.file.name}: {row.error}</p>)}
            {!workspace.canUpload ? <p className="error" role="alert">Private photo uploads are unavailable. Contact support to enable them.</p> : null}
            <p className={styles.help}>Up to 100 JPG, PNG, WebP, or GIF photos; 25 MiB per photo and 250 MiB per batch. Originals stay private in Media.</p></> : <p className={styles.help}>Save this session gallery, then choose existing private photos from Media.</p>}
          </>}
          <footer className="module-modal-actions"><Button disabled={busy} onClick={() => setCreating(false)} type="button" variant="secondary">Cancel</Button><Button disabled={busy || (!bookingId && !uploadTargetId) || (photoSource === "media" ? !workspace.canManageMedia : !workspace.canUpload || !uploads.some(row => row.status === "ready"))} type="submit">{busy ? "Saving…" : photoSource === "media" ? "Choose photos" : "Save photos"}</Button></footer>
        </form>
      </Modal>

      {gallery && !creating ? <>
        {gallery.description ? <p>{gallery.description}</p> : null}
        {workspace.galleries.length > 1 ? <div className={styles.galleryToolbar}>
          <label className={styles.field}><span>Photo collection</span><select disabled={busy || uploading || sending} onChange={(event) => { setGalleryId(event.target.value); setEmailNotice(""); setSendRequestId(crypto.randomUUID()); resetBrowse(); setUploads([]); if (uploadInput.current) uploadInput.current.value = ""; }} value={galleryId}>{workspace.galleries.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.photoCount} photos</option>)}</select></label>
          <span className="ui-badge">Private</span>
        </div> : null}
        {!pickerOpen && workspace.canManageMedia ? photoGrid : null}
      </> : null}

        {uploads.length ? <details aria-label="Upload results" className={styles.uploadSection} open={uploading || uploads.some(row => row.status === "failed")}>
          <summary>{uploading ? "Images processing…" : `${uploads.filter(row => row.status === "done").length} of ${uploads.length} photos uploaded`}</summary>
          <ul aria-live="polite" className={styles.uploadList}>{uploads.map((row, index) => <li key={`${row.file.name}-${index}`}><span className={styles.uploadFilename}>{row.file.name}</span><span>{row.status === "done" ? <><Check aria-hidden="true" size={14} /> Ready</> : row.status === "uploading" ? "Images processing…" : row.status === "failed" ? "Needs attention" : "Queued"}</span>{row.error ? <small className={styles.uploadError}>{row.error}</small> : null}</li>)}</ul>
          {uploading ? <Button onClick={() => { stopUpload.current = true; }} size="sm" type="button" variant="secondary">Stop after this photo</Button> : <Button onClick={() => setUploads([])} size="sm" type="button" variant="ghost">Clear file list</Button>}
        </details> : null}
        </div>
      </section>
      <Dialog aria-label="Photo preview" className={styles.fullscreen} fullScreen open={previewIndex !== null} onClose={() => setPreviewIndex(null)}>
        {previewIndex !== null ? <>
          <header className={styles.viewerHeader}>
            <span className={styles.viewerName} title={previewPhoto?.filename}>{previewPhoto?.filename || "Photo preview"}</span>
            <div className={styles.viewerActions}>
              {previewPhoto ? <ButtonAnchor aria-label="Download photo" download={previewPhoto.filename} href={previewPhoto.downloadUrl} size="sm" variant="ghost"><Download aria-hidden="true" size={18} /></ButtonAnchor> : null}
              <Button aria-label="Send session to client" disabled={busy || uploading || sending || imageStatus !== "Ready"} onClick={() => { setPreviewIndex(null); setSendOpen(true); }} size="sm" type="button" variant="ghost"><Mail aria-hidden="true" size={18} /></Button>
              <Button aria-label="Close photo preview" onClick={() => setPreviewIndex(null)} size="sm" type="button" variant="ghost"><X aria-hidden="true" size={20} /></Button>
            </div>
          </header>
          <div aria-busy={previewLoading && !previewError} className={styles.viewerImage}>{previewError ? <p role="alert">{previewError}</p> : previewPhoto ? <><Image alt={previewPhoto.alt} height={1600} key={previewPhoto.id} onLoad={() => { setLoadedPreviewId(previewPhoto.id); setFailedPreviewId(""); }} onError={() => setFailedPreviewId(previewPhoto.id)} src={previewPhoto.previewUrl} unoptimized width={2000} />{failedPreviewId === previewPhoto.id ? <p role="alert">Photo could not load. Close the viewer and try again.</p> : loadedPreviewId !== previewPhoto.id ? <p role="status">Loading photo…</p> : null}</> : <p role="status">Loading photo…</p>}</div>
          <footer className={styles.viewerFooter}>
            <Button aria-label="Previous photo" disabled={previewIndex === 0} onClick={() => setPreviewIndex(index => Math.max(0, (index || 0) - 1))} size="sm" type="button" variant="ghost"><ChevronLeft aria-hidden="true" size={22} /></Button>
            <span>{(previewIndex || 0) + 1} / {previewPhotos.total}</span>
            <Button aria-label="Next photo" disabled={previewIndex >= previewPhotos.total - 1} onClick={() => setPreviewIndex(index => Math.min(previewPhotos.total - 1, (index || 0) + 1))} size="sm" type="button" variant="ghost"><ChevronRight aria-hidden="true" size={22} /></Button>
          </footer>
        </> : null}
      </Dialog>
      <Modal bodyClassName={styles.pickerBody} className={styles.picker} onClose={() => { if (!busy) { setPickerOpen(false); resetBrowse(); } }} open={pickerOpen} title="Choose private photos from Media">
        <p className={styles.help}>Search across your private Media library by filename, description, folder, or exact tag. Selections stay checked as you browse pages.</p>
        <form className={styles.search} onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(searchDraft.trim()); }}><label className={styles.field}><span>Search private photos</span><input maxLength={180} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search photos or folders" type="search" value={searchDraft} /></label><Button disabled={busy} size="sm" type="submit" variant="secondary"><Search aria-hidden="true" size={16} /> Search</Button></form>
        {photoGrid}
        <footer className={styles.pickerFooter}><span>{selected.length} selected{selected.length === 100 ? " · Add this batch to select more" : ""}</span><div className={`module-modal-actions ${styles.actions}`}><Button disabled={busy} onClick={() => { setPickerOpen(false); resetBrowse(); }} size="sm" type="button" variant="ghost">Cancel</Button><Button disabled={busy || !selected.length} onClick={addSelected} size="sm" type="button">{busy ? "Adding…" : `Add ${selected.length || "selected"} photo${selected.length === 1 ? "" : "s"}`}</Button></div></footer>
      </Modal>
    </div>
  );
}
