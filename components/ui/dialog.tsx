"use client";

import { useEffect, useLayoutEffect, useRef, type DialogHTMLAttributes, type MouseEvent } from "react";

type DialogProps = Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose" | "onCancel" | "onPointerDown" | "onClick"> & {
  open: boolean;
  fullScreen?: boolean;
  onClose: () => void;
};

/** Native focus management, Escape and backdrop dismissal for every dialog layout. */
export function Dialog({ open, onClose, fullScreen = false, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);

  function isOutside(event: MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  useLayoutEffect(() => {
    const dialog = ref.current;
    const admin = dialog?.closest(".showrunner-admin");
    const workspace = dialog?.closest(".admin-main") ?? admin?.querySelector(".admin-main");
    if (!open || !dialog || !workspace || fullScreen) return;
    const original = { left: dialog.style.left, right: dialog.style.right, top: dialog.style.top, bottom: dialog.style.bottom, maxWidth: dialog.style.maxWidth, maxHeight: dialog.style.maxHeight };
    function align() {
      if (!dialog || !workspace) return;
      Object.assign(dialog.style, original);
      const bounds = workspace.getBoundingClientRect();
      const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
      const top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
      const preferred = getComputedStyle(dialog);
      const inset = Number.parseFloat(preferred.getPropertyValue("--dialog-workspace-inset")) || 0;
      const width = Math.max(0, right - left - inset * 2), height = Math.max(0, bottom - top - inset * 2);
      const maxWidth = preferred.maxWidth, maxHeight = preferred.maxHeight;
      Object.assign(dialog.style, {
        left: `${left}px`, right: `${innerWidth - right}px`, top: `${top}px`, bottom: `${innerHeight - bottom}px`,
        maxWidth: maxWidth === "none" ? `${width}px` : `min(${maxWidth}, ${width}px)`,
        maxHeight: maxHeight === "none" ? `${height}px` : `min(${maxHeight}, ${height}px)`
      });
    }
    align();
    const observer = new ResizeObserver(align);
    observer.observe(workspace);
    window.addEventListener("resize", align);
    return () => { observer.disconnect(); window.removeEventListener("resize", align); Object.assign(dialog.style, original); };
  }, [open, fullScreen]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open, fullScreen]);

  return <dialog {...props} ref={ref}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onClose();
    }}
    onClose={event => { if (event.target === event.currentTarget && open && !event.currentTarget.open) onClose(); }}
    onPointerDown={event => { startedOutside.current = event.target === ref.current && isOutside(event); }}
    onClick={event => {
      if (startedOutside.current && event.target === ref.current && isOutside(event)) onClose();
      startedOutside.current = false;
    }} />;
}
