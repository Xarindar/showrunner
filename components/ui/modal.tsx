"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cx } from "./utils";

type ModalProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
};

export function Modal({
  bodyClassName,
  children,
  className,
  closeLabel = "Close dialog",
  onClose,
  open,
  title
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      aria-labelledby={titleId}
      className={cx("ui-dialog", className)}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      ref={ref}>
      <div className="ui-modal-head">
        <h2 className="ui-zero" id={titleId}>
          {title}
        </h2>
        <Button aria-label={closeLabel} className="ui-dialog-close" onClick={onClose} size="sm" type="button" variant="ghost">
          <X size={16} />
        </Button>
      </div>
      <div className={cx("ui-dialog-body", bodyClassName)}>{open ? children : null}</div>
    </dialog>
  );
}
