import Link from "next/link";
import { BookingStatus, BookingWaitlistStatus, Prisma } from "@prisma/client";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Filter, ListChecks } from "lucide-react";
import { getAccessibleBookingWaitlistWhere, getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { bookingConflictWarnings } from "@/lib/bookings/conflicts";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { addDaysToDateKey, getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { promoteWaitlistEntryAction, updateWaitlistEntryStatusAction } from "./actions";
import { AppointmentCalendar, type AppointmentCalendarBooking, type AppointmentCalendarDay } from "./components/appointment-calendar";
import { AppointmentsTable } from "./components/appointments-table";

export const dynamic = "force-dynamic";

const pageSize = 25;
const statusFilters = ["upcoming", "all", ...Object.values(BookingStatus).map((status) => status.toLowerCase())] as const;
const calendarViews = ["month", "week", "day", "agenda"] as const;

type AppointmentsPageProps = {
  searchParams?: Promise<{
    date?: string;
    error?: string;
    page?: string;
    resourceId?: string;
    saved?: string;
    staffId?: string;
    status?: string;
    view?: string;
  }>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "upcoming" : "upcoming";
}

function normalizeCalendarView(value?: string): (typeof calendarViews)[number] {
  return calendarViews.includes(value as (typeof calendarViews)[number]) ? (value as (typeof calendarViews)[number]) : "week";
}

function validDateKey(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function dateKeyToUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfWeekKey(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  return addDaysToDateKey(dateKey, -date.getUTCDay());
}

function startOfMonthKey(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  return dateKeyFromUtcDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function addMonths(dateKey: string, count: number) {
  const date = dateKeyToUtcDate(dateKey);
  return dateKeyFromUtcDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)));
}

function calendarWindow(view: (typeof calendarViews)[number], dateKey: string) {
  if (view === "month") {
    const monthStart = startOfMonthKey(dateKey);
    const gridStart = startOfWeekKey(monthStart);
    return {
      activeMonth: dateKeyToUtcDate(monthStart).getUTCMonth(),
      endKey: addDaysToDateKey(gridStart, 42),
      nextDateKey: addMonths(monthStart, 1),
      previousDateKey: addMonths(monthStart, -1),
      startKey: gridStart
    };
  }

  if (view === "day") {
    return {
      activeMonth: dateKeyToUtcDate(dateKey).getUTCMonth(),
      endKey: addDaysToDateKey(dateKey, 1),
      nextDateKey: addDaysToDateKey(dateKey, 1),
      previousDateKey: addDaysToDateKey(dateKey, -1),
      startKey: dateKey
    };
  }

  if (view === "agenda") {
    return {
      activeMonth: dateKeyToUtcDate(dateKey).getUTCMonth(),
      endKey: addDaysToDateKey(dateKey, 14),
      nextDateKey: addDaysToDateKey(dateKey, 14),
      previousDateKey: addDaysToDateKey(dateKey, -14),
      startKey: dateKey
    };
  }

  const weekStart = startOfWeekKey(dateKey);
  return {
    activeMonth: dateKeyToUtcDate(dateKey).getUTCMonth(),
    endKey: addDaysToDateKey(weekStart, 7),
    nextDateKey: addDaysToDateKey(weekStart, 7),
    previousDateKey: addDaysToDateKey(weekStart, -7),
    startKey: weekStart
  };
}

function dayList(input: { activeMonth: number; endKey: string; startKey: string; todayKey: string; timeZone: string }) {
  const days: AppointmentCalendarDay[] = [];
  for (let dateKey = input.startKey; dateKey < input.endKey; dateKey = addDaysToDateKey(dateKey, 1)) {
    const day = parseZonedDateKey(dateKey, input.timeZone) || dateKeyToUtcDate(dateKey);
    days.push({
      dateKey,
      dayNumber: new Intl.DateTimeFormat("en", { day: "numeric", timeZone: input.timeZone }).format(day),
      isOutsideMonth: dateKeyToUtcDate(dateKey).getUTCMonth() !== input.activeMonth,
      isToday: dateKey === input.todayKey,
      label: new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: input.timeZone }).format(day),
      shortLabel: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", weekday: "short", timeZone: input.timeZone }).format(day)
    });
  }
  return days;
}

function localBookingParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    timeLabel: new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(date)
  };
}

function formatDateTimeLocalInput(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function calendarHref(input: {
  dateKey: string;
  page?: number;
  resourceId: string;
  staffId: string;
  statusFilter: string;
  view: string;
}) {
  const params = new URLSearchParams({
    date: input.dateKey,
    status: input.statusFilter,
    view: input.view
  });
  if (input.staffId) params.set("staffId", input.staffId);
  if (input.resourceId) params.set("resourceId", input.resourceId);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/modules/appointments?${params.toString()}`;
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps = {}) {
  const now = new Date();
  const params = searchParams ? await searchParams : {};
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const view = normalizeCalendarView(params.view);
  const todayKey = getTodayDateKey(settings.timezone);
  const selectedDateKey = validDateKey(params.date, todayKey);
  const selectedStaffId = params.staffId || "";
  const selectedResourceId = params.resourceId || "";
  const calendarRange = calendarWindow(view, selectedDateKey);
  const rangeStart = parseZonedDateKey(calendarRange.startKey, settings.timezone) || now;
  const rangeEnd = parseZonedDateKey(calendarRange.endKey, settings.timezone) || now;
  const statusWhere: Prisma.BookingWhereInput =
    statusFilter === "upcoming"
      ? { status: { not: BookingStatus.CANCELED }, startsAt: { gte: now } }
      : statusFilter === "all"
        ? {}
        : { status: statusFilter.toUpperCase() as BookingStatus };
  const assignmentWhere: Prisma.BookingWhereInput = {
    ...(selectedStaffId ? { staffId: selectedStaffId } : {}),
    ...(selectedResourceId ? { resources: { some: { resourceId: selectedResourceId } } } : {})
  };
  const bookingWhere: Prisma.BookingWhereInput = await getAccessibleBookingWhere(user, settings.siteId, {
    ...statusWhere,
    ...assignmentWhere
  });
  const calendarWhere: Prisma.BookingWhereInput = await getAccessibleBookingWhere(user, settings.siteId, {
    ...assignmentWhere,
    status: { not: BookingStatus.CANCELED },
    startsAt: { lt: rangeEnd },
    endsAt: { gt: rangeStart }
  });
  const waitlistWhere: Prisma.BookingWaitlistEntryWhereInput = await getAccessibleBookingWaitlistWhere(user, settings.siteId, {
    status: BookingWaitlistStatus.WAITING,
    ...(selectedStaffId ? { staffId: selectedStaffId } : {}),
    ...(selectedResourceId ? { service: { resourceAssignments: { some: { resourceId: selectedResourceId } } } } : {})
  });

  const [bookings, bookingCount, pendingCount, upcomingCount, waitlistEntries, waitlistCount, calendarBookings, staff, resources] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      include: {
        resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
        service: { include: { resourceAssignments: { select: { resourceId: true } } } },
        staff: true
      },
      orderBy: { startsAt: statusFilter === "upcoming" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.booking.count({ where: bookingWhere }),
    prisma.booking.count({ where: await getAccessibleBookingWhere(user, settings.siteId, { status: "PENDING" }) }),
    prisma.booking.count({
      where: await getAccessibleBookingWhere(user, settings.siteId, {
        status: { not: "CANCELED" },
        startsAt: { gte: now }
      })
    }),
    prisma.bookingWaitlistEntry.findMany({
      where: waitlistWhere,
      include: {
        service: {
          include: {
            staffAssignments: {
              where: { staff: { isActive: true } },
              include: { staff: true },
              orderBy: { staff: { name: "asc" } }
            }
          }
        },
        staff: true
      },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    prisma.bookingWaitlistEntry.count({ where: waitlistWhere }),
    prisma.booking.findMany({
      where: calendarWhere,
      include: {
        resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
        service: { include: { resourceAssignments: { select: { resourceId: true } } } },
        staff: true
      },
      orderBy: { startsAt: "asc" },
      take: 500
    }),
    prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] })
  ]);
  const pageCount = Math.max(1, Math.ceil(bookingCount / pageSize));
  const warningsByBookingId = new Map<string, string[]>();
  for (const warning of bookingConflictWarnings(calendarBookings)) {
    const messages = warningsByBookingId.get(warning.bookingId) || [];
    messages.push(warning.message);
    warningsByBookingId.set(warning.bookingId, messages);
  }
  const days = dayList({
    activeMonth: calendarRange.activeMonth,
    endKey: calendarRange.endKey,
    startKey: calendarRange.startKey,
    timeZone: settings.timezone,
    todayKey
  });
  const calendarItems: AppointmentCalendarBooking[] = calendarBookings.map((booking) => {
    const parts = localBookingParts(booking.startsAt, settings.timezone);
    return {
      customerName: booking.customerName,
      dateKey: parts.dateKey,
      endsAt: booking.endsAt.toISOString(),
      hour: parts.hour,
      id: booking.id,
      minute: parts.minute,
      resourceIds: booking.resources.map((assignment) => assignment.resourceId),
      resourceNames: booking.resources.map((assignment) => assignment.resource.name),
      serviceName: booking.service.name,
      staffId: booking.staffId || "",
      staffName: booking.staff?.name || "",
      startsAt: booking.startsAt.toISOString(),
      status: booking.status,
      timeLabel: parts.timeLabel,
      warnings: warningsByBookingId.get(booking.id) || []
    };
  });
  const calendarHours = Array.from(
    new Set([
      ...Array.from({ length: 13 }, (_, index) => index + 7),
      ...calendarItems.map((booking) => booking.hour)
    ])
  ).sort((left, right) => left - right);
  const selectedRangeLabel =
    view === "day"
      ? days[0]?.label || selectedDateKey
      : `${days[0]?.shortLabel || calendarRange.startKey} - ${
          days[days.length - 1]?.shortLabel || addDaysToDateKey(calendarRange.endKey, -1)
        }`;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Appointments</p>
          <h1>Active appointment desk</h1>
          <p>Review upcoming bookings, confirm requests, cancel conflicts, and mark completed work.</p>
        </div>
        <Link className="button secondary" href="/admin/modules/scheduling">
          <CalendarDays size={18} />
          Scheduling setup
        </Link>
      </header>

      {params.saved ? <div className="success-message">Appointment desk updated.</div> : null}
      {params.error ? <div className="error">{params.error}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Clock size={22} />
          <h3>{upcomingCount} upcoming</h3>
          <p className="lead lead-compact">
            Non-canceled appointments from today forward.
          </p>
        </div>
        <div className="card">
          <ListChecks size={22} />
          <h3>{pendingCount} pending</h3>
          <p className="lead lead-compact">
            Requests that may need confirmation.
          </p>
        </div>
        <div className="card">
          <CalendarDays size={22} />
          <h3>{waitlistCount} waitlisted</h3>
          <p className="lead lead-compact">
            Clients waiting for a full service/date.
          </p>
        </div>
      </section>

      <section className="card appointment-calendar-card">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Calendar</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {selectedRangeLabel} | {calendarItems.length} appointments
            </p>
          </div>
          <div className="appointment-calendar-toolbar">
            <Link
              className="button secondary"
              href={calendarHref({
                dateKey: calendarRange.previousDateKey,
                resourceId: selectedResourceId,
                staffId: selectedStaffId,
                statusFilter,
                view
              })}
            >
              <ChevronLeft size={18} />
              Previous
            </Link>
            <Link
              className="button secondary"
              href={calendarHref({ dateKey: todayKey, resourceId: selectedResourceId, staffId: selectedStaffId, statusFilter, view })}
            >
              Today
            </Link>
            <Link
              className="button secondary"
              href={calendarHref({
                dateKey: calendarRange.nextDateKey,
                resourceId: selectedResourceId,
                staffId: selectedStaffId,
                statusFilter,
                view
              })}
            >
              Next
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        <form action="/admin/modules/appointments" className="appointment-calendar-filters">
          <input name="status" type="hidden" value={statusFilter} />
          <label>
            View
            <select name="view" defaultValue={view}>
              {calendarViews.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input name="date" type="date" defaultValue={selectedDateKey} />
          </label>
          <label>
            Staff
            <select name="staffId" defaultValue={selectedStaffId}>
              <option value="">All staff</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resource
            <select name="resourceId" defaultValue={selectedResourceId}>
              <option value="">All resources</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" type="submit">
            <Filter size={18} />
            Apply
          </button>
        </form>

        <div className="appointment-calendar-view-tabs">
          {calendarViews.map((item) => (
            <Link
              className={item === view ? "button" : "button secondary"}
              href={calendarHref({
                dateKey: selectedDateKey,
                resourceId: selectedResourceId,
                staffId: selectedStaffId,
                statusFilter,
                view: item
              })}
              key={item}
            >
              {item}
            </Link>
          ))}
        </div>

        <AppointmentCalendar bookings={calendarItems} days={days} hours={calendarHours} view={view} />
      </section>

      <section className="card">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Waitlist</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {waitlistCount} waiting clients. Promote by choosing a real available slot.
            </p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Service</th>
              <th>Desired date</th>
              <th>Promote</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {waitlistEntries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <strong>{entry.customerName}</strong>
                  <br />
                  <span className="muted-text">{entry.customerEmail}</span>
                  {entry.customerPhone ? (
                    <>
                      <br />
                      <span className="muted-text">{entry.customerPhone}</span>
                    </>
                  ) : null}
                </td>
                <td>
                  {entry.service.name}
                  <br />
                  <span className="muted-text">{entry.staff?.name || "Any staff"}</span>
                  {entry.notes ? (
                    <>
                      <br />
                      <span className="muted-text">{entry.notes}</span>
                    </>
                  ) : null}
                </td>
                <td>{formatDateTime(entry.startsAt, settings.timezone)}</td>
                <td>
                  <form action={promoteWaitlistEntryAction} className="form-grid" style={{ gap: 8 }}>
                    <input type="hidden" name="id" value={entry.id} />
                    <div className="field">
                      <label htmlFor={`waitlist-${entry.id}-startsAt`}>Start time</label>
                      <input
                        id={`waitlist-${entry.id}-startsAt`}
                        name="startsAt"
                        type="datetime-local"
                        defaultValue={formatDateTimeLocalInput(entry.startsAt, settings.timezone)}
                        required
                      />
                    </div>
                    {entry.service.staffAssignments.length ? (
                      <div className="field">
                        <label htmlFor={`waitlist-${entry.id}-staffId`}>Staff</label>
                        <select id={`waitlist-${entry.id}-staffId`} name="staffId" defaultValue={entry.staffId || ""} required>
                          <option value="">Choose staff</option>
                          {entry.service.staffAssignments.map((assignment) => (
                            <option key={assignment.staffId} value={assignment.staffId}>
                              {assignment.staff.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <button className="button secondary" type="submit">
                      Promote
                    </button>
                  </form>
                </td>
                <td>
                  <form action={updateWaitlistEntryStatusAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <input type="hidden" name="status" value={BookingWaitlistStatus.DECLINED} />
                    <button className="button danger" type="submit">
                      decline
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!waitlistEntries.length ? (
              <tr>
                <td colSpan={5}>No waitlist entries match these filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Appointment list</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>{bookingCount} matching appointments</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {statusFilters.map((filter) => (
              <Link
                className={filter === statusFilter ? "button" : "button secondary"}
                href={calendarHref({
                  dateKey: selectedDateKey,
                  resourceId: selectedResourceId,
                  staffId: selectedStaffId,
                  statusFilter: filter,
                  view
                })}
                key={filter}
              >
                {filter}
              </Link>
            ))}
          </div>
        </div>
        <AppointmentsTable bookings={bookings} timezone={settings.timezone} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Link
            aria-disabled={page <= 1}
            className="button secondary"
            href={calendarHref({
              dateKey: selectedDateKey,
              page: Math.max(1, page - 1),
              resourceId: selectedResourceId,
              staffId: selectedStaffId,
              statusFilter,
              view
            })}
          >
            Previous
          </Link>
          <span className="pill">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Link
            aria-disabled={page >= pageCount}
            className="button secondary"
            href={calendarHref({
              dateKey: selectedDateKey,
              page: Math.min(pageCount, page + 1),
              resourceId: selectedResourceId,
              staffId: selectedStaffId,
              statusFilter,
              view
            })}
          >
            Next
          </Link>
        </div>
      </section>
    </div>
  );
}
