import type { InputHTMLAttributes, ReactNode } from "react";
import { Switch } from "./switch";
import { cx } from "./utils";

type SwitchRevealProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  label: ReactNode;
  switchClassName?: string;
};

export function SwitchReveal({ children, className, description, label, switchClassName, ...props }: SwitchRevealProps) {
  return (
    <div className={cx("ui-switch-reveal", className)}>
      <div className="ui-switch-reveal-row">
        <Switch className={switchClassName} description={description} label={label} {...props} />
        <div className="ui-reveal">
          <div className="ui-reveal-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
