"use client";

import type { EventContentArg } from "@fullcalendar/core";
import type { AppointmentCalendarBooking } from "./appointment-calendar";

type ClockParts = {
  clock: string;
  period: string;
};

function clockParts(label: string): ClockParts {
  const match = /^(.*?)\s+([ap]m)$/i.exec(label.trim());
  if (!match) return { clock: label.trim(), period: "" };
  return { clock: match[1], period: match[2].toUpperCase() };
}

function eventTimeParts(startLabel: string, endLabel: string) {
  const start = clockParts(startLabel);
  const end = clockParts(endLabel);
  const samePeriod = Boolean(start.period && start.period === end.period);

  return {
    fullLabel: `${startLabel}–${endLabel}`,
    fullStart: samePeriod ? start.clock : startLabel,
    microStart: start.clock,
    narrowStart: startLabel,
    end: endLabel
  };
}

function densityFor(durationMinutes: number) {
  if (durationMinutes <= 30) return "brief";
  if (durationMinutes <= 45) return "compact";
  if (durationMinutes <= 75) return "standard";
  return "roomy";
}

function variantFor(viewType: string) {
  if (viewType === "dayGridMonth") return "month";
  if (viewType === "appointmentAgenda" || viewType.startsWith("list")) return "agenda";
  return "timegrid";
}

export function AppointmentEventChip({ event, view }: EventContentArg) {
  const booking = event.extendedProps.booking as AppointmentCalendarBooking | undefined;
  if (!booking) return <span>{event.title}</span>;

  const density = densityFor(booking.durationMinutes);
  const variant = variantFor(view.type);
  const time = eventTimeParts(booking.timeLabel, booking.endTimeLabel);
  const status = booking.status.toLowerCase();
  const conflictLabel = booking.warnings.length ? `Conflict: ${booking.warnings.join(" ")}` : "";
  const accessibleLabel = [
    booking.customerName,
    booking.serviceName,
    time.fullLabel,
    booking.staffName ? `with ${booking.staffName}` : "",
    status,
    booking.warnings.length ? `warning: ${booking.warnings.join(" ")}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      aria-label={accessibleLabel}
      className={`appointment-event-chip appointment-event-chip--${variant} appointment-event-chip--${density}`}
      role="group"
      title={[booking.customerName, booking.serviceName, time.fullLabel, conflictLabel].filter(Boolean).join(" · ")}
    >
      <time aria-label={time.fullLabel} className="appointment-event-chip__time" dateTime={booking.startsAt}>
        <span aria-hidden="true" className="appointment-event-chip__time-start">
          {time.fullStart}
        </span>
        <span aria-hidden="true" className="appointment-event-chip__time-start-narrow">
          {time.narrowStart}
        </span>
        <span aria-hidden="true" className="appointment-event-chip__time-start-micro">
          {time.microStart}
        </span>
        <span aria-hidden="true" className="appointment-event-chip__time-separator">
          –
        </span>
        <span aria-hidden="true" className="appointment-event-chip__time-end">
          {time.end}
        </span>
      </time>

      <strong className="appointment-event-chip__client">{booking.customerName}</strong>

      <div className="appointment-event-chip__meta">
        <span className="appointment-event-chip__service">{booking.serviceName}</span>
        {booking.staffName ? <span className="appointment-event-chip__staff">{booking.staffName}</span> : null}
      </div>

      <span className="ui-sr-only">Status: {status}</span>
    </div>
  );
}
