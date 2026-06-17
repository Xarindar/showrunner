import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
  density?: "compact" | "normal" | "spacious";
  minHeight?: "sm" | "md" | "lg" | "none";
  reservedHeader?: ReactNode;
  reservedFooter?: ReactNode;
};

export function Card({
  as: Component = "div",
  children,
  className,
  density = "normal",
  minHeight = "md",
  reservedFooter,
  reservedHeader,
  ...props
}: CardProps) {
  return (
    <Component className={cx("ui-card", `ui-card-density-${density}`, `ui-card-min-${minHeight}`, className)} {...props}>
      {reservedHeader ? <div className="ui-card-slot ui-card-slot-header">{reservedHeader}</div> : <div className="ui-card-slot ui-card-slot-header" aria-hidden="true" />}
      <div className="ui-card-body">{children}</div>
      {reservedFooter ? <div className="ui-card-slot ui-card-slot-footer">{reservedFooter}</div> : <div className="ui-card-slot ui-card-slot-footer" aria-hidden="true" />}
    </Component>
  );
}
