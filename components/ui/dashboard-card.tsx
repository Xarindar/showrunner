import Link from "next/link";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Card } from "./card";
import { cx } from "./utils";

type DashboardCardFrameProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: string;
  footer?: ReactNode;
  href?: string;
  icon?: ReactNode;
  overlay?: ReactNode;
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
  overlay,
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
      <div className="dashboard-card-body-stage">
        <div aria-hidden={overlay ? true : undefined} className="dashboard-card-content" inert={overlay ? true : undefined}>
          {children}
        </div>
        {overlay ? <div className="dashboard-card-settings-surface">{overlay}</div> : null}
      </div>
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

type DashboardRingProps = {
  detail?: string;
  label: string;
  max?: number;
  tone?: "neutral" | "positive" | "attention" | "danger";
  value: number;
};

export function DashboardRing({ detail, label, max = 100, tone = "neutral", value }: DashboardRingProps) {
  const progress = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));

  return (
    <div className="dashboard-widget-ring-composition">
      <div
        aria-label={`${label}: ${value} of ${max}`}
        className={`dashboard-widget-ring dashboard-widget-tone-${tone}`}
        role="img"
        style={{ "--dashboard-ring-progress": `${progress * 3.6}deg` } as CSSProperties}
      >
        <span>
          <strong>{value}</strong>
          <small>{max === 100 ? "%" : `of ${max}`}</small>
        </span>
      </div>
      <div className="dashboard-widget-ring-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

type DashboardSegment = {
  label: string;
  tone?: "neutral" | "positive" | "attention" | "danger";
  value: number;
};

export function DashboardSegmentBar({ items }: { items: DashboardSegment[] }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));

  return (
    <div className="dashboard-widget-segments">
      <div aria-label={items.map((item) => `${item.label}: ${item.value}`).join(", ")} className="dashboard-widget-segment-track" role="img">
        {items.map((item) =>
          item.value > 0 ? (
            <span
              className={`dashboard-widget-tone-${item.tone || "neutral"}`}
              key={item.label}
              style={{ "--dashboard-segment-width": `${(item.value / total) * 100}%` } as CSSProperties}
            />
          ) : null
        )}
      </div>
      <div className="dashboard-widget-segment-legend">
        {items.map((item) => (
          <span key={item.label}>
            <i className={`dashboard-widget-tone-${item.tone || "neutral"}`} />
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

type DashboardTimelineItem = {
  detail?: ReactNode;
  href?: string;
  id: string;
  time: ReactNode;
  title: ReactNode;
};

export function DashboardTimeline({ empty, items }: { empty: string; items: DashboardTimelineItem[] }) {
  if (!items.length) return <p className="dashboard-card-empty">{empty}</p>;

  return (
    <ol className="dashboard-widget-timeline">
      {items.map((item) => {
        const copy = (
          <>
            <span className="dashboard-widget-timeline-time">{item.time}</span>
            <span className="dashboard-widget-timeline-marker" aria-hidden="true" />
            <strong className="dashboard-widget-row-title">{item.title}</strong>
            <small className="dashboard-widget-row-detail">{item.detail || null}</small>
            <span className="dashboard-widget-row-arrow" aria-hidden="true">
              {item.href ? <ArrowRight size={14} /> : null}
            </span>
          </>
        );

        return <li key={item.id}>{item.href ? <Link href={item.href}>{copy}</Link> : <span>{copy}</span>}</li>;
      })}
    </ol>
  );
}

type DashboardIdentityItem = {
  detail?: ReactNode;
  href?: string;
  id: string;
  meta?: ReactNode;
  title: string;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";
}

export function DashboardIdentityList({ empty, items }: { empty: string; items: DashboardIdentityItem[] }) {
  if (!items.length) return <p className="dashboard-card-empty">{empty}</p>;

  return (
    <ul className="dashboard-widget-identity-list">
      {items.map((item) => {
        const copy = (
          <>
            <span className="dashboard-widget-avatar" aria-hidden="true">{initials(item.title)}</span>
            <strong className="dashboard-widget-row-title">{item.title}</strong>
            <small className="dashboard-widget-row-detail">{item.detail || null}</small>
            <em>{item.meta || null}</em>
            <span className="dashboard-widget-row-arrow" aria-hidden="true">
              {item.href ? <ArrowRight size={14} /> : null}
            </span>
          </>
        );

        return <li key={item.id}>{item.href ? <Link href={item.href}>{copy}</Link> : <span>{copy}</span>}</li>;
      })}
    </ul>
  );
}

type DashboardSparklineProps = {
  ariaLabel: string;
  labels?: string[];
  points: number[];
};

export function DashboardSparkline({ ariaLabel, labels = [], points }: DashboardSparklineProps) {
  const safePoints = points.length ? points : [0];
  const max = Math.max(1, ...safePoints);
  const min = Math.min(0, ...safePoints);
  const range = Math.max(1, max - min);
  const coordinates = safePoints
    .map((point, index) => {
      const x = safePoints.length === 1 ? 50 : (index / (safePoints.length - 1)) * 100;
      const y = 42 - ((point - min) / range) * 34;
      return `${x},${y}`;
    })
    .join(" ");
  const areaCoordinates = `0,46 ${coordinates} 100,46`;

  return (
    <div className="dashboard-widget-sparkline">
      <svg aria-label={ariaLabel} preserveAspectRatio="none" role="img" viewBox="0 0 100 48">
        <line className="dashboard-widget-chart-guide" x1="0" x2="100" y1="45.5" y2="45.5" />
        <polygon className="dashboard-widget-chart-area" points={areaCoordinates} />
        <polyline fill="none" points={coordinates} vectorEffect="non-scaling-stroke" />
      </svg>
      {labels.length ? (
        <div className="dashboard-widget-chart-labels">
          {labels.map((label) => <small key={label}>{label}</small>)}
        </div>
      ) : null}
    </div>
  );
}

type DashboardStatItem = {
  detail?: ReactNode;
  icon?: ReactNode;
  label: string;
  tone?: "neutral" | "positive" | "attention" | "danger";
  value: ReactNode;
};

export function DashboardStatStack({ items }: { items: DashboardStatItem[] }) {
  return (
    <div className="dashboard-widget-stat-stack">
      {items.map((item) => (
        <span key={item.label}>
          {item.icon ? <i className={`dashboard-widget-stat-icon dashboard-widget-tone-${item.tone || "neutral"}`}>{item.icon}</i> : null}
          <span>
            <small>{item.label}</small>
            {item.detail ? <em>{item.detail}</em> : null}
          </span>
          <strong>{item.value}</strong>
        </span>
      ))}
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
            <strong className="dashboard-widget-row-title">{item.title}</strong>
            <small className="dashboard-widget-row-detail">{item.detail || null}</small>
            <em>{item.meta || null}</em>
            <span className="dashboard-widget-row-arrow" aria-hidden="true">
              {item.href ? <ArrowRight size={14} /> : null}
            </span>
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
