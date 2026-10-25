"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { Dialog } from "./dialog";
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
  const titleId = useId();

  return (
    <Dialog
      aria-labelledby={titleId}
      className={cx("ui-dialog", className)}
      onClose={onClose}
      open={open}>
      <div className="ui-modal-head">
        <h2 className="ui-zero" id={titleId}>
          {title}
        </h2>
        <Button aria-label={closeLabel} className="ui-dialog-close" onClick={onClose} size="sm" type="button" variant="ghost">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className={cx("ui-dialog-body", bodyClassName)}>{open ? children : null}</div>
    </Dialog>
  );
}
