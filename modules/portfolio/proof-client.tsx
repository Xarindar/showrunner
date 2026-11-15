"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Share2, Mail, Phone, Camera, X, ImageOff, LoaderCircle, RefreshCw } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import type { ProofSelectionView } from "@/lib/portfolio/purchases";
import styles from "./proof-client.module.css";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

function photoLabel(item: ProofSelectionView["items"][number], index: number) {
  return item.title || `Photo ${index + 1}`;
}

function checkoutDestination(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

export function ProofClient({ initialView, token, brand = { name: "Photography", logoUrl: "" } }: { initialView: ProofSelectionView; token: string; brand?: { name: string; logoUrl: string; theme?: "jazzr"; firstName?: string } }) {
  const [view, setView] = useState(initialView);
  const [selection, setSelection] = useState<string[]>(initialView.purchase?.selectedItemIds || []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingExtraId, setPendingExtraId] = useState<string | null>(null);
  const [extrasConsentVersion, setExtrasConsentVersion] = useState<string | null>(null);
  const [reviewedTermsVersion, setReviewedTermsVersion] = useState(initialView.termsVersion);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareText, setShareText] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const submitLock = useRef(false);
  const refreshLock = useRef(false);
  const endpoint = `/api/portfolio/proofs/${encodeURIComponent(token)}`;
  const purchase = view.purchase;
  const bundle = purchase?.bundle;
  const archiveState = bundle?.state;
  const bundleRequested = useRef(false);
  const deliveryHeading = useRef<HTMLHeadingElement>(null);
  const locked = Boolean(purchase);
  const canRetryCheckout = Boolean(purchase?.canRetryCheckout && ["PENDING", "FAILED", "BLOCKED"].includes(purchase.status));
  const selectedIds = purchase?.selectedItemIds || selection;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const includedCount = purchase?.includedCount ?? view.includedCount;
  const extraPrice = purchase?.extraImagePriceCents ?? view.extraImagePriceCents;
  const extraCount = purchase?.extraCount ?? Math.max(0, selection.length - includedCount);
  const remainingCount = Math.max(0, includedCount - selectedIds.length);
  const total = purchase?.totalCents ?? extraCount * extraPrice;
  const currency = purchase?.currency || view.currency;
  const previewIndex = view.items.findIndex((item) => item.id === previewId);
  const preview = view.items[previewIndex];
  const displayed = view.items.filter((item) => filter === "all" || selected.has(item.id));

  useEffect(() => {
    if (locked || unavailable) return;
    const syncHeader = () => {
      const scrollY = window.scrollY;
      setCompactHeader(compact => scrollY > (compact ? 24 : 72));
    };
    window.addEventListener("scroll", syncHeader, { passive: true });
    syncHeader();
    return () => window.removeEventListener("scroll", syncHeader);
  }, [locked, unavailable]);

  useEffect(() => {
    // Preserve Next's history state; only gallery layers add entries, not each photo.
    window.history.replaceState({ ...window.history.state, proofGallery: { id: initialView.gallery.id, filter: "all", previewId: null } }, "");
    const restore = (event: PopStateEvent) => {
      const state = event.state?.proofGallery;
      const sameGallery = state?.id === initialView.gallery.id;
      setFilter(sameGallery && state.filter === "selected" ? "selected" : "all");
      setPreviewId(sameGallery && typeof state.previewId === "string" ? state.previewId : null);
      setPendingExtraId(null);
      setConfirmOpen(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialView.gallery.id]);

  function openPreview(id: string) {
    window.history.pushState({ ...window.history.state, proofGallery: { id: view.gallery.id, filter, previewId: id } }, "");
    setPreviewId(id);
  }

  function closePreview() {
    window.history.back();
  }

  function changeFilter(next: "all" | "selected") {
    if (next === filter) return;
    if (next === "all") window.history.back();
    else {
      window.history.pushState({ ...window.history.state, proofGallery: { id: view.gallery.id, filter: next, previewId: null } }, "");
      setFilter(next);
    }
  }

  const refresh = useCallback(async (silent = false) => {
    if (refreshLock.current) return null;
    refreshLock.current = true;
    if (!silent) { setRefreshing(true); setError(""); setNotice(""); }
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      if (response.status === 404 || response.status === 403) {
        setUnavailable(true);
        setConfirmOpen(false);
        setPreviewId(null);
        return null;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t check your selection. Try again.");
      const latest = result as ProofSelectionView;
      setView(latest);
      if (latest.purchase) setSelection(latest.purchase.selectedItemIds);
      else {
        const availableIds = new Set(latest.items.map((item) => item.id));
        // Only draft choices can be reconciled. A finalized purchase keeps its
        // immutable IDs even if an original later becomes unavailable.
        setSelection((current) => current.filter((id) => availableIds.has(id)));
        if (selection.some((id) => !availableIds.has(id))) {
          setNotice("Some previously selected proofs are no longer available and have been removed. Please review your selection.");
        }
      }
      if (!silent && latest.purchase) setNotice(latest.purchase.status === "PENDING" ? "Payment is still awaiting confirmation. Your selection is saved." : "Your selection is up to date.");
      return latest;
    } catch (cause) {
      if (!silent) setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "We couldn’t reach the gallery. Check your connection and try again.");
      return null;
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [endpoint, selection]);

  // Returning from hosted checkout or bfcache always asks the server. A return
  // URL or query-string payment flag is never evidence of payment.
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refresh(true); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) void refresh(true); };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", pageShow);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", pageShow);
    };
  }, [refresh]);

  useEffect(() => {
    if (purchase?.status !== "PENDING" || unavailable) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [purchase?.status, refresh, unavailable]);

  const prepareBundle = useCallback(async (retry = false) => {
    setError("");
    try {
      const response = await fetch(`${endpoint}/bundle${retry ? "?retry=1" : ""}`, {
        method: "POST", headers: { "X-Proof-Request": "1" }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(await response.text());
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "We couldn’t start the ZIP. Try again.");
    }
  }, [endpoint, refresh]);

  useEffect(() => {
    if (bundle?.state !== "NEW" || bundleRequested.current || unavailable) return;
    bundleRequested.current = true;
    void Promise.resolve().then(() => prepareBundle());
  }, [bundle?.state, prepareBundle, unavailable]);

  useEffect(() => {
    if (!archiveState || !["NEW", "QUEUED", "BUILDING"].includes(archiveState) || unavailable) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 4000);
    return () => window.clearInterval(timer);
  }, [archiveState, refresh, unavailable]);

  useEffect(() => {
    if (locked && !initialView.purchase) deliveryHeading.current?.focus();
  }, [locked, initialView.purchase]);

  async function shareGallery() {
    const text = `Hey, the pictures from ${brand.name} are ready! Check them out here!`;
    const url = new URL(`/proofs/${encodeURIComponent(token)}`, window.location.origin).href;
    const message = `${text} ${url}`;
    setShareNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(message);
      setShareNotice("Message and link copied.");
    } catch {
      setShareText(message);
    }
  }

  function proofUrl(itemId: string, thumbnail = false) {
    return `/api/portfolio/galleries/${encodeURIComponent(view.gallery.slug)}/media/${encodeURIComponent(itemId)}?access=${encodeURIComponent(token)}&variant=${thumbnail ? "THUMBNAIL" : "CARD"}`;
  }

  function toggle(itemId: string) {
    if (locked || submitting) return;
    if (!selected.has(itemId) && selection.length >= includedCount && extrasConsentVersion !== view.termsVersion) {
      setPendingExtraId(itemId);
      return;
    }
    setSelection(current => current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId]);
    setError("");
    setNotice("");
  }

  function acceptExtras() {
    if (!pendingExtraId || locked || submitting) return;
    if (view.items.some(item => item.id === pendingExtraId) && !failedImages.includes(pendingExtraId)) {
      setExtrasConsentVersion(view.termsVersion);
      setSelection(current => current.includes(pendingExtraId) ? current : [...current, pendingExtraId]);
      setError(""); setNotice("");
    }
    setPendingExtraId(null);
  }

  function closeConfirm() {
    if (submitLock.current) return;
    setConfirmOpen(false);
  }

  async function finalize() {
    if (submitLock.current || (purchase && !canRetryCheckout) || (!purchase && (!confirmOpen || !selectedIds.length))) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Proof-Request": "1" },
        body: JSON.stringify({ itemIds: selectedIds, expectedTermsVersion: purchase ? view.termsVersion : reviewedTermsVersion }),
        signal: AbortSignal.timeout(45000)
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) setUnavailable(true);
        throw new Error(result.error || "We couldn’t finalize your selection. Please try again.");
      }
      setConfirmOpen(false);
      const latest = await refresh(true);
      const destination = checkoutDestination(result.checkoutUrl);
      if (destination && result.status === "PENDING" && latest?.purchase?.status === "PENDING") {
        try {
          // Kept only in this tab; never send the gallery capability to the
          // payment provider in its return URL, metadata, or referrer.
          sessionStorage.setItem("portfolio:proof-return", `/proofs/${encodeURIComponent(token)}`);
        } catch { /* The original private link still works if browser storage is unavailable. */ }
        window.location.assign(destination);
      } else if (latest?.purchase?.status === "RELEASED") {
        setNotice("");
      } else {
        setNotice("Your selection is saved.");
      }
    } catch (cause) {
      // A timed-out response can still have finalized server-side. Reconcile
      // before allowing another attempt; the service also enforces idempotency.
      const latest = await refresh(true);
      if (latest?.purchase) setConfirmOpen(false);
      else if (latest) setReviewedTermsVersion(latest.termsVersion);
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The request took too long. Check your saved selection before trying again.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const navigatePreview = useCallback((direction: number) => {
    const index = view.items.findIndex(item => item.id === previewId);
    const nextId = view.items[(index + direction + view.items.length) % view.items.length]?.id || null;
    window.history.replaceState({ ...window.history.state, proofGallery: { id: view.gallery.id, filter, previewId: nextId } }, "");
    setPreviewId(nextId);
  }, [view.items, view.gallery.id, filter, previewId]);

  useEffect(() => {
    if (!previewId || confirmOpen || pendingExtraId) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigatePreview(event.key === "ArrowRight" ? 1 : -1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [previewId, confirmOpen, pendingExtraId, navigatePreview]);

  function selectionControl(item: ProofSelectionView["items"][number], index: number) {
    const isSelected = selected.has(item.id);
    return <label className={styles.selectPhoto} title={isSelected ? "Remove from selection" : "Select photo"}>
      <input aria-label={`${isSelected ? "Remove" : "Select"} ${photoLabel(item, index)}`} checked={isSelected} disabled={locked || submitting || failedImages.includes(item.id)} onChange={() => toggle(item.id)} type="checkbox" />
      <span>{isSelected ? <><Check aria-hidden="true" size={15} />Selected</> : "Select"}</span>
    </label>;
  }

  if (unavailable) {
    return <main className={styles.unavailable}><h1>This proof link is unavailable</h1><p>It may have expired or been replaced. Ask your photographer for a new private link.</p></main>;
  }

  if (purchase) {
    const ready = bundle?.state === "READY";
    const jazzrReady = ready && brand.theme === "jazzr";
    const released = purchase.status === "RELEASED";
    const preparing = Boolean(bundle && ["NEW", "QUEUED", "BUILDING"].includes(bundle.state) && !error);
    const title = ready ? (jazzrReady ? "Your photos are ready!" : "Your photos are ready") : preparing ? "Preparing your photos" :
      released ? (bundle ? "We couldn’t prepare your ZIP" : "Download unavailable") :
      purchase.status === "PENDING" ? "Awaiting payment confirmation" :
      purchase.status === "EXPIRED" ? "Download window expired" :
      purchase.status === "REFUNDED" ? "Payment refunded" : canRetryCheckout ? "Payment needs attention" : "Download unavailable";
    const count = purchase.selectedItemIds.length;
    const size = bundle?.sizeBytes == null ? "" : new Intl.NumberFormat("en", { maximumFractionDigits: 1, style: "unit", unitDisplay: "narrow",
      unit: bundle.sizeBytes >= 1e9 ? "gigabyte" : "megabyte" }).format(bundle.sizeBytes / (bundle.sizeBytes >= 1e9 ? 1e9 : 1e6));
    return <main className={`${styles.page} ${styles.deliveryPage} ${brand.theme === "jazzr" ? styles.jazzrDelivery : ""}`}>
      {!jazzrReady && <header className={styles.header}>
        <div className={styles.brand}>{brand.logoUrl ? <Image alt={brand.name} height={70} width={280} src={brand.logoUrl} unoptimized referrerPolicy="no-referrer" /> : <span>{brand.name}</span>}</div>
      </header>}
      <section className={`${styles.handoff} ${jazzrReady ? styles.jazzrReady : ""}`} aria-labelledby="delivery-heading">
        {jazzrReady && <Image className={styles.readyIcon} src="/proof-delivery/download-folder.png" width={80} height={80} alt="" unoptimized />}
        <div aria-live="polite" aria-atomic="true">
          <h1 id="delivery-heading" ref={deliveryHeading} tabIndex={-1}>{title}</h1>
          <p>{jazzrReady ? `${brand.firstName ? `${brand.firstName}, thank` : "Thank"} you for choosing Jazzr Photography. We hope you enjoyed your shoot and love your photos!` :
            ready ? "Your full-resolution originals are packed into one ZIP." :
            preparing ? "We’re packing your selected originals into one ZIP. You can close this page and come back to the same link." :
            released && bundle ? "Your selection is saved. Try preparing the ZIP again." :
            purchase.status === "PENDING" ? "Your selection is saved. We’ll prepare your ZIP as soon as payment is verified. You can return to this link later." :
            canRetryCheckout ? "Your selection is saved. Resume checkout to complete payment for the same photos." :
            purchase.status === "EXPIRED" ? "Your 14-day download window has ended. Contact your photographer for help." :
            "If this persists, contact your photographer."}</p>
        </div>
        {ready && <p>Downloads are available for 14 days after your selections are finalized, until <time dateTime={purchase.downloadExpiresAt}>{purchase.downloadExpiresLabel}</time>.</p>}
        {!jazzrReady && <div className={styles.handoffDetails}><strong>{view.gallery.title}</strong><span>{count} {count === 1 ? "photo" : "photos"}{size ? ` · ZIP · ${size}` : ""}</span></div>}
        {preparing && <div className={styles.archiveProgress} aria-hidden="true" />}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={`${styles.handoffActions} ${ready ? styles.readyActions : ""}`}>
          {ready ? <>
            <ButtonAnchor download href={`${endpoint}/bundle`} referrerPolicy="no-referrer"><Download size={17} aria-hidden="true" /> Download ZIP</ButtonAnchor>
            <Button onClick={() => void shareGallery()} type="button" variant="secondary"><Share2 size={17} aria-hidden="true" /> Share</Button>
          </> : <>
            {released && bundle && !preparing && <Button onClick={() => void prepareBundle(true)} type="button">Retry preparation</Button>}
            {canRetryCheckout && <Button disabled={submitting} onClick={() => void finalize()} type="button">{submitting ? "Checking checkout…" : "Resume or renew checkout"}</Button>}
            <Button disabled={refreshing || submitting} onClick={() => void refresh()} type="button" variant="secondary"><RefreshCw size={15} aria-hidden="true" />{refreshing ? "Checking…" : "Refresh status"}</Button>
          </>}
        </div>
        {ready && !jazzrReady && <p className={styles.deliveryTip}>Open the ZIP to find your original photos.</p>}
        {shareNotice && <p className={styles.deliveryTip} role="status">{shareNotice}</p>}
        {shareText && <label className={styles.copyMessage}>Copy this message to share your photos
          <textarea readOnly rows={3} value={shareText} onFocus={event => event.currentTarget.select()} />
        </label>}
        {jazzrReady && <nav className={styles.readyContacts} aria-label="Contact Jazzr Photography">
          <ButtonAnchor href="mailto:jazzrphotography@gmail.com" variant="secondary"><Mail size={16} aria-hidden="true" /> Email</ButtonAnchor>
          <ButtonAnchor href="tel:+15737182148" variant="secondary"><Phone size={16} aria-hidden="true" /> Call</ButtonAnchor>
          <ButtonAnchor href="https://www.instagram.com/jazzrphotography/" target="_blank" rel="noopener noreferrer" variant="secondary"><Camera size={16} aria-hidden="true" /> Instagram</ButtonAnchor>
        </nav>}
      </section>
    </main>;
  }

  return (
    <main className={styles.page}>
      <header className={`${styles.header} ${compactHeader ? styles.compactHeader : ""}`}>
        <div className={styles.brand}>{brand.logoUrl ? <Image alt={brand.name} height={70} width={280} src={brand.logoUrl} unoptimized referrerPolicy="no-referrer" /> : <span>{brand.name}</span>}</div>
        <h1 className={styles.srOnly}>{view.gallery.title}</h1>
      </header>

      <div className={styles.workspace}>
        <section aria-label="Photo proofs" className={styles.photos}>
          <div className={styles.galleryToolbar}>
            <div aria-label="Show photos" className={styles.filters}>
              <button aria-pressed={filter === "all"} onClick={() => changeFilter("all")} type="button">All photos <span>{view.items.length}</span></button>
              <button aria-pressed={filter === "selected"} onClick={() => changeFilter("selected")} type="button">Selected <span>{selectedIds.length}</span></button>
            </div>
            <div className={styles.galleryHelp}><span className={styles.proofNotice}>{view.gallery.title}</span>{!locked && view.items.length > 0 ? <button aria-expanded={helpOpen} className={styles.helpButton} onClick={() => setHelpOpen(open => !open)} type="button">How to choose</button> : null}</div>
          </div>
          {helpOpen && !locked && view.items.length > 0 ? <aside aria-label="How to choose photos" className={styles.helpTip} role="note">
            <p>Tap <strong>Select</strong> to choose a photo. Tap the photo to view it larger. We’ll ask before adding paid extras.</p>
            <button aria-label="Dismiss instructions" className={styles.helpButton} onClick={() => setHelpOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
          </aside> : null}
          {displayed.length ? (
            <div className={styles.grid}>
              {displayed.map((item) => {
                const index = view.items.findIndex((candidate) => candidate.id === item.id);
                const label = photoLabel(item, index);
                const failed = failedImages.includes(item.id);
                return (
                  <figure className={styles.photo} key={item.id}>
                    <div className={styles.photoFrame} onContextMenu={event => event.preventDefault()} onCopy={event => event.preventDefault()}>
                      <button aria-label={`View larger proof of ${label}`} className={styles.photoOpen} disabled={failed} onClick={() => openPreview(item.id)} type="button">
                        {failed ? <span className={styles.imageFailure}><ImageOff size={24} aria-hidden="true" />Preview unavailable</span> : (
                          // Private thumbnails are small, burned-in proofs; originals never enter the grid.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt={item.altText || label} decoding="async" draggable={false} loading={index < 8 ? "eager" : "lazy"} onError={() => setFailedImages(ids => ids.includes(item.id) ? ids : [...ids, item.id])} referrerPolicy="no-referrer" src={proofUrl(item.id, true)} />
                        )}
                      </button>
                      {selectionControl(item, index)}
                    </div>
                  </figure>
                );
              })}
            </div>
          ) : <p className={styles.empty}>{view.items.length ? "No photos selected yet. Open All photos to choose your favorites." : "Your photographer hasn’t added any proofs yet. Please check back later."}</p>}
        </section>

        <aside aria-label="Selection summary" className={styles.summary}>
          <div aria-live="polite" aria-atomic="true"><strong>Select {remainingCount} {remainingCount === 1 ? "Photo" : "Photos"}</strong></div>
          <Button disabled={!selectedIds.length || submitting} onClick={() => { setReviewedTermsVersion(view.termsVersion); setConfirmOpen(true); }} type="button">{extraCount ? `Review cart · ${money(total, currency)}` : "Next"}</Button>
          {error && !confirmOpen ? <p className={styles.error} role="alert">{error}</p> : null}
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        </aside>
      </div>

      <Modal className={styles.confirmDialog} onClose={closeConfirm} open={confirmOpen} title="Finalize Selections?">
        <div className={styles.confirmBody}>
          <p>After you finalize your pics, you won’t be able to make changes.</p>
          {extraCount > 0 && <p>You’ll pay <strong>{money(total, currency)}</strong> for {extraCount} extra {extraCount === 1 ? "photo" : "photos"} at checkout.</p>}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.confirmActions}>
            <Button disabled={submitting} onClick={closeConfirm} type="button" variant="secondary">Cancel</Button>
            <Button disabled={submitting || !selectedIds.length} onClick={() => void finalize()} type="button">
              {submitting ? <><LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> Saving selection…</> : "Finalize"}
            </Button>
          </div>
        </div>
      </Modal>

      <Dialog aria-label="Photo proof" className={styles.viewer} fullScreen onClose={closePreview} open={Boolean(preview)}>
        {preview ? <>
          <header className={styles.viewerHeader} onClick={event => { if (event.target === event.currentTarget) closePreview(); }}><button aria-label="Close photo proof" className={styles.viewerControl} onClick={closePreview} type="button"><X size={24} /></button><span>{previewIndex + 1} / {view.items.length}</span></header>
          <div className={styles.viewerImage} onClick={event => { const moved = swiped.current; swiped.current = false; if (event.target === event.currentTarget && !moved) closePreview(); }} onContextMenu={event => event.preventDefault()} onCopy={event => event.preventDefault()} onTouchStart={event => { swiped.current = false; const point = event.touches[0]; swipeStart.current = { x: point.clientX, y: point.clientY }; }} onTouchEnd={event => { const start = swipeStart.current; swipeStart.current = null; const end = event.changedTouches[0]; swiped.current = Boolean(start && (Math.abs(end.clientX - start.x) > 10 || Math.abs(end.clientY - start.y) > 10)); if (start && Math.abs(end.clientX - start.x) > 50 && Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y)) navigatePreview(end.clientX < start.x ? 1 : -1); }}>
            <div className={`${styles.viewerPhoto} ${selected.has(preview.id) ? styles.selected : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={preview.altText || photoLabel(preview, previewIndex)} draggable={false} referrerPolicy="no-referrer" src={proofUrl(preview.id)} />
            </div>
          </div>
          <nav aria-label="Photo navigation" className={styles.viewerNavigation} onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
          <button aria-label="Previous photo" className={styles.viewerControl} disabled={view.items.length < 2} onClick={() => navigatePreview(-1)} type="button"><ChevronLeft size={28} /></button>
          {selectionControl(preview, previewIndex)}
          <button aria-label="Next photo" className={styles.viewerControl} disabled={view.items.length < 2} onClick={() => navigatePreview(1)} type="button"><ChevronRight size={28} /></button>
          </nav>
        </> : null}
      </Dialog>
      <Modal className={styles.confirmDialog} onClose={() => setPendingExtraId(null)} open={pendingExtraId !== null} title="Package limit reached">
        <div className={styles.confirmBody}>
          <p>You’ve reached your package limit. Add this photo for <strong>{money(extraPrice, currency)}</strong>?</p>
          <p>After you accept, additional photos will be added to your cart at {money(extraPrice, currency)} each without asking again.</p>
          <div className={styles.confirmActions}><Button onClick={() => setPendingExtraId(null)} type="button" variant="secondary">Keep my package</Button><Button disabled={locked || submitting} onClick={acceptExtras} type="button">Add photo for {money(extraPrice, currency)}</Button></div>
        </div>
      </Modal>
    </main>
  );
}
