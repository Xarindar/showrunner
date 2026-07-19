"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type RevenueTrendWeek = {
  days: {
    cents: number;
    label: string;
  }[];
  label: string;
  totalCents: number;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { currency, style: "currency" }).format(cents / 100);
}

function barMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(cents / 100);
}

export function RevenueTrendsChart({ currency, weeks }: { currency: string; weeks: RevenueTrendWeek[] }) {
  const [weekIndex, setWeekIndex] = useState(Math.max(0, weeks.length - 1));
  const week = weeks[weekIndex] || { days: [], label: "This week", totalCents: 0 };
  const max = Math.max(1, ...week.days.map((day) => day.cents));

  return (
    <div className="dashboard-revenue-trends">
      <div aria-label="Choose revenue week" className="dashboard-week-switcher">
        <button
          aria-label="Previous week"
          disabled={weekIndex <= 0}
          onClick={() => setWeekIndex((current) => Math.max(0, current - 1))}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <strong aria-live="polite">{week.label}</strong>
        <button
          aria-label="Next week"
          disabled={weekIndex >= weeks.length - 1}
          onClick={() => setWeekIndex((current) => Math.min(weeks.length - 1, current + 1))}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="dashboard-revenue-total">
        <strong>{money(week.totalCents, currency)}</strong>
        <small>Weekly revenue</small>
      </div>

      <div
        aria-label={`${week.label} daily revenue: ${week.days.map((day) => `${day.label} ${money(day.cents, currency)}`).join(", ")}`}
        className="dashboard-revenue-chart"
        role="img"
      >
        {week.days.map((day) => (
          <span className="dashboard-revenue-bar" key={day.label} title={`${day.label}: ${money(day.cents, currency)}`}>
            <strong>{barMoney(day.cents, currency)}</strong>
            <i
              aria-hidden="true"
              style={{ "--dashboard-revenue-bar-height": `${Math.max(5, Math.round((day.cents / max) * 100))}%` } as CSSProperties}
            />
            <small>{day.label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
