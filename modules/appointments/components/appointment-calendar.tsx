"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, CalendarClock, CalendarDays, Check, ExternalLink, GripVertical, ListChecks, Mail, X } from "lucide-react";
import { Modal, Tab, Tabs } from "@/components/ui";
import { rescheduleBookingFromCalendarAction, updateBookingStatusAction } from "../actions";

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
  view: "month" | "week" | "day" | "agenda";
};

type DraggedBooking = {
  id: string;
  minute: number;
};

type PendingReschedule = {
  booking: AppointmentCalendarBooking;
  dateKey: string;
  hour: number;
  minute: number;
  newStartLabel: string;
  newEndLabel: string;
};

type ConfirmStage = "" | "change" | "email";

type PointerDragRender = {
  bookingId: string;
  dx: number;
  dy: number;
  moved: boolean;
  targetDateKey: string;
  targetMinute: number;
};

type PointerDragSession = {
  bookingId: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetPx: number;
  durationMinutes: number;
  originDateKey: string;
  originMinute: number;
  targetDateKey: string;
  targetMinute: number;
  moved: boolean;
};

type IndicatorStyle = CSSProperties & {
  "--appointment-indicator-height": string;
  "--appointment-marker-top": string;
};

type TimeBounds = {
  endMinute: number;
  height: number;
  markers: TimeMarker[];
  startMinute: number;
  totalMinutes: number;
};

type TimeMarker = {
  kind: "half" | "hour" | "quarter";
  minute: number;
};

type PositionedBooking = {
  booking: AppointmentCalendarBooking;
  columnCount: number;
  columnIndex: number;
  heightPercent: number;
  topPercent: number;
};

type TimelineStyle = CSSProperties & {
  "--appointment-height": string;
  "--appointment-left": string;
  "--appointment-top": string;
  "--appointment-width": string;
};

type StripStyle = CSSProperties & {
  "--appointment-strip-height": string;
};

type MarkerStyle = CSSProperties & {
  "--appointment-marker-top": string;
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

function formatClockLabel(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

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
  if (!days.length) return `No days | ${appointmentCount} ${appointmentLabel}`;
  if (view === "day") return `${days[0].label} | ${appointmentCount} ${appointmentLabel}`;
  return `${days[0].shortLabel} - ${days[days.length - 1].shortLabel} | ${appointmentCount} ${appointmentLabel}`;
}

function timeMarkerLabel(marker: TimeMarker) {
  if (marker.kind === "quarter") return "";
  const hour = Math.floor(marker.minute / 60);
  if (marker.kind === "hour") return hourLabel(hour);

  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:30 ${suffix}`;
}

function minutesFromStartOfDay(booking: AppointmentCalendarBooking) {
  return booking.hour * 60 + booking.minute;
}

function minutesUntilEnd(booking: AppointmentCalendarBooking) {
  return minutesFromStartOfDay(booking) + Math.max(booking.durationMinutes, 15);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function timeBoundsFor(bookings: AppointmentCalendarBooking[], hours: number[]): TimeBounds {
  const bookingStartCandidates = bookings.map((booking) => minutesFromStartOfDay(booking));
  const bookingEndCandidates = bookings.map((booking) => minutesUntilEnd(booking));
  const fallbackStart = hours.length ? Math.min(...hours.map((hour) => hour * 60)) : 8 * 60;
  const fallbackEnd = hours.length ? Math.max(...hours.map((hour) => (hour + 1) * 60)) : 18 * 60;
  const startMinuteSource = bookingStartCandidates.length ? Math.min(...bookingStartCandidates) : fallbackStart;
  const endMinuteSource = bookingEndCandidates.length ? Math.max(...bookingEndCandidates) : fallbackEnd;
  const startMinute = clamp(Math.floor(startMinuteSource / 30) * 30, 0, 23 * 60);
  const endMinute = clamp(Math.ceil(endMinuteSource / 30) * 30 + 30, startMinute + 60, 24 * 60);
  const totalMinutes = Math.max(60, endMinute - startMinute);
  const markers: TimeMarker[] = [];
  for (let marker = startMinute; marker <= endMinute; marker += 15) {
    markers.push({
      kind: marker % 60 === 0 ? "hour" : marker % 30 === 0 ? "half" : "quarter",
      minute: marker
    });
  }

  return {
    endMinute,
    height: Math.max(720, Math.round(totalMinutes * 1.65)),
    markers,
    startMinute,
    totalMinutes
  };
}

function positionedBookingsFor(dayBookings: AppointmentCalendarBooking[], bounds: TimeBounds): PositionedBooking[] {
  const sortedBookings = [...dayBookings].sort(
    (left, right) => minutesFromStartOfDay(left) - minutesFromStartOfDay(right) || minutesUntilEnd(left) - minutesUntilEnd(right)
  );
  const groups: AppointmentCalendarBooking[][] = [];
  let group: AppointmentCalendarBooking[] = [];
  let groupEnd = -1;

  for (const booking of sortedBookings) {
    const start = minutesFromStartOfDay(booking);
    if (group.length && start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push(booking);
    groupEnd = Math.max(groupEnd, minutesUntilEnd(booking));
  }
  if (group.length) groups.push(group);

  return groups.flatMap((bookingGroup) => {
    const columnEnds: number[] = [];
    const assigned = bookingGroup.map((booking) => {
      const start = minutesFromStartOfDay(booking);
      const end = minutesUntilEnd(booking);
      let columnIndex = columnEnds.findIndex((columnEnd) => columnEnd <= start);
      if (columnIndex === -1) {
        columnIndex = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[columnIndex] = end;
      }
      return { booking, columnIndex };
    });
    const columnCount = Math.max(1, columnEnds.length);

    return assigned.map(({ booking, columnIndex }) => {
      const visibleStart = clamp(minutesFromStartOfDay(booking), bounds.startMinute, bounds.endMinute);
      const visibleEnd = clamp(minutesUntilEnd(booking), bounds.startMinute, bounds.endMinute);
      return {
        booking,
        columnCount,
        columnIndex,
        heightPercent: Math.max(4, ((visibleEnd - visibleStart) / bounds.totalMinutes) * 100),
        topPercent: ((visibleStart - bounds.startMinute) / bounds.totalMinutes) * 100
      };
    });
  });
}

function timelineStyle(position: PositionedBooking, bounds: TimeBounds): TimelineStyle {
  const columnWidth = 100 / position.columnCount;
  return {
    "--appointment-height": `${(position.heightPercent / 100) * bounds.height}px`,
    "--appointment-left": `${position.columnIndex * columnWidth}%`,
    "--appointment-top": `${(position.topPercent / 100) * bounds.height}px`,
    "--appointment-width": `calc(${columnWidth}% - 6px)`
  };
}

function markerStyle(marker: number, bounds: TimeBounds): MarkerStyle {
  return {
    "--appointment-marker-top": `${((marker - bounds.startMinute) / bounds.totalMinutes) * bounds.height}px`
  };
}

function initialsFor(name: string, email: string) {
  const source = name || email;
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "C";
}

function phoneHref(value: string) {
  const dialable = value.replace(/[^\d+]/g, "");
  return `tel:${dialable || value}`;
}

function canDrag(booking: AppointmentCalendarBooking) {
  return booking.status !== "CANCELED" && booking.status !== "COMPLETED";
}

function quickStatuses(booking: AppointmentCalendarBooking) {
  if (booking.status === "CANCELED" || booking.status === "COMPLETED") return [];

  return [
    ...(booking.status === "PENDING" ? [{ icon: Check, label: "Confirm", status: "CONFIRMED" as const }] : []),
    { icon: Ban, label: "Cancel", status: "CANCELED" as const },
    { icon: ListChecks, label: "Complete", status: "COMPLETED" as const }
  ];
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea, form"));
}

function AppointmentCard({
  booking,
  dayLabel = "",
  display = "standard",
  dragging = false,
  dragOffset,
  expanded = false,
  onClose,
  onDragStart,
  onPointerDragStart,
  onSelect,
  selected = false,
  style
}: {
  booking: AppointmentCalendarBooking;
  dayLabel?: string;
  display?: "compact" | "standard" | "timeline";
  dragging?: boolean;
  dragOffset?: { dx: number; dy: number };
  expanded?: boolean;
  onClose?: () => void;
  onSelect: (bookingId: string) => void;
  onPointerDragStart?: (booking: AppointmentCalendarBooking, event: ReactPointerEvent<HTMLElement>) => void;
  selected?: boolean;
  style?: TimelineStyle;
  onDragStart: (booking: AppointmentCalendarBooking) => void;
}) {
  if (display === "timeline" && expanded) {
    return (
      <article
        aria-label={`${booking.serviceName} details`}
        aria-modal="false"
        className="appointment-calendar-event timeline expanded"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        style={style}
      >
        <div className="appointment-grow-head">
          <div className="appointment-grow-head-copy">
            <span>{booking.timeLabel} - {booking.endTimeLabel}</span>
            <strong>{booking.serviceName}</strong>
          </div>
          <button aria-label="Close appointment details" className="appointment-event-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="appointment-grow-body">
          <AppointmentExpandedDetails booking={booking} dayLabel={dayLabel} />
        </div>
      </article>
    );
  }

  const actions = !selected && display === "standard" ? quickStatuses(booking) : [];
  const isTimeline = display === "timeline";
  const className = [
    "appointment-calendar-event",
    display === "compact" ? "compact" : "",
    isTimeline ? "timeline" : "",
    selected ? "selected" : "",
    dragging ? "dragging" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const secondaryLabel =
    display === "timeline" ?
    booking.durationLabel :
    `${booking.serviceName}${booking.staffName ? ` | ${booking.staffName}` : ""}`;
  // Timeline chips use custom pointer dragging (so the card visibly lifts and
  // follows the cursor); other views keep the native drag-and-drop ghost.
  const composedStyle: CSSProperties | undefined =
    isTimeline && dragging && dragOffset ? { ...style, transform: `translate(${dragOffset.dx}px, ${dragOffset.dy}px)` } : style;

  return (
    <article
      aria-expanded={selected}
      aria-label={`${booking.serviceName}, ${booking.timeLabel} to ${booking.endTimeLabel}, ${booking.durationLabel}`}
      className={className}
      draggable={isTimeline ? undefined : canDrag(booking)}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        onSelect(booking.id);
      }}
      onDragStart={
        isTimeline
          ? undefined
          : (event) => {
              if (!canDrag(booking)) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", booking.id);
              onDragStart(booking);
            }
      }
      onPointerDown={
        isTimeline && canDrag(booking)
          ? (event) => {
              if (isInteractiveTarget(event.target)) return;
              onPointerDragStart?.(booking, event);
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        onSelect(booking.id);
      }}
      role="button"
      style={composedStyle}
      tabIndex={0}
    >
      <div className="appointment-calendar-event-main">
        <span>
          {canDrag(booking) ? <GripVertical size={14} /> : null}
          {display === "timeline" ? `${booking.timeLabel} - ${booking.endTimeLabel}` : booking.timeLabel}
        </span>
        <strong>{display === "timeline" ? booking.serviceName : booking.customerName}</strong>
        <small>{secondaryLabel}</small>
      </div>
      {!selected && display !== "timeline" && booking.warnings.length ? (
        <div className="appointment-conflict-warning">
          <AlertTriangle size={14} />
          {booking.warnings[0]}
          {booking.warnings.length > 1 ? ` +${booking.warnings.length - 1} more` : ""}
        </div>
      ) : null}
      {actions.length ? (
        <div className="appointment-calendar-event-actions">
          {actions.map((action) => {
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
    </article>
  );
}

function bookingClient(booking: AppointmentCalendarBooking): AppointmentCalendarClient {
  return booking.client || {
    affiliation: "Booking contact",
    email: booking.customerEmail,
    id: "",
    name: booking.customerName,
    phone: booking.customerPhone,
    photoUrl: "",
    pipeline: "No client record",
    status: "Unlinked"
  };
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
  const [activeView, setActiveView] = useState(view);
  const [draggedBooking, setDraggedBooking] = useState<DraggedBooking | null>(null);
  const [pendingTarget, setPendingTarget] = useState("");
  const [message, setMessage] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>("");
  const [pointerDrag, setPointerDrag] = useState<PointerDragRender | null>(null);
  const dragRef = useRef<PointerDragSession | null>(null);
  const dragAbortRef = useRef<AbortController | null>(null);
  const suppressClickRef = useRef(false);
  const timeBoundsRef = useRef<TimeBounds | null>(null);
  const bookingsRef = useRef<AppointmentCalendarBooking[]>([]);
  const [isPending, startTransition] = useTransition();
  const groupedBookings = useMemo(() => bookingsByDate(bookings), [bookings]);
  const dayLabels = useMemo(() => new Map(days.map((day) => [day.dateKey, day.label])), [days]);
  const visibleDays = useMemo(() => daysForView(days, activeView, selectedDateKey), [activeView, days, selectedDateKey]);
  const visibleDateKeys = useMemo(() => new Set(visibleDays.map((day) => day.dateKey)), [visibleDays]);
  const visibleBookings = useMemo(
    () => bookings.filter((booking) => visibleDateKeys.has(booking.dateKey)),
    [bookings, visibleDateKeys]
  );
  const selectedBooking = useMemo(
    () => visibleBookings.find((booking) => booking.id === selectedBookingId) || null,
    [selectedBookingId, visibleBookings]
  );
  const selectedDayLabel = selectedBooking ? dayLabels.get(selectedBooking.dateKey) || selectedBooking.dateKey : "";
  const timeBounds = useMemo(() => timeBoundsFor(visibleBookings, hours), [visibleBookings, hours]);
  const stripStyle: StripStyle = { "--appointment-strip-height": `${timeBounds.height}px` };
  const viewSummary = rangeSummary(activeView, visibleDays, visibleBookings.length);

  useEffect(() => {
    timeBoundsRef.current = timeBounds;
    bookingsRef.current = bookings;
  });

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
    setActiveView(nextView);
    setSelectedBookingId("");
    setMessage("");
    setConfirmStage("");
    setPendingReschedule(null);
    setDraggedBooking(null);

    const viewInput = document.getElementById(calendarViewInputId);
    if (viewInput instanceof HTMLInputElement) {
      viewInput.value = nextView;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.replaceState(null, "", url);
  }

  function dropBooking(dateKey: string, hour?: number, minuteOverride?: number) {
    const bookingId = draggedBooking?.id;
    if (!bookingId) return;
    const minute = minuteOverride ?? draggedBooking.minute;
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

  function cancelReschedule() {
    setConfirmStage("");
    setPendingReschedule(null);
  }

  function submitReschedule(notifyCustomer: boolean) {
    const pending = pendingReschedule;
    if (!pending) return;
    setConfirmStage("");
    setMessage("");
    setPendingTarget(`${pending.booking.id}:${pending.dateKey}:${pending.hour}:${pending.minute}`);

    startTransition(async () => {
      const result = await rescheduleBookingFromCalendarAction({
        bookingId: pending.booking.id,
        dateKey: pending.dateKey,
        hour: pending.hour,
        minute: pending.minute,
        notifyCustomer
      });

      setPendingReschedule(null);
      setPendingTarget("");

      if (!result.ok) {
        setMessage(result.error || "Unable to reschedule appointment.");
        return;
      }

      setMessage(notifyCustomer ? "Appointment rescheduled. The client will be emailed." : "Appointment rescheduled.");
      router.refresh();
    });
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (!draggedBooking) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const bounds = timeBoundsRef.current;
    if (!drag || !bounds || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.moved = drag.moved || Math.hypot(dx, dy) > 4;

    // Find which day lane the pointer is over so dragging across days works too.
    const node = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const lane = node?.closest?.(".appointment-strip-day-lane") as HTMLElement | null;
    const laneKey = lane?.dataset.dateKey;
    if (lane && laneKey) {
      const rect = lane.getBoundingClientRect();
      const chipTopY = event.clientY - drag.grabOffsetPx;
      const ratio = clamp((chipTopY - rect.top) / Math.max(rect.height, 1), 0, 1);
      const rawMinute = bounds.startMinute + ratio * bounds.totalMinutes;
      drag.targetDateKey = laneKey;
      drag.targetMinute = clamp(Math.round(rawMinute / 15) * 15, bounds.startMinute, bounds.endMinute - drag.durationMinutes);
    }

    if (drag.moved && event.cancelable) event.preventDefault();
    setPointerDrag({
      bookingId: drag.bookingId,
      dx,
      dy,
      moved: drag.moved,
      targetDateKey: drag.targetDateKey,
      targetMinute: drag.targetMinute
    });
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    dragAbortRef.current?.abort();
    dragAbortRef.current = null;
    dragRef.current = null;
    setPointerDrag(null);
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) return; // a tap, not a drag — let onClick expand the card

    suppressClickRef.current = true;
    const booking = bookingsRef.current.find((item) => item.id === drag.bookingId);
    if (!booking) return;
    if (drag.targetDateKey === drag.originDateKey && drag.targetMinute === drag.originMinute) return;

    setMessage("");
    setPendingReschedule({
      booking,
      dateKey: drag.targetDateKey,
      hour: Math.floor(drag.targetMinute / 60),
      minute: drag.targetMinute % 60,
      newStartLabel: formatClockLabel(drag.targetMinute),
      newEndLabel: formatClockLabel(drag.targetMinute + Math.max(booking.durationMinutes, 15))
    });
    setConfirmStage("change");
  }, []);

  function beginPointerDrag(booking: AppointmentCalendarBooking, event: ReactPointerEvent<HTMLElement>) {
    if (!canDrag(booking)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const originMinute = booking.hour * 60 + booking.minute;
    dragRef.current = {
      bookingId: booking.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetPx: event.clientY - rect.top,
      durationMinutes: Math.max(booking.durationMinutes, 15),
      originDateKey: booking.dateKey,
      originMinute,
      targetDateKey: booking.dateKey,
      targetMinute: originMinute,
      moved: false
    };
    setSelectedBookingId("");
    setMessage("");
    setPointerDrag({ bookingId: booking.id, dx: 0, dy: 0, moved: false, targetDateKey: booking.dateKey, targetMinute: originMinute });

    dragAbortRef.current?.abort();
    const controller = new AbortController();
    dragAbortRef.current = controller;
    window.addEventListener("pointermove", handlePointerMove, { signal: controller.signal });
    window.addEventListener("pointerup", handlePointerUp, { signal: controller.signal });
    window.addEventListener("pointercancel", handlePointerUp, { signal: controller.signal });
  }

  function selectTimelineBooking(bookingId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectedBookingId(bookingId);
  }

  useEffect(() => () => dragAbortRef.current?.abort(), []);

  const viewControls = (
    <div className="appointment-calendar-client-bar">
      <Tabs className="appointment-calendar-view-tabs" aria-label="Calendar view">
        {calendarViews.map((item) => (
          <Tab aria-selected={item === activeView} key={item} onClick={() => changeView(item)}>
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
              <strong>{pendingReschedule.booking.timeLabel} - {pendingReschedule.booking.endTimeLabel}</strong>
            </div>
            <CalendarClock aria-hidden="true" size={20} />
            <div>
              <span>To</span>
              <strong>{pendingReschedule.newStartLabel} - {pendingReschedule.newEndLabel}</strong>
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
            {pendingReschedule.newStartLabel} - {pendingReschedule.newEndLabel}.
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

  if (activeView === "agenda") {
    return (
      <div className="appointment-calendar">
        <CalendarStatus message={message} pending={isPending} />
        {viewControls}
        <div className="appointment-agenda-list">
          {visibleDays.map((day) => {
            const dayBookings = groupedBookings.get(day.dateKey) || [];
            return (
              <section className="appointment-agenda-day" key={day.dateKey}>
                <h3>
                  <CalendarDays size={17} />
                  {day.label}
                </h3>
                {dayBookings.length ? (
                  dayBookings.map((booking) => (
                    <AppointmentCard
                      booking={booking}
                      key={booking.id}
                      onDragStart={(item) => setDraggedBooking(item)}
                      onSelect={setSelectedBookingId}
                      selected={selectedBookingId === booking.id}
                    />
                  ))
                ) : (
                  <p>No appointments.</p>
                )}
              </section>
            );
          })}
        </div>
        {floatingDetails}
        {rescheduleModals}
      </div>
    );
  }

  if (activeView === "month") {
    return (
      <div className="appointment-calendar">
        <CalendarStatus message={message} pending={isPending} />
        {viewControls}
        <div className="appointment-month-grid">
          {visibleDays.map((day) => {
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
                      display="compact"
                      key={booking.id}
                      onDragStart={(item) => setDraggedBooking(item)}
                      onSelect={setSelectedBookingId}
                      selected={selectedBookingId === booking.id}
                    />
                  ))}
                  {dayBookings.length > 4 ? <span className="ui-badge">+{dayBookings.length - 4} more</span> : null}
                </div>
              </section>
            );
          })}
        </div>
        {floatingDetails}
        {rescheduleModals}
      </div>
    );
  }

  return (
    <div className="appointment-calendar">
      <CalendarStatus message={message} pending={isPending} />
      {viewControls}
      <div className={activeView === "day" ? "appointment-time-strip single-day" : "appointment-time-strip"} style={stripStyle}>
        {selectedBooking ? (
          <button
            aria-label="Close appointment details"
            className="appointment-grow-scrim"
            onClick={() => setSelectedBookingId("")}
            type="button"
          />
        ) : null}
        <div className="appointment-strip-corner">Time</div>
        {visibleDays.map((day) => (
          <div className={day.isToday ? "appointment-strip-day-heading today" : "appointment-strip-day-heading"} key={day.dateKey}>
            <span>{day.shortLabel}</span>
            <strong>{day.dayNumber}</strong>
          </div>
        ))}
        <div className="appointment-strip-label-rail">
          {timeBounds.markers.filter((marker) => marker.kind !== "quarter").map((marker) => (
            <span className={`appointment-strip-time-label ${marker.kind}`} key={marker.minute} style={markerStyle(marker.minute, timeBounds)}>
              {timeMarkerLabel(marker)}
            </span>
          ))}
        </div>
        {visibleDays.map((day) => {
          const dayBookings = groupedBookings.get(day.dateKey) || [];
          const positionedBookings = positionedBookingsFor(dayBookings, timeBounds);
          const pendingOnDay = pendingTarget ? pendingTarget.split(":")[1] === day.dateKey : false;
          const dragOnDay = Boolean(pointerDrag?.moved) && pointerDrag?.targetDateKey === day.dateKey;
          const dragDurationMinutes = pointerDrag
            ? Math.max(bookings.find((item) => item.id === pointerDrag.bookingId)?.durationMinutes ?? 15, 15)
            : 15;

          return (
            <section
              className={[
                "appointment-strip-day-lane",
                day.isToday ? "today" : "",
                pointerDrag?.moved ? "drop-ready" : "",
                dragOnDay ? "drag-target" : "",
                pendingOnDay ? "pending" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-date-key={day.dateKey}
              key={day.dateKey}
            >
              <div className="appointment-strip-lines" aria-hidden="true">
                {timeBounds.markers.map((marker) => (
                  <span className={`appointment-strip-line ${marker.kind}`} key={marker.minute} style={markerStyle(marker.minute, timeBounds)} />
                ))}
              </div>
              {dragOnDay && pointerDrag ? (
                <div
                  aria-hidden="true"
                  className="appointment-drop-indicator"
                  style={
                    {
                      "--appointment-indicator-height": `${(dragDurationMinutes / timeBounds.totalMinutes) * timeBounds.height}px`,
                      "--appointment-marker-top": `${((pointerDrag.targetMinute - timeBounds.startMinute) / timeBounds.totalMinutes) * timeBounds.height}px`
                    } as IndicatorStyle
                  }
                >
                  <span>{formatClockLabel(pointerDrag.targetMinute)}</span>
                </div>
              ) : null}
              {positionedBookings.map((position) => (
                <AppointmentCard
                  booking={position.booking}
                  dayLabel={dayLabels.get(day.dateKey) || day.label}
                  display="timeline"
                  dragging={pointerDrag?.bookingId === position.booking.id && pointerDrag.moved}
                  dragOffset={
                    pointerDrag?.bookingId === position.booking.id ? { dx: pointerDrag.dx, dy: pointerDrag.dy } : undefined
                  }
                  expanded={selectedBookingId === position.booking.id}
                  key={position.booking.id}
                  onClose={() => setSelectedBookingId("")}
                  onDragStart={(item) => setDraggedBooking(item)}
                  onPointerDragStart={beginPointerDrag}
                  onSelect={selectTimelineBooking}
                  selected={selectedBookingId === position.booking.id}
                  style={timelineStyle(position, timeBounds)}
                />
              ))}
              {!positionedBookings.length ? <span className="appointment-strip-empty">No appointments</span> : null}
            </section>
          );
        })}
      </div>
      {rescheduleModals}
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
