"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DragEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, GripVertical, ListChecks } from "lucide-react";
import { rescheduleBookingFromCalendarAction } from "../actions";

export type AppointmentCalendarBooking = {
  customerName: string;
  dateKey: string;
  endsAt: string;
  hour: number;
  id: string;
  minute: number;
  resourceIds: string[];
  resourceNames: string[];
  serviceName: string;
  staffId: string;
  staffName: string;
  startsAt: string;
  status: string;
  timeLabel: string;
};

export type AppointmentCalendarDay = {
  dateKey: string;
  dayNumber: string;
  isOutsideMonth: boolean;
  isToday: boolean;
  label: string;
  shortLabel: string;
};

type AppointmentCalendarProps = {
  bookings: AppointmentCalendarBooking[];
  days: AppointmentCalendarDay[];
  hours: number[];
  view: "month" | "week" | "day" | "agenda";
};

type DraggedBooking = {
  id: string;
  minute: number;
};

function bookingsByDate(bookings: AppointmentCalendarBooking[]) {
  const grouped = new Map<string, AppointmentCalendarBooking[]>();
  for (const booking of bookings) {
    const dayBookings = grouped.get(booking.dateKey) || [];
    dayBookings.push(booking);
    grouped.set(booking.dateKey, dayBookings);
  }
  for (const dayBookings of grouped.values()) {
    dayBookings.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }
  return grouped;
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

function canDrag(booking: AppointmentCalendarBooking) {
  return booking.status !== "CANCELED" && booking.status !== "COMPLETED";
}

function AppointmentCard({
  booking,
  compact = false,
  onDragStart
}: {
  booking: AppointmentCalendarBooking;
  compact?: boolean;
  onDragStart: (booking: AppointmentCalendarBooking) => void;
}) {
  return (
    <Link
      className={compact ? "appointment-calendar-event compact" : "appointment-calendar-event"}
      draggable={canDrag(booking)}
      href={`/admin/appointments/${booking.id}`}
      onDragStart={(event) => {
        if (!canDrag(booking)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", booking.id);
        onDragStart(booking);
      }}
    >
      <span>
        {canDrag(booking) ? <GripVertical size={14} /> : null}
        {booking.timeLabel}
      </span>
      <strong>{booking.customerName}</strong>
      <small>
        {booking.serviceName}
        {booking.staffName ? ` | ${booking.staffName}` : ""}
      </small>
    </Link>
  );
}

export function AppointmentCalendar({ bookings, days, hours, view }: AppointmentCalendarProps) {
  const router = useRouter();
  const [draggedBooking, setDraggedBooking] = useState<DraggedBooking | null>(null);
  const [pendingTarget, setPendingTarget] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const groupedBookings = useMemo(() => bookingsByDate(bookings), [bookings]);

  function dropBooking(dateKey: string, hour?: number) {
    const bookingId = draggedBooking?.id;
    if (!bookingId) return;
    const minute = draggedBooking.minute;
    const targetHour = hour ?? bookings.find((booking) => booking.id === bookingId)?.hour ?? 9;
    const targetKey = `${bookingId}:${dateKey}:${targetHour}:${minute}`;
    setPendingTarget(targetKey);
    setMessage("");

    startTransition(async () => {
      const result = await rescheduleBookingFromCalendarAction({
        bookingId,
        dateKey,
        hour: targetHour,
        minute
      });

      if (!result.ok) {
        setMessage(result.error || "Unable to reschedule appointment.");
        setPendingTarget("");
        setDraggedBooking(null);
        return;
      }

      setMessage("Appointment rescheduled.");
      setPendingTarget("");
      setDraggedBooking(null);
      router.refresh();
    });
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (!draggedBooking) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  if (view === "agenda") {
    return (
      <div className="appointment-calendar">
        <CalendarStatus message={message} pending={isPending} />
        <div className="appointment-agenda-list">
          {days.map((day) => {
            const dayBookings = groupedBookings.get(day.dateKey) || [];
            return (
              <section className="appointment-agenda-day" key={day.dateKey}>
                <h3>
                  <CalendarDays size={17} />
                  {day.label}
                </h3>
                {dayBookings.length ? (
                  dayBookings.map((booking) => (
                    <AppointmentCard booking={booking} key={booking.id} onDragStart={(item) => setDraggedBooking(item)} />
                  ))
                ) : (
                  <p>No appointments.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "month") {
    return (
      <div className="appointment-calendar">
        <CalendarStatus message={message} pending={isPending} />
        <div className="appointment-month-grid">
          {days.map((day) => {
            const dayBookings = groupedBookings.get(day.dateKey) || [];
            return (
              <section
                className={[
                  "appointment-month-day",
                  day.isToday ? "today" : "",
                  day.isOutsideMonth ? "outside" : "",
                  draggedBooking ? "drop-ready" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={day.dateKey}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault();
                  dropBooking(day.dateKey);
                }}
              >
                <h3>
                  <span>{day.shortLabel}</span>
                  <strong>{day.dayNumber}</strong>
                </h3>
                <div className="appointment-month-events">
                  {dayBookings.slice(0, 4).map((booking) => (
                    <AppointmentCard
                      booking={booking}
                      compact
                      key={booking.id}
                      onDragStart={(item) => setDraggedBooking(item)}
                    />
                  ))}
                  {dayBookings.length > 4 ? <span className="pill">+{dayBookings.length - 4} more</span> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="appointment-calendar">
      <CalendarStatus message={message} pending={isPending} />
      <div className={view === "day" ? "appointment-time-grid single-day" : "appointment-time-grid"}>
        <div className="appointment-time-grid-header" />
        {days.map((day) => (
          <div className={day.isToday ? "appointment-time-day today" : "appointment-time-day"} key={day.dateKey}>
            <span>{day.shortLabel}</span>
            <strong>{day.dayNumber}</strong>
          </div>
        ))}
        {hours.map((hour) => (
          <div className="appointment-time-row-fragment" key={hour}>
            <div className="appointment-hour-label">{hourLabel(hour)}</div>
            {days.map((day) => {
              const hourBookings = (groupedBookings.get(day.dateKey) || []).filter((booking) => booking.hour === hour);
              const targetKey = draggedBooking ? `${draggedBooking.id}:${day.dateKey}:${hour}:${draggedBooking.minute}` : "";
              return (
                <section
                  className={[
                    "appointment-hour-cell",
                    draggedBooking ? "drop-ready" : "",
                    pendingTarget === targetKey ? "pending" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${day.dateKey}-${hour}`}
                  onDragOver={allowDrop}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropBooking(day.dateKey, hour);
                  }}
                >
                  {hourBookings.map((booking) => (
                    <AppointmentCard booking={booking} key={booking.id} onDragStart={(item) => setDraggedBooking(item)} />
                  ))}
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarStatus({ message, pending }: { message: string; pending: boolean }) {
  if (!message && !pending) return null;

  return (
    <div className={message === "Appointment rescheduled." ? "success-message" : "error"}>
      {message === "Appointment rescheduled." ? <ListChecks size={18} /> : <AlertTriangle size={18} />}
      {pending ? "Checking conflicts..." : message}
    </div>
  );
}
