"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, CalendarClock, Check, ExternalLink, ListChecks, Mail, X } from "lucide-react";
import { Modal, Tab, Tabs } from "@/components/ui";
import { rescheduleBookingFromCalendarAction, updateBookingStatusAction } from "../actions";
import { AppointmentEventChip } from "./appointment-event-chip";

const calendarViews = ["month", "week", "day", "agenda"] as const;
const calendarViewInputId = "appointment-calendar-view-input";

type AppointmentCalendarClient = {
  affiliation: string;
  email: string;
  id: string;
  name: string;
  phone: string;
  photoUrl: string;
  pipeline: string;
  status: string;
};

export type AppointmentCalendarBooking = {
  adminNotes: string;
  client: AppointmentCalendarClient | null;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  dateKey: string;
  durationLabel: string;
  durationMinutes: number;
  endTimeLabel: string;
  endsAt: string;
  hour: number;
  id: string;
  minute: number;
  notes: string;
  policyAccepted: boolean;
  resourceIds: string[];
  resourceNames: string[];
  serviceName: string;
  staffId: string;
  staffName: string;
  startsAt: string;
  status: string;
  timeLabel: string;
  warnings: string[];
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
  selectedDateKey: string;
  timezone: string;
  view: "month" | "week" | "day" | "agenda";
};

type PendingReschedule = {
  booking: AppointmentCalendarBooking;
  dateKey: string;
  hour: number;
  minute: number;
  newDateLabel: string;
  newEndLabel: string;
  newStartLabel: string;
};

type ConfirmStage = "" | "change" | "email";

function dateKeyToUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return dateKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function startOfWeekKey(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  return addDaysToDateKey(dateKey, -date.getUTCDay());
}

function startOfMonthKey(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  return dateKeyFromUtcDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function viewWindow(view: (typeof calendarViews)[number], dateKey: string) {
  if (view === "month") {
    const monthStart = startOfMonthKey(dateKey);
    const gridStart = startOfWeekKey(monthStart);
    return { endKey: addDaysToDateKey(gridStart, 42), startKey: gridStart };
  }

  if (view === "week") {
    const weekStart = startOfWeekKey(dateKey);
    return { endKey: addDaysToDateKey(weekStart, 7), startKey: weekStart };
  }

  if (view === "agenda") {
    return { endKey: addDaysToDateKey(dateKey, 14), startKey: dateKey };
  }

  return { endKey: addDaysToDateKey(dateKey, 1), startKey: dateKey };
}

function daysForView(days: AppointmentCalendarDay[], view: (typeof calendarViews)[number], selectedDateKey: string) {
  const range = viewWindow(view, selectedDateKey);
  return days.filter((day) => day.dateKey >= range.startKey && day.dateKey < range.endKey);
}

function rangeSummary(view: (typeof calendarViews)[number], days: AppointmentCalendarDay[], appointmentCount: number) {
  const appointmentLabel = appointmentCount === 1 ? "appointment" : "appointments";
  if (!days.length) return `${appointmentCount} ${appointmentLabel}`;
  if (view === "day") return `${days[0].label} | ${appointmentCount} ${appointmentLabel}`;
  return `${days[0].shortLabel} - ${days[days.length - 1].shortLabel} | ${appointmentCount} ${appointmentLabel}`;
}

function fullCalendarViewFor(view: (typeof calendarViews)[number]) {
  if (view === "month") return "dayGridMonth";
  if (view === "week") return "timeGridWeek";
  if (view === "agenda") return "appointmentAgenda";
  return "timeGridDay";
}

function slotTime(hour: number) {
  const clamped = Math.max(0, Math.min(24, hour));
  return `${String(clamped).padStart(2, "0")}:00:00`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatCalendarClockLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date);
}

function formatCalendarDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(date);
}

function calendarDateParts(date: Date) {
  return {
    dateKey: dateKeyFromUtcDate(date),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function calendarDateForBooking(booking: AppointmentCalendarBooking) {
  const [year, month, day] = booking.dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, booking.hour, booking.minute));
}

function initialsFor(name: string, email: string) {
  const source = name || email || "Client";
  const words = source.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "C";
}

function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function canDrag(booking: AppointmentCalendarBooking) {
  return booking.status !== "CANCELED" && booking.status !== "COMPLETED";
}

function quickStatuses(booking: AppointmentCalendarBooking) {
  if (booking.status === "PENDING") return [{ icon: Check, label: "Confirm", status: "CONFIRMED" }];
  if (booking.status === "CONFIRMED") {
    return [
      { icon: Check, label: "Complete", status: "COMPLETED" },
      { icon: Ban, label: "Cancel", status: "CANCELED" }
    ];
  }
  return [];
}

function bookingClient(booking: AppointmentCalendarBooking): AppointmentCalendarClient {
  return (
    booking.client || {
      affiliation: "Booking contact",
      email: booking.customerEmail,
      id: "",
      name: booking.customerName,
      phone: booking.customerPhone,
      photoUrl: "",
      pipeline: "No client record",
      status: "Unlinked"
    }
  );
}

function statusClass(booking: AppointmentCalendarBooking) {
  return `status-${booking.status.toLowerCase()}`;
}

function hasConflict(booking: AppointmentCalendarBooking) {
  return booking.warnings.some((warning) => /\bconflicts?\b/i.test(warning));
}

function AppointmentExpandedDetails({ booking, dayLabel }: { booking: AppointmentCalendarBooking; dayLabel: string }) {
  const client = bookingClient(booking);
  const initials = initialsFor(client.name, client.email);
  const clientItems = [
    client.phone ? { href: phoneHref(client.phone), label: "Phone", value: client.phone } : { label: "Phone", value: "No phone" },
    { href: `mailto:${client.email}`, label: "Email", value: client.email },
    { label: "Pipeline", value: client.pipeline },
    { label: "Status", value: client.status }
  ];
  const appointmentItems = [
    { label: "Service", value: booking.serviceName },
    { label: "Time", value: `${dayLabel} | ${booking.timeLabel} - ${booking.endTimeLabel}` },
    { label: "Duration", value: booking.durationLabel },
    { label: "Staff", value: booking.staffName || "Any staff" },
    { label: "Resources", value: booking.resourceNames.length ? booking.resourceNames.join(", ") : "None" },
    { label: "Status", value: booking.status.toLowerCase() },
    { label: "Policy", value: booking.policyAccepted ? "Accepted" : "Not accepted" },
    { label: "Client notes", value: booking.notes || "None" },
    { label: "Internal notes", value: booking.adminNotes || "None" }
  ];
  const statusActions = quickStatuses(booking);

  return (
    <div className="appointment-event-expanded" aria-live="polite" onClick={(event) => event.stopPropagation()}>
      <section className="appointment-expanded-column">
        <div className="appointment-expanded-heading">
          <span>Client info</span>
          {booking.client ? (
            <Link className="appointment-panel-link" href={`/admin/clients/${booking.client.id}`}>
              <ExternalLink size={14} />
              Open client
            </Link>
          ) : null}
        </div>
        <div className="appointment-expanded-client-card clients-profile-card-body">
          <div className="clients-profile-card-main">
            <div className="clients-profile-photo" aria-hidden="true">
              {client.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={client.photoUrl} />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="clients-profile-card-copy">
              <h2>{client.name}</h2>
              <span>{client.affiliation}</span>
              <span className="ui-badge">{client.status}</span>
            </div>
          </div>
          <dl className="appointment-expanded-list" aria-label="Selected appointment client highlights">
            {clientItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{"href" in item ? <a href={item.href}>{item.value}</a> : item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="appointment-expanded-column">
        <div className="appointment-expanded-heading">
          <span>Appointment info</span>
          <Link className="appointment-panel-link" href={`/admin/appointments/${booking.id}`}>
            <ExternalLink size={14} />
            Open appointment
          </Link>
        </div>
        <dl className="appointment-expanded-list">
          {appointmentItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {booking.warnings.length ? (
          <div className="appointment-selection-warning">
            <AlertTriangle size={16} />
            {booking.warnings.join(" ")}
          </div>
        ) : null}
        {statusActions.length ? (
          <div className="appointment-calendar-event-actions">
            {statusActions.map((action) => {
              const Icon = action.icon;
              return (
                <form action={updateBookingStatusAction} key={action.status}>
                  <input name="id" type="hidden" value={booking.id} />
                  <input name="status" type="hidden" value={action.status} />
                  <button className={action.status === "CANCELED" ? "ui-button ui-button-danger" : "ui-button ui-button-secondary"} type="submit">
                    <Icon size={14} />
                    {action.label}
                  </button>
                </form>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AppointmentFloatingDetails({
  booking,
  dayLabel,
  onClose
}: {
  booking: AppointmentCalendarBooking;
  dayLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="appointment-floating-layer" onClick={onClose}>
      <section
        aria-label="Appointment details"
        aria-modal="false"
        className="appointment-floating-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="appointment-floating-card-head">
          <div>
            <span>{booking.timeLabel} - {booking.endTimeLabel}</span>
            <h2>{booking.serviceName}</h2>
          </div>
          <button aria-label="Close appointment details" className="appointment-event-close" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </div>
        <AppointmentExpandedDetails booking={booking} dayLabel={dayLabel} />
      </section>
    </div>
  );
}

export function AppointmentCalendar({ bookings, days, hours, selectedDateKey, view }: AppointmentCalendarProps) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [message, setMessage] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>("");
  const [isPending, startTransition] = useTransition();
  const bookingById = useMemo(() => new Map(bookings.map((booking) => [booking.id, booking])), [bookings]);
  const dayLabels = useMemo(() => new Map(days.map((day) => [day.dateKey, day.label])), [days]);
  const visibleDays = useMemo(() => daysForView(days, view, selectedDateKey), [days, selectedDateKey, view]);
  const visibleDateKeys = useMemo(() => new Set(visibleDays.map((day) => day.dateKey)), [visibleDays]);
  const visibleBookings = useMemo(
    () => bookings.filter((booking) => visibleDateKeys.has(booking.dateKey)),
    [bookings, visibleDateKeys]
  );
  const selectedBooking = selectedBookingId ? bookingById.get(selectedBookingId) || null : null;
  const selectedDayLabel = selectedBooking ? dayLabels.get(selectedBooking.dateKey) || selectedBooking.dateKey : "";
  const viewSummary = rangeSummary(view, visibleDays, visibleBookings.length);
  const slotMinHour = Math.max(0, Math.min(...hours, 7));
  const slotMaxHour = Math.min(24, Math.max(...hours, 19) + 1);

  const calendarEvents = useMemo<EventInput[]>(
    () =>
      bookings.map((booking) => {
        // FullCalendar needs an extra plugin for named time zones. Treat UTC as a
        // wall-clock coordinate so the site-local parts supplied by the server
        // render consistently even when the browser is in another time zone.
        const start = calendarDateForBooking(booking);
        const end = addMinutes(start, booking.durationMinutes);

        return {
          id: booking.id,
          title: `${booking.customerName} - ${booking.serviceName}`,
          start: start.toISOString(),
          end: end.toISOString(),
          editable: canDrag(booking),
          startEditable: canDrag(booking),
          durationEditable: false,
          classNames: [
            "appointment-fc-event",
            statusClass(booking),
            canDrag(booking) ? "can-reschedule" : "locked",
            hasConflict(booking) ? "has-conflict" : ""
          ].filter(Boolean),
          extendedProps: { booking }
        };
      }),
    [bookings]
  );

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(fullCalendarViewFor(view), selectedDateKey);
  }, [selectedDateKey, view]);

  useEffect(() => {
    if (!selectedBookingId) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedBookingId("");
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedBookingId]);

  function changeView(nextView: (typeof calendarViews)[number]) {
    setSelectedBookingId("");
    setMessage("");
    setConfirmStage("");
    setPendingReschedule(null);

    const viewInput = document.getElementById(calendarViewInputId);
    if (viewInput instanceof HTMLInputElement) {
      viewInput.value = nextView;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    router.replace(`${url.pathname}${url.search}`);
  }

  function cancelReschedule() {
    setConfirmStage("");
    setPendingReschedule(null);
  }

  function submitReschedule(notifyCustomer: boolean) {
    const pending = pendingReschedule;
    if (!pending) return;
    setConfirmStage("");
    setMessage("");

    startTransition(async () => {
      const result = await rescheduleBookingFromCalendarAction({
        bookingId: pending.booking.id,
        dateKey: pending.dateKey,
        hour: pending.hour,
        minute: pending.minute,
        notifyCustomer
      });

      setPendingReschedule(null);

      if (!result.ok) {
        setMessage(result.error || "Unable to reschedule appointment.");
        return;
      }

      setMessage(notifyCustomer ? "Appointment rescheduled. The client will be emailed." : "Appointment rescheduled.");
      router.refresh();
    });
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedBookingId(info.event.id);
    setMessage("");
  }

  function handleEventDrop(info: EventDropArg) {
    const booking = bookingById.get(info.event.id);
    const start = info.event.start;
    if (!booking || !start || !canDrag(booking)) {
      info.revert();
      return;
    }

    const end = info.event.end || addMinutes(start, booking.durationMinutes);
    const parts = calendarDateParts(start);
    setSelectedBookingId("");
    setMessage("");
    setPendingReschedule({
      booking,
      dateKey: parts.dateKey,
      hour: parts.hour,
      minute: parts.minute,
      newDateLabel: formatCalendarDateLabel(start),
      newEndLabel: formatCalendarClockLabel(end),
      newStartLabel: formatCalendarClockLabel(start)
    });
    setConfirmStage("change");
    info.revert();
  }

  const viewControls = (
    <div className="appointment-calendar-client-bar">
      <Tabs className="appointment-calendar-view-tabs" aria-label="Calendar view">
        {calendarViews.map((item) => (
          <Tab aria-selected={item === view} key={item} onClick={() => changeView(item)}>
            {item}
          </Tab>
        ))}
      </Tabs>
      <p className="ui-zero">{viewSummary}</p>
    </div>
  );

  const floatingDetails = selectedBooking ? (
    <AppointmentFloatingDetails
      booking={selectedBooking}
      dayLabel={selectedDayLabel}
      onClose={() => setSelectedBookingId("")}
    />
  ) : null;

  const rescheduleModals = pendingReschedule ? (
    <>
      <Modal onClose={cancelReschedule} open={confirmStage === "change"} title="Reschedule appointment?">
        <div className="appointment-confirm">
          <p className="appointment-confirm-lead">
            Move <strong>{pendingReschedule.booking.serviceName}</strong> for {pendingReschedule.booking.customerName}?
          </p>
          <div className="appointment-confirm-times">
            <div>
              <span>From</span>
              <strong>
                {dayLabels.get(pendingReschedule.booking.dateKey) || pendingReschedule.booking.dateKey} | {pendingReschedule.booking.timeLabel} -{" "}
                {pendingReschedule.booking.endTimeLabel}
              </strong>
            </div>
            <CalendarClock aria-hidden="true" size={20} />
            <div>
              <span>To</span>
              <strong>
                {pendingReschedule.newDateLabel} | {pendingReschedule.newStartLabel} - {pendingReschedule.newEndLabel}
              </strong>
            </div>
          </div>
          <div className="appointment-confirm-actions">
            <button className="ui-button ui-button-secondary" onClick={cancelReschedule} type="button">
              Cancel
            </button>
            <button className="ui-button" onClick={() => setConfirmStage("email")} type="button">
              Confirm change
            </button>
          </div>
        </div>
      </Modal>
      <Modal onClose={cancelReschedule} open={confirmStage === "email"} title="Email client about appointment update?">
        <div className="appointment-confirm">
          <p className="appointment-confirm-lead">
            Let {pendingReschedule.booking.customerName} know their {pendingReschedule.booking.serviceName} moved to{" "}
            {pendingReschedule.newDateLabel} at {pendingReschedule.newStartLabel}.
          </p>
          {pendingReschedule.booking.customerEmail ? (
            <p className="appointment-confirm-note">A reschedule notice will be sent to {pendingReschedule.booking.customerEmail}.</p>
          ) : (
            <p className="appointment-confirm-note">No email address is on file for this client.</p>
          )}
          <div className="appointment-confirm-actions">
            <button className="ui-button ui-button-secondary" onClick={() => submitReschedule(false)} type="button">
              No, just update
            </button>
            <button
              className="ui-button"
              disabled={!pendingReschedule.booking.customerEmail}
              onClick={() => submitReschedule(true)}
              type="button"
            >
              <Mail size={16} />
              Yes, email client
            </button>
          </div>
        </div>
      </Modal>
    </>
  ) : null;

  return (
    <div className="appointment-calendar">
      <CalendarStatus message={message} pending={isPending} />
      {viewControls}
      <div className="appointment-fullcalendar">
        <FullCalendar
          ref={calendarRef}
          allDaySlot={false}
          dayMaxEvents
          editable
          eventClick={handleEventClick}
          eventContent={(eventInfo) => <AppointmentEventChip {...eventInfo} />}
          eventDisplay="block"
          eventDrop={handleEventDrop}
          eventDurationEditable={false}
          eventMaxStack={2}
          eventMinHeight={34}
          eventShortHeight={52}
          events={calendarEvents}
          expandRows
          firstDay={0}
          headerToolbar={false}
          height="100%"
          initialDate={selectedDateKey}
          initialView={fullCalendarViewFor(view)}
          listDayFormat={{ month: "short", day: "numeric", weekday: "short" }}
          listDaySideFormat={false}
          moreLinkClick="popover"
          nowIndicator
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          snapDuration="00:15:00"
          slotDuration="00:30:00"
          slotMaxTime={slotTime(slotMaxHour)}
          slotMinTime={slotTime(slotMinHour)}
          slotEventOverlap
          timeZone="UTC"
          views={{
            appointmentAgenda: {
              buttonText: "agenda",
              duration: { days: 14 },
              type: "list"
            }
          }}
        />
      </div>
      {floatingDetails}
      {rescheduleModals}
    </div>
  );
}

function CalendarStatus({ message, pending }: { message: string; pending: boolean }) {
  if (!message && !pending) return null;
  const success = message.startsWith("Appointment rescheduled");

  return (
    <div className={success ? "success-message" : "error"}>
      {success ? <ListChecks size={18} /> : <AlertTriangle size={18} />}
      {pending ? "Checking conflicts..." : message}
    </div>
  );
}
