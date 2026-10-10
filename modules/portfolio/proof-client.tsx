"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Expand, ImageOff, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
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

export function ProofClient({ initialView, token }: { initialView: ProofSelectionView; token: string }) {
  const [view, setView] = useState(initialView);
  const [selection, setSelection] = useState<string[]>(initialView.purchase?.selectedItemIds || []);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewedTermsVersion, setReviewedTermsVersion] = useState(initialView.termsVersion);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const submitLock = useRef(false);
  const refreshLock = useRef(false);
  const endpoint = `/api/portfolio/proofs/${encodeURIComponent(token)}`;
  const purchase = view.purchase;
  const locked = Boolean(purchase);
  const canRetryCheckout = Boolean(purchase?.canRetryCheckout && ["PENDING", "FAILED", "BLOCKED"].includes(purchase.status));
  const selectedIds = purchase?.selectedItemIds || selection;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const includedCount = purchase?.includedCount ?? view.includedCount;
  const extraPrice = purchase?.extraImagePriceCents ?? view.extraImagePriceCents;
  const extraCount = purchase?.extraCount ?? Math.max(0, selection.length - includedCount);
  const total = purchase?.totalCents ?? extraCount * extraPrice;
  const currency = purchase?.currency || view.currency;
  const previewIndex = view.items.findIndex((item) => item.id === previewId);
  const preview = view.items[previewIndex];
  const displayed = view.items.filter((item) => filter === "all" || selected.has(item.id));

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

  function proofUrl(itemId: string) {
    return `/api/portfolio/galleries/${encodeURIComponent(view.gallery.slug)}/media/${encodeURIComponent(itemId)}?access=${encodeURIComponent(token)}&variant=CARD`;
  }

  function toggle(itemId: string) {
    if (locked || submitting) return;
    setSelection((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    setError("");
    setNotice("");
  }

  function closeConfirm() {
    if (submitLock.current) return;
    setConfirmOpen(false);
    setConfirmed(false);
  }

  async function finalize() {
    if (submitLock.current || (purchase && !canRetryCheckout) || (!purchase && (!confirmed || !selectedIds.length))) return;
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
      setConfirmed(false);
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
        setNotice("Your selection is final. Your selected originals are ready below.");
      } else {
        setNotice("Your selection is saved. Check its status below before continuing.");
      }
    } catch (cause) {
      // A timed-out response can still have finalized server-side. Reconcile
      // before allowing another attempt; the service also enforces idempotency.
      const latest = await refresh(true);
      if (latest?.purchase) { setConfirmOpen(false); setConfirmed(false); }
      else {
        setConfirmed(false);
        if (latest) setReviewedTermsVersion(latest.termsVersion);
      }
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The request took too long. Check your saved selection below before trying again.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (unavailable) {
    return <main className={styles.unavailable}><h1>This proof link is unavailable</h1><p>It may have expired or been replaced. Ask your photographer for a new private link.</p></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{view.gallery.title}</h1>
          {view.gallery.description ? <p className={styles.description}>{view.gallery.description}</p> : null}
          <p className={styles.instructions}>{locked ? "Your final photo selection is saved." : "Choose the photos you’d like to keep. You can change your choices until you finalize."}</p>
        </div>
        <span className={styles.privateLabel}><LockKeyhole size={15} aria-hidden="true" /> Private gallery</span>
      </header>

      <div className={styles.workspace}>
        <section aria-label="Photo proofs" className={styles.photos}>
          <div className={styles.galleryToolbar}>
            <div aria-label="Show photos" className={styles.filters}>
              <button aria-pressed={filter === "all"} onClick={() => setFilter("all")} type="button">All photos <span>{view.items.length}</span></button>
              <button aria-pressed={filter === "selected"} onClick={() => setFilter("selected")} type="button">Selected <span>{selectedIds.length}</span></button>
            </div>
            <span className={styles.proofNotice}>Watermarked previews</span>
          </div>
          {displayed.length ? (
            <div className={styles.grid}>
              {displayed.map((item) => {
                const index = view.items.findIndex((candidate) => candidate.id === item.id);
                const label = photoLabel(item, index);
                const isSelected = selected.has(item.id);
                const failed = failedImages.includes(item.id);
                return (
                  <figure className={`${styles.photo} ${isSelected ? styles.selected : ""}`} key={item.id}>
                    <div className={styles.photoFrame}>
                      <label className={styles.photoSelect}>
                        <input aria-label={`${isSelected ? "Remove" : "Select"} ${label}`} checked={isSelected} disabled={locked || submitting || failed} onChange={() => toggle(item.id)} type="checkbox" />
                        {failed ? <span className={styles.imageFailure}><ImageOff size={24} aria-hidden="true" /> Preview unavailable</span> : (
                          // The authenticated media endpoint performs the optimization and
                          // watermarking. Never put capability URLs through the image proxy.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt={item.altText || label} decoding="async" draggable={false} loading={index < 4 ? "eager" : "lazy"} onError={() => setFailedImages((ids) => ids.includes(item.id) ? ids : [...ids, item.id])} referrerPolicy="no-referrer" src={proofUrl(item.id)} />
                        )}
                        <span aria-hidden="true" className={styles.checkmark}>{isSelected ? <Check size={17} /> : null}</span>
                      </label>
                      {!failed ? <button aria-label={`View larger proof of ${label}`} className={styles.expand} onClick={() => setPreviewId(item.id)} type="button"><Expand size={17} aria-hidden="true" /></button> : null}
                    </div>
                    <figcaption><span>{label}</span>{isSelected ? <span className={styles.selectedLabel}>Selected</span> : null}</figcaption>
                  </figure>
                );
              })}
            </div>
          ) : <p className={styles.empty}>{view.items.length ? "No photos selected yet. Open All photos to choose your favorites." : "Your photographer hasn’t added any proofs yet. Please check back later."}</p>}
        </section>

        <aside aria-label="Selection summary" className={styles.summary}>
          <h2>{locked ? "Your final selection" : "Your selection"}</h2>
          <dl className={styles.totals} aria-live="polite" aria-atomic="true">
            <div><dt>Photos selected</dt><dd>{selectedIds.length}</dd></div>
            <div><dt>Included in your shoot</dt><dd>{includedCount}</dd></div>
            <div><dt>Extra photos{extraCount ? ` × ${money(extraPrice, currency)}` : ""}</dt><dd>{extraCount}</dd></div>
            <div className={styles.total}><dt>Extra photo total</dt><dd>{money(total, currency)}</dd></div>
          </dl>
          {!locked ? (
            <>
              <p className={styles.summaryHelp}>{extraCount ? `You’ve selected ${extraCount} extra ${extraCount === 1 ? "photo" : "photos"}. Keep them and continue to checkout, or remove extras to stay within your allowance.` : `Your shoot includes up to ${includedCount} photos. Additional photos are ${money(extraPrice, currency)} each.`}</p>
              {extraCount > 0 ? <Button disabled={submitting} onClick={() => { setSelection((ids) => ids.slice(0, includedCount)); setNotice("The most recently selected extra photos were removed. Review your remaining selection."); }} type="button" variant="secondary">Remove {extraCount} extra {extraCount === 1 ? "photo" : "photos"}</Button> : null}
              <Button disabled={!selectedIds.length || submitting} onClick={() => { setConfirmed(false); setReviewedTermsVersion(view.termsVersion); setConfirmOpen(true); }} type="button">Review selection</Button>
              <p className={styles.finePrint}>Finalized selections cannot be changed.</p>
            </>
          ) : (
            <section aria-label="Delivery status" className={styles.delivery}>
              {purchase?.status === "RELEASED" ? (
                <><h3><Check size={18} aria-hidden="true" /> Originals ready</h3><p>Download the original files for your final selection below.</p></>
              ) : purchase?.status === "PENDING" ? (
                <><h3>Awaiting payment</h3><p>Your choices are locked. The original files will appear after your payment is verified.</p></>
              ) : canRetryCheckout ? (
                <><h3>Payment needs attention</h3><p>Your choices are saved and locked. Resume checkout to continue with the same photos and price.</p></>
              ) : (
                <><h3>{purchase?.status === "REFUNDED" ? "Payment refunded" : purchase?.status === "FAILED" ? "Payment needs attention" : "Downloads unavailable"}</h3><p>Your selection is saved, but originals aren’t available. Contact your photographer for help.</p></>
              )}
              {canRetryCheckout ? <Button disabled={submitting} onClick={() => void finalize()} type="button">{submitting ? <><LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> Checking checkout…</> : "Resume or renew checkout"}</Button> : null}
              <Button disabled={refreshing || submitting} onClick={() => void refresh()} type="button" variant="secondary"><RefreshCw className={refreshing ? styles.spinner : ""} size={15} aria-hidden="true" /> {refreshing ? "Checking…" : "Refresh status"}</Button>
              {purchase?.status === "PENDING" ? <p className={styles.finePrint}>Already paid? Confirmation can take a moment. You can safely return to this link later.</p> : null}
            </section>
          )}
          {error && !confirmOpen ? <p className={styles.error} role="alert">{error}</p> : null}
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        </aside>
      </div>

      {purchase?.status === "RELEASED" ? (
        <section aria-labelledby="originals-title" className={styles.downloads}>
          <h2 id="originals-title">Your selected originals</h2>
          <p>These files are available for your finalized selection only. Keep your private gallery link safe.</p>
          {purchase.downloads.length ? <ul>{purchase.downloads.filter((download) => selected.has(download.itemId)).map((download) => (
            <li key={download.itemId}><span>{download.filename}</span><ButtonAnchor download href={download.url} referrerPolicy="no-referrer" size="sm" variant="secondary"><Download size={15} aria-hidden="true" /> Download<span className={styles.srOnly}> {download.filename}</span></ButtonAnchor></li>
          ))}</ul> : <p className={styles.empty}>Your originals aren’t available yet. Ask your photographer for help, or refresh the status.</p>}
        </section>
      ) : null}

      <Modal className={styles.confirmDialog} onClose={closeConfirm} open={confirmOpen} title="Finalize your photo selection?">
        <div className={styles.confirmBody}>
          <p>You’ve selected <strong>{selectedIds.length} {selectedIds.length === 1 ? "photo" : "photos"}</strong>. {extraCount ? `${extraCount} extra ${extraCount === 1 ? "photo costs" : "photos cost"} ${money(total, currency)}.` : "There’s no additional charge."}</p>
          <p>{extraCount ? "Your selection will be locked before you continue to secure checkout. Original downloads unlock after payment is verified." : "Your selection will be locked, and the selected original files will become available."}</p>
          <label className={styles.confirmCheckbox}><input checked={confirmed} disabled={submitting} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I’ve checked my choices and understand this selection cannot be changed.</span></label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.confirmActions}><Button disabled={submitting} onClick={closeConfirm} type="button" variant="secondary">Keep choosing</Button><Button disabled={!confirmed || submitting} onClick={() => void finalize()} type="button">{submitting ? <><LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> Saving selection…</> : extraCount ? `Finalize & pay ${money(total, currency)}` : "Finalize & get originals"}</Button></div>
        </div>
      </Modal>

      <Modal className={styles.previewDialog} onClose={() => setPreviewId(null)} open={Boolean(preview)} title={preview ? photoLabel(preview, previewIndex) : "Photo proof"}>
        {preview ? <div className={styles.previewBody}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={preview.altText || photoLabel(preview, previewIndex)} draggable={false} referrerPolicy="no-referrer" src={proofUrl(preview.id)} />
          <p>This is a watermarked proof. Originals become available after your selection is finalized{extraCount ? " and payment is verified" : ""}.</p>
          {!locked ? <Button aria-pressed={selected.has(preview.id)} disabled={submitting} onClick={() => toggle(preview.id)} type="button" variant={selected.has(preview.id) ? "secondary" : "primary"}>{selected.has(preview.id) ? "Remove from selection" : "Select this photo"}</Button> : null}
        </div> : null}
      </Modal>
    </main>
  );
}
