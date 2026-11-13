"use client";

import { formatTime } from "@/lib/format";
import { useNotify } from "@/components/ui/notifications";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import detailStyles from "../detail/detail.module.css";
import styles from "./appointment-popup.module.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Ban, CalendarClock, Check, ExternalLink, Mail, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { rescheduleBookingFromCalendarAction, updateBookingStatusAction } from "../actions";
import { bindCalendarScrollNavigation } from "./calendar-scroll-navigation";
import { AppointmentDayOverview } from "./appointment-day-overview";
import { AppointmentEventChip } from "./appointment-event-chip";

type CalendarView = "month" | "week" | "day" | "agenda";

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
  rangeControls: ReactNode;
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

function dateKeyFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function fullCalendarViewFor(view: CalendarView) {
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
  return formatTime(date, "UTC");
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
    <div className={styles.columns}>
      <section className="ui-data-table-shell" aria-labelledby="calendar-client-title">
        <div className="ui-data-table-titlebar">
          <h2 id="calendar-client-title">Client details</h2>
          {booking.client ? <ButtonLink variant="secondary" size="sm" href={`/admin/clients/${booking.client.id}`}>
            <ExternalLink size={14} aria-hidden="true" />Open client
          </ButtonLink> : null}
        </div>
        <div className="ui-section-body">
          <div className="ui-object-cell">
            {client.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ui-object-thumb" alt="" src={client.photoUrl} />
            ) : <span className="ui-object-thumb ui-object-thumb-empty" aria-hidden="true">{initials}</span>}
            <div className={`ui-object-copy ${detailStyles.contactHeading}`}>
              <h2>{client.name}</h2>
              <span className="muted-text">{client.affiliation}</span>
            </div>
          </div>
        </div>
        <Table aria-label="Client details" mobileLayout="columns" className={detailStyles.facts} tableClassName="ui-data-table">
          <tbody>{clientItems.map(item => <tr key={item.label}>
            <th scope="row" data-mobile-column>{item.label}</th>
            <td data-mobile-column>{"href" in item ? <a href={item.href}>{item.value}</a> : item.value}</td>
          </tr>)}</tbody>
        </Table>
      </section>
      <div className="ui-stack">
        <section className="ui-data-table-shell" aria-labelledby="calendar-appointment-title">
          <div className="ui-data-table-titlebar">
            <h2 id="calendar-appointment-title">Appointment details</h2>
            <ButtonLink variant="secondary" size="sm" href={`/admin/appointments/${booking.id}`}>
              <ExternalLink size={14} aria-hidden="true" />Open appointment
            </ButtonLink>
          </div>
          <Table aria-label="Appointment details" mobileLayout="columns" className={detailStyles.facts} tableClassName="ui-data-table">
            <tbody>{appointmentItems.map(item => <tr key={item.label}>
              <th scope="row" data-mobile-column>{item.label}</th>
              <td data-mobile-column>{item.value}</td>
            </tr>)}</tbody>
          </Table>
        </section>
        {booking.warnings.length ? <div className="appointment-selection-warning" role="status">
          <AlertTriangle size={16} aria-hidden="true" />{booking.warnings.join(" ")}
        </div> : null}
        {statusActions.length ? <section className="ui-data-table-shell" aria-labelledby="calendar-actions-title">
          <div className="ui-data-table-titlebar"><h2 id="calendar-actions-title">Actions</h2></div>
          <div className="ui-section-body"><div className="ui-inline-actions">
            {statusActions.map(action => {
              const Icon = action.icon;
              return <form action={updateBookingStatusAction} key={action.status}>
                <input name="id" type="hidden" value={booking.id} />
                <input name="status" type="hidden" value={action.status} />
                <Button variant={action.status === "CANCELED" ? "danger" : "secondary"} size="sm" type="submit">
                  <Icon size={14} aria-hidden="true" />{action.label}
                </Button>
              </form>;
            })}
          </div></div>
        </section> : null}
      </div>
    </div>
  );
}

function AppointmentFloatingDetails({ booking, dayLabel, onClose }: {
  booking: AppointmentCalendarBooking;
  dayLabel: string;
  onClose: () => void;
}) {
  return <div className={styles.layer} onClick={onClose}>
    <section aria-labelledby="calendar-popup-title" aria-modal="false" role="dialog"
      className={`ui-dialog ui-modal ${styles.card} ${detailStyles.page}`} onClick={event => event.stopPropagation()}>
      <div className={`ui-modal-head ui-dialog-header ${styles.header}`}>
        <h2 className="ui-dialog-title" id="calendar-popup-title">{booking.serviceName}</h2>
        <Button aria-label="Close appointment details" className="ui-dialog-close" variant="ghost" size="sm" onClick={onClose} type="button">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className={`ui-dialog-body ${styles.body}`}>
        <AppointmentExpandedDetails booking={booking} dayLabel={dayLabel} />
      </div>
    </section>
  </div>;
}

export function AppointmentCalendar({ bookings, days, hours, selectedDateKey, view, rangeControls }: AppointmentCalendarProps) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || (view !== "day" && view !== "week")) return;
    return bindCalendarScrollNavigation(root.current, href => router.replace(href));
  }, [router, selectedDateKey, view]);
  const notify = useNotify();
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>("");
  const [isPending, startTransition] = useTransition();
  const bookingById = useMemo(() => new Map(bookings.map((booking) => [booking.id, booking])), [bookings]);
  const dayLabels = useMemo(() => new Map(days.map((day) => [day.dateKey, day.label])), [days]);
  const selectedBooking = selectedBookingId ? bookingById.get(selectedBookingId) || null : null;
  const selectedDayLabel = selectedBooking ? dayLabels.get(selectedBooking.dateKey) || selectedBooking.dateKey : "";
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

  function cancelReschedule() {
    setConfirmStage("");
    setPendingReschedule(null);
  }

  function submitReschedule(notifyCustomer: boolean) {
    const pending = pendingReschedule;
    if (!pending) return;
    setConfirmStage("");

    startTransition(async () => {
      try {
        const result = await rescheduleBookingFromCalendarAction({
          bookingId: pending.booking.id,
          dateKey: pending.dateKey,
          hour: pending.hour,
          minute: pending.minute,
          notifyCustomer
        });
        if (!result.ok) {
          notify(result.error || "Unable to reschedule appointment.", "danger");
          return;
        }
        notify("Appointment rescheduled.");
        router.refresh();
      } catch {
        notify("The update could not be confirmed. Refresh the calendar before trying again.", "danger");
      } finally {
        setPendingReschedule(null);
      }
    });
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedBookingId(info.event.id);
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
    <div className="appointment-calendar" ref={root}>
      {isPending && <p role="status">Checking conflicts…</p>}
      <div className="appointments-calendar-context">
        {rangeControls}
      </div>
      {view === "week" || view === "month" ? <AppointmentDayOverview bookings={bookings} days={days} selectedDateKey={selectedDateKey} view={view} onSelect={dateKey => {
        const url = new URL(window.location.href);
        url.searchParams.set("date", dateKey);
        url.searchParams.set("view", "day");
        router.replace(`${url.pathname}${url.search}`);
      }} /> : null}
      <div className="appointment-fullcalendar" data-overview={view === "week" || view === "month" ? "true" : undefined}>
        <FullCalendar
          slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: true, meridiem: true }}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", hour12: true, meridiem: true }}
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
          viewDidMount={({ el }) => {
            el.querySelectorAll<HTMLElement>(".fc-scroller").forEach(node => {
              const cell = node.querySelector<HTMLElement>('[role="gridcell"]');
              if (cell) cell.tabIndex = 0;
            });
          }}
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
            timeGridDay: { dayHeaders: false },
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
