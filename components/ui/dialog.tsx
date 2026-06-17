import type { ButtonHTMLAttributes, DialogHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cx } from "./utils";

type DialogProps = Omit<DialogHTMLAttributes<HTMLDialogElement>, "title"> & {
  description?: ReactNode;
  title?: ReactNode;
};

export function Dialog({ children, className, description, title, ...props }: DialogProps) {
  return (
    <dialog className={cx("ui-dialog", className)} {...props}>
      {title || description ? (
        <header className="ui-dialog-header">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div className="ui-dialog-body">{children}</div>
    </dialog>
  );
}

type DialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

export function DialogClose({ className, label = "Close dialog", ...props }: DialogCloseProps) {
  return (
    <Button aria-label={label} className={cx("ui-dialog-close", className)} size="sm" type="button" variant="ghost" {...props}>
      <X size={16} aria-hidden="true" />
    </Button>
  );
}

type SheetProps = DialogProps & {
  side?: "left" | "right";
};

export function Sheet({ className, side = "right", ...props }: SheetProps) {
  return <Dialog className={cx("ui-sheet", `ui-sheet-${side}`, className)} {...props} />;
}
