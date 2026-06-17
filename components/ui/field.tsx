import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  hint?: string;
  label: string;
};

export function Field({ children, className, hint, label, ...props }: FieldProps) {
  return (
    <label className={cx("ui-field", className)} {...props}>
      <span className="ui-field-label">{label}</span>
      {children}
      <span className="ui-field-hint">{hint || ""}</span>
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("ui-input", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("ui-input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("ui-input", "ui-textarea", className)} {...props} />;
}
