"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function revealInvalidSessionField(event: FormEvent<HTMLFormElement>) {
  let parent = (event.target as HTMLElement).parentElement;
  while (parent && parent !== event.currentTarget) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}

function sessionFormSnapshot(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form)].filter(([name]) => !name.startsWith("$ACTION_")));
}

export function SessionDraftGuard({ formId }: { formId: string }) {
  const initial = useRef<string | null>(null);
  const allowReload = useRef(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);
  const warningRef = useRef<HTMLParagraphElement>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const snapshot = () => sessionFormSnapshot(form);
    initial.current ??= snapshot();
    const changed = () => snapshot() !== initial.current;
    const leave = (event: BeforeUnloadEvent) => {
      if (allowReload.current || !changed()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // shortcut: Links and reloads are guarded; add router history support to protect browser Back.
    const followLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (changed() && (pending || !window.confirm("Leave without saving? Your session and package changes will be lost."))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const submitRelatedForm = (event: SubmitEvent) => {
      if (event.target === form || !event.submitter || !form.contains(event.submitter) || !changed()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPhotoWarning(true);
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", followLink, true);
    document.addEventListener("submit", submitRelatedForm, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", followLink, true);
      document.removeEventListener("submit", submitRelatedForm, true);
    };
  }, [formId, pending]);

  useEffect(() => { if (photoWarning) warningRef.current?.focus(); }, [photoWarning]);
  function reloadPreview() {
    allowReload.current = true;
    setConfirmReload(false);
    setReloading(true);
    window.location.reload();
  }

  return <>
    {photoWarning && <p className="error" ref={warningRef} role="alert" tabIndex={-1}>Save your session and package changes before changing the booking photo. Your edits are still here.</p>}
    {process.env.NODE_ENV === "development" && <>
      <Button type="button" variant="secondary" disabled={reloading} onClick={() => {
        const form = document.getElementById(formId);
        if (pending || (form instanceof HTMLFormElement && sessionFormSnapshot(form) !== initial.current)) {
          setConfirmReload(true);
        } else reloadPreview();
      }}>{reloading ? "Reloading…" : "Refresh preview"}</Button>
      {confirmReload && <Modal open title="Refresh preview?" onClose={() => setConfirmReload(false)}>
        <p>{pending ? "A save is still in progress. Refreshing may interrupt it." : "Refreshing discards your unsaved session and package changes."}</p>
        <div className="module-modal-actions">
          <Button type="button" variant="secondary" autoFocus onClick={() => setConfirmReload(false)}>Keep editing</Button>
          <Button type="button" onClick={reloadPreview}>Refresh preview</Button>
        </div>
      </Modal>}
    </>}
  </>;
}
