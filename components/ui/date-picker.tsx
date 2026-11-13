"use client";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

const keyFor = (date: Date) => date.toISOString().slice(0, 10);
export function calendarMonthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return { key: keyFor(day), day: day.getUTCDate(), outside: day.getUTCMonth() !== first.getUTCMonth() };
  });
}

export function DatePicker({ value, label, compactLabel, onChange }: { value: string; label: string; compactLabel?: string; onChange: (date: string) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [open, setOpen] = useState(false);
  const moveMonth = (offset: number) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(keyFor(date).slice(0, 7));
  };
  const choose = (date: string) => {
    popup.current?.hidePopover();
    trigger.current?.focus();
    onChange(date);
  };
  return <span className="ui-date-picker">
    <Button ref={trigger} variant="ghost" size="sm" type="button" popoverTarget={id}
      aria-label={`Choose date, ${label}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setMonth(value.slice(0, 7))}>{compactLabel ? <><span className="ui-date-picker-label-full">{label}</span><span className="ui-date-picker-label-compact" aria-hidden="true">{compactLabel}</span></> : label}</Button>
    <div id={id} ref={popup} popover="auto" role="dialog" aria-label="Choose date" className="ui-date-picker-popover"
      onToggle={event => {
        const expanded = event.newState === "open";
        setOpen(expanded);
        if (expanded) popup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
      }}>
      <div className="ui-date-picker-header">
        <Button variant="ghost" size="sm" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={16} aria-hidden="true" /></Button>
        <strong aria-live="polite">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</strong>
        <Button variant="ghost" size="sm" type="button" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={16} aria-hidden="true" /></Button>
      </div>
      <div className="ui-date-picker-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span className="ui-date-picker-weekday" key={day}>{day}</span>)}
        {calendarMonthDays(month).map(day => <Button key={day.key} variant={day.key === value ? "primary" : "ghost"} size="sm" type="button"
          data-date={day.key} data-outside={day.outside} aria-pressed={day.key === value}
          aria-label={new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day.key}T00:00:00Z`))}
          onClick={() => choose(day.key)} onKeyDown={event => {
            const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
            if (!offset) return;
            event.preventDefault();
            const next = new Date(`${day.key}T00:00:00Z`);
            next.setUTCDate(next.getUTCDate() + offset);
            const date = keyFor(next);
            const target = popup.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`);
            if (target) target.focus();
          }}>{day.day}</Button>)}
      </div>
    </div>
  </span>;
}
