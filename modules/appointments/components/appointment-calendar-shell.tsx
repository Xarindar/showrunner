"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, MoreHorizontal, SlidersHorizontal, Table2 } from "lucide-react";
import { Modal } from "@/components/ui";

type AppointmentsModalKey = "filters" | "list" | "tools" | "waitlist" | null;

type AppointmentCalendarShellProps = {
  appointmentCount: number;
  appointmentListPanel: ReactNode;
  bookingCount: number;
  children: ReactNode;
  errorMessage?: string;
  filterPanel: ReactNode;
  nextHref: string;
  previousHref: string;
  rangeLabel: string;
  savedMessage?: string;
  todayHref: string;
  toolsPanel: ReactNode;
  view: string;
  waitlistCount: number;
  waitlistPanel: ReactNode;
};

export function AppointmentCalendarShell({
  appointmentCount,
  appointmentListPanel,
  bookingCount,
  children,
  errorMessage,
  filterPanel,
  nextHref,
  previousHref,
  rangeLabel,
  savedMessage,
  todayHref,
  toolsPanel,
  view,
  waitlistCount,
  waitlistPanel
}: AppointmentCalendarShellProps) {
  const [openPanel, setOpenPanel] = useState<AppointmentsModalKey>(null);

  return (
    <section className="appointments-calendar-shell" aria-label="Appointment scheduler">
      <input id="appointment-calendar-view-input" form="appointments-filter-form" name="view" type="hidden" defaultValue={view} />
      <header className="appointments-subtle-header">
        <div className="appointments-subtle-title">
          <span>Schedule</span>
          <strong>{rangeLabel}</strong>
          <small>{appointmentCount} appointments</small>
        </div>

        <nav aria-label="Calendar range" className="appointments-header-nav">
          <Link aria-label="Previous range" className="appointments-icon-link" href={previousHref}>
            <ChevronLeft size={17} />
          </Link>
          <Link className="appointments-today-link" href={todayHref}>
            Today
          </Link>
          <Link aria-label="Next range" className="appointments-icon-link" href={nextHref}>
            <ChevronRight size={17} />
          </Link>
        </nav>

        <div className="appointments-header-actions" aria-label="Schedule actions">
          <button aria-label="Open filters" className="appointments-action-button" onClick={() => setOpenPanel("filters")} title="Filters" type="button">
            <SlidersHorizontal size={16} />
            <span>Filters</span>
          </button>
          <button aria-label={`Open waitlist, ${waitlistCount} waiting`} className="appointments-action-button" onClick={() => setOpenPanel("waitlist")} title="Waitlist" type="button">
            <ListChecks size={16} />
            <span>Waitlist</span>
            <b>{waitlistCount}</b>
          </button>
          <button aria-label={`Open appointment list, ${bookingCount} matching`} className="appointments-action-button" onClick={() => setOpenPanel("list")} title="Appointment list" type="button">
            <Table2 size={16} />
            <span>List</span>
            <b>{bookingCount}</b>
          </button>
          <button aria-label="Open schedule tools" className="appointments-action-button icon-only" onClick={() => setOpenPanel("tools")} title="Schedule tools" type="button">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {savedMessage || errorMessage ? (
        <div className="appointments-workspace-messages">
          {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
          {errorMessage ? <div className="error">{errorMessage}</div> : null}
        </div>
      ) : null}

      <div className="appointments-calendar-canvas">{children}</div>

      <Modal bodyClassName="appointments-modal-body" className="appointments-modal" onClose={() => setOpenPanel(null)} open={openPanel === "filters"} title="Filters">
        {filterPanel}
      </Modal>
      <Modal bodyClassName="appointments-modal-body" className="appointments-modal" onClose={() => setOpenPanel(null)} open={openPanel === "waitlist"} title="Waitlist">
        {waitlistPanel}
      </Modal>
      <Modal bodyClassName="appointments-modal-body appointments-modal-body-wide" className="appointments-modal wide" onClose={() => setOpenPanel(null)} open={openPanel === "list"} title="Appointment list">
        {appointmentListPanel}
      </Modal>
      <Modal bodyClassName="appointments-modal-body" className="appointments-modal" onClose={() => setOpenPanel(null)} open={openPanel === "tools"} title="Schedule tools">
        <div className="appointments-tools-heading">
          <CalendarDays size={18} />
          <span>Calendar actions</span>
        </div>
        {toolsPanel}
      </Modal>
    </section>
  );
}
