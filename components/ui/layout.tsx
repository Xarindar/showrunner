import type { CSSProperties, HTMLAttributes } from "react";
import { cx } from "./utils";

type StackProps = HTMLAttributes<HTMLDivElement> & {
  gap?: "2" | "3" | "4" | "5" | "6" | "7";
};

export function Stack({ className, gap = "4", ...props }: StackProps) {
  return <div className={cx("ui-stack", `ui-gap-${gap}`, className)} {...props} />;
}

type ClusterProps = HTMLAttributes<HTMLDivElement> & {
  align?: "center" | "start" | "end";
  gap?: "2" | "3" | "4" | "5";
};

export function Cluster({ align = "center", className, gap = "3", ...props }: ClusterProps) {
  return <div className={cx("ui-cluster", `ui-gap-${gap}`, `ui-align-${align}`, className)} {...props} />;
}

type EqualGridProps = HTMLAttributes<HTMLDivElement> & {
  min?: string;
};

export function EqualGrid({ className, min = "240px", style, ...props }: EqualGridProps) {
  return <div className={cx("ui-equal-grid", className)} style={{ "--ui-grid-min": min, ...style } as CSSProperties} {...props} />;
}

type ReservedSlotProps = HTMLAttributes<HTMLDivElement> & {
  blockSize?: string;
};

export function ReservedSlot({ blockSize = "24px", className, style, ...props }: ReservedSlotProps) {
  return <div className={cx("ui-reserved-slot", className)} style={{ "--ui-slot-size": blockSize, ...style } as CSSProperties} {...props} />;
}
