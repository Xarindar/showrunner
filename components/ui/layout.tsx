import type { CSSProperties, ElementType, HTMLAttributes } from "react";
import { cx } from "./utils";

type StackProps = HTMLAttributes<HTMLDivElement> & {
  gap?: "2" | "3" | "4" | "5" | "6" | "7";
};

export function Stack({ className, gap = "4", ...props }: StackProps) {
  return <div className={cx("ui-stack", `ui-gap-${gap}`, className)} {...props} />;
}

type EqualGridProps = HTMLAttributes<HTMLDivElement> & {
  as?: ElementType;
  min?: string;
};

export function EqualGrid({ as: Component = "div", className, min = "240px", style, ...props }: EqualGridProps) {
  return <Component className={cx("ui-equal-grid", className)} style={{ "--ui-grid-min": min, ...style } as CSSProperties} {...props} />;
}
