import Link from "next/link";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "./card";
import { cx } from "./utils";

type DashboardCardFrameProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: string;
  footer?: ReactNode;
  href?: string;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
  title: string;
};

export function DashboardCardFrame({
  actions,
  children,
  className,
  description,
  footer,
  href,
  icon,
  size = "md",
  title,
  ...props
}: DashboardCardFrameProps) {
  return (
    <Card
      as="article"
      className={cx("dashboard-card", `dashboard-card-${size}`, className)}
      density={size === "sm" ? "compact" : "normal"}
      minHeight="none"
      reservedFooter={footer}
      reservedHeader={
        <div className="dashboard-card-header">
          <span className="dashboard-card-heading">
            {icon ? <span className="dashboard-card-icon" aria-hidden="true">{icon}</span> : null}
            <span>
              <strong>{title}</strong>
              {description ? <small className="dashboard-card-description">{description}</small> : null}
            </span>
          </span>
          <span className="dashboard-card-actions">
            {href ? (
              <Link aria-label={`Open ${title}`} className="dashboard-card-open" href={href} title={`Open ${title}`}>
                <ArrowUpRight size={16} />
              </Link>
            ) : null}
            {actions}
          </span>
        </div>
      }
      {...props}
    >
      <div className="dashboard-card-content">{children}</div>
    </Card>
  );
}

type DashboardMetricProps = {
  detail?: string;
  label: string;
  value: ReactNode;
};

export function DashboardMetric({ detail, label, value }: DashboardMetricProps) {
  return (
    <div className="dashboard-card-metric">
      <strong>{value}</strong>
      <span>
        {label}
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

type DashboardKpi = {
  label: string;
  value: ReactNode;
};

export function DashboardKpiRow({ items }: { items: DashboardKpi[] }) {
  return (
    <div className="dashboard-card-kpis">
      {items.map((item) => (
        <span className="dashboard-card-kpi" key={item.label}>
          <strong>{item.value}</strong>
          <small>{item.label}</small>
        </span>
      ))}
    </div>
  );
}

type DashboardListItem = {
  detail?: ReactNode;
  href?: string;
  id: string;
  meta?: ReactNode;
  title: ReactNode;
};

export function DashboardCardList({ empty, items }: { empty: string; items: DashboardListItem[] }) {
  if (!items.length) return <p className="dashboard-card-empty">{empty}</p>;

  return (
    <ul className="dashboard-card-list">
      {items.map((item) => {
        const body = (
          <>
            <span className="dashboard-card-list-copy">
              <strong>{item.title}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </span>
            {item.meta ? <em>{item.meta}</em> : null}
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? <Link href={item.href}>{body}</Link> : <span>{body}</span>}
          </li>
        );
      })}
    </ul>
  );
}

type DashboardTrendBar = {
  label: string;
  value: number;
};

export function DashboardTrendBars({ bars }: { bars: DashboardTrendBar[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div className="dashboard-card-trend" aria-label="Recent activity trend">
      {bars.map((bar) => (
        <span className="dashboard-card-trend-bar" key={bar.label}>
          <span
            aria-hidden="true"
            style={{ "--dashboard-card-bar-height": `${Math.max(8, Math.round((bar.value / max) * 100))}%` } as CSSProperties}
          />
          <small>{bar.label}</small>
        </span>
      ))}
    </div>
  );
}
