import type { HTMLAttributes } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cx } from "./utils";

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: "short" | "medium" | "long" | "full";
};

export function SkeletonLine({ className, width = "full", ...props }: SkeletonProps) {
  return <span className={cx("ui-skeleton-line", `ui-skeleton-${width}`, className)} {...props} />;
}

export function SkeletonBlock({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-skeleton-block", className)} {...props} />;
}

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  description?: string;
  title: string;
};

export function EmptyState({ children, className, description, title, ...props }: EmptyStateProps) {
  return (
    <div className={cx("ui-empty-state", className)} {...props}>
      <Inbox size={20} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{description || ""}</small>
      </span>
      {children}
    </div>
  );
}

type FeedbackProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "danger" | "success" | "neutral";
};

export function Feedback({ className, tone = "neutral", ...props }: FeedbackProps) {
  return (
    <div className={cx("ui-feedback", `ui-feedback-${tone}`, className)} role={tone === "danger" ? "alert" : "status"} {...props}>
      {tone === "danger" ? <AlertTriangle size={18} aria-hidden="true" /> : null}
      {props.children}
    </div>
  );
}

type StatTileProps = HTMLAttributes<HTMLDivElement> & {
  detail: string;
  href?: string;
  label: string;
  value: string | number;
};

export function StatTile({ className, detail, href, label, value, ...props }: StatTileProps) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );

  if (href) {
    return (
      <a className={cx("ui-stat-tile", className)} href={href}>
        {content}
      </a>
    );
  }

  return (
    <div className={cx("ui-stat-tile", className)} {...props}>
      {content}
    </div>
  );
}
