"use client";

import NextImage from "next/image";
import { Search, X } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui";

const openLightboxEvent = "public-gallery:open-lightbox";

type PublicGalleryLightboxProps = {
  alt: string;
  caption?: string | null;
  fullImageSrc: string;
  height: number;
  itemId: string;
  nextItemId: string;
  positionLabel: string;
  previousItemId: string;
  thumbnailSrc: string;
  title: string;
  width: number;
};

function openGalleryLightbox(itemId: string) {
  window.dispatchEvent(new CustomEvent(openLightboxEvent, { detail: { itemId } }));
}

function focusableElements(dialog: HTMLDialogElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
}

export function PublicGalleryLightbox({
  alt,
  caption,
  fullImageSrc,
  height,
  itemId,
  nextItemId,
  positionLabel,
  previousItemId,
  thumbnailSrc,
  title,
  width
}: PublicGalleryLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, []);

  const openDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<{itemId?: string;}>).detail;
      if (detail?.itemId === itemId) openDialog();
    }

    window.addEventListener(openLightboxEvent, handleOpen);
    return () => window.removeEventListener(openLightboxEvent, handleOpen);
  }, [itemId, openDialog]);

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) closeDialog();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      closeDialog();
      return;
    }

    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const elements = focusableElements(dialog);
    if (!elements.length) return;

    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openAdjacentLightbox(targetItemId: string) {
    closeDialog();
    window.requestAnimationFrame(() => openGalleryLightbox(targetItemId));
  }

  return (
    <>
      <button
        aria-controls={`lightbox-${itemId}`}
        aria-haspopup="dialog"
        className="public-gallery-image-link"
        onClick={openDialog}
        type="button">
        
        <NextImage
          src={thumbnailSrc}
          alt={alt}
          width={1200}
          height={900}
          sizes="(max-width: 860px) 100vw, 33vw"
          unoptimized />
        
        <span>
          <Search size={16} />
          Open
        </span>
      </button>

      <dialog
        aria-describedby={caption ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="public-gallery-lightbox"
        id={`lightbox-${itemId}`}
        onClick={handleDialogClick}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}>
        
        <div className="public-gallery-lightbox-panel">
          <div className="public-gallery-lightbox-toolbar">
            <div>
              <strong id={titleId}>{title}</strong>
              {caption ? <p id={descriptionId}>{caption}</p> : null}
            </div>
            <Button onClick={closeDialog} ref={closeButtonRef} type="button" variant="secondary">
              <X size={16} />
              Close
            </Button>
          </div>
          <NextImage src={fullImageSrc} alt={alt} width={width} height={height} sizes="100vw" unoptimized />
          <div className="public-gallery-lightbox-nav">
            <Button onClick={() => openAdjacentLightbox(previousItemId)} type="button" variant="secondary">
              Previous
            </Button>
            <span>{positionLabel}</span>
            <Button onClick={() => openAdjacentLightbox(nextItemId)} type="button" variant="secondary">
              Next
            </Button>
          </div>
        </div>
      </dialog>
    </>);

}
