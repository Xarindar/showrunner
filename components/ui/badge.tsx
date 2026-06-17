import type { HTMLAttributes } from "react";
import { cx } from "./utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cx("ui-badge", tone !== "neutral" && `ui-badge-${tone}`, className)} {...props} />;
}
