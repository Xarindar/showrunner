"use client";

import { useEffect, useRef, type DialogHTMLAttributes, type MouseEvent } from "react";

type DialogProps = Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose" | "onCancel" | "onPointerDown" | "onClick"> & {
  open: boolean;
  onClose: () => void;
};

/** Native focus management, Escape and backdrop dismissal for every dialog layout. */
export function Dialog({ open, onClose, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);

  function isOutside(event: MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
