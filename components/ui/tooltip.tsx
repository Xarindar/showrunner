import { useId, type ReactNode } from "react";
import { cx } from "./utils";

type TooltipProps = {
  children: ReactNode;
  className?: string;
  content: ReactNode;
  focusable?: boolean;
};

export function Tooltip({ children, className, content, focusable = true }: TooltipProps) {
  const tooltipId = useId();

  return (
    <span aria-describedby={tooltipId} className={cx("ui-tooltip", className)} tabIndex={focusable ? 0 : undefined}>
      {children}
      <span className="ui-tooltip-content" id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
