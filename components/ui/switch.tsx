import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  description?: ReactNode;
  label?: ReactNode;
};

export function Switch({ className, description, label, ...props }: SwitchProps) {
  const hasCopy = Boolean(label || description);

  return (
    <label className={cx("ui-switch", hasCopy && "ui-switch-with-copy", className)}>
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
