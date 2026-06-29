import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  description?: ReactNode;
  label?: ReactNode;
  variant?: "card" | "inline";
};

export function Switch({ className, description, label, variant = "card", ...props }: SwitchProps) {
  const hasCopy = Boolean(label || description);
  const copyClassName = variant === "inline" ? "ui-switch-inline" : "ui-switch-with-copy";

  return (
    <label className={cx("ui-switch", hasCopy && copyClassName, className)}>
      {hasCopy ? (
        <span className="ui-switch-copy">
          {label ? <strong>{label}</strong> : null}
          {description ? <span>{description}</span> : null}
        </span>
      ) : null}
      <input className="ui-switch-input" role="switch" type="checkbox" {...props} />
      <span aria-hidden="true" className="ui-switch-track">
        <span className="ui-switch-thumb" />
      </span>
    </label>
  );
}
