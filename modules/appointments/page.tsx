import Link from "next/link";
import { BookingStatus, BookingWaitlistStatus, Prisma } from "@prisma/client";
import { CalendarDays, Clock, ListChecks, Plus } from "lucide-react";
import { getAccessibleBookingWaitlistWhere, getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { bookingConflictWarnings } from "@/lib/bookings/conflicts";
import { clientStatusLabel } from "@/lib/clients/status";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { addDaysToDateKey, getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { promoteWaitlistEntryAction, updateWaitlistEntryStatusAction } from "./actions";
import { AppointmentCalendar, type AppointmentCalendarBooking, type AppointmentCalendarDay } from "./components/appointment-calendar";
import { AppointmentCalendarShell } from "./components/appointment-calendar-shell";
import { AppointmentsTable } from "./components/appointments-table";
import { Button, ButtonLink, Pagination } from "@/components/ui";
import { addDashboardCardAction } from "@/modules/dashboard/actions";

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
  return calendarViews.includes(value as (typeof calendarViews)[number]) ? value as (typeof calendarViews)[number] : "day";
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

function calendarDataWindow(view: (typeof calendarViews)[number], dateKey: string) {
  const activeWindow = calendarWindow(view, dateKey);
  const monthWindow = calendarWindow("month", dateKey);
  const windows = [activeWindow, monthWindow, calendarWindow("week", dateKey), calendarWindow("day", dateKey), calendarWindow("agenda", dateKey)];
  const startKey = windows.map((window) => window.startKey).sort()[0];
  const endKeys = windows.map((window) => window.endKey).sort();
  const endKey = endKeys[endKeys.length - 1] || activeWindow.endKey;

  return {
    activeMonth: monthWindow.activeMonth,
    endKey,
    nextDateKey: activeWindow.nextDateKey,
    previousDateKey: activeWindow.previousDateKey,
    startKey
  };
}

function dayList(input: {activeMonth: number;endKey: string;startKey: string;todayKey: string;timeZone: string;}) {
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
    }).
    formatToParts(date).
    map((part) => [part.type, part.value])
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

function formatDurationLabel(minutes: number) {
  const duration = Math.max(1, Math.round(minutes));
  const hours = Math.floor(duration / 60);
  const remainingMinutes = duration % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  if (remainingMinutes) parts.push(`${remainingMinutes} min`);
  return parts.join(" ") || "0 min";
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
  const visibleCalendarRange = calendarWindow(view, selectedDateKey);
  const calendarRange = calendarDataWindow(view, selectedDateKey);
  const rangeStart = parseZonedDateKey(calendarRange.startKey, settings.timezone) || now;
  const rangeEnd = parseZonedDateKey(calendarRange.endKey, settings.timezone) || now;
  const statusWhere: Prisma.BookingWhereInput =
  statusFilter === "upcoming" ?
  { status: { not: BookingStatus.CANCELED }, startsAt: { gte: now } } :
  statusFilter === "all" ?
  {} :
  { status: statusFilter.toUpperCase() as BookingStatus };
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
      client: true,
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: { include: { resourceAssignments: { select: { resourceId: true } } } },
      staff: true
    },
    orderBy: { startsAt: "asc" },
    take: 500
  }),
  prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] })]
  );
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
  const visibleRangeDays = dayList({
    activeMonth: calendarRange.activeMonth,
    endKey: visibleCalendarRange.endKey,
    startKey: visibleCalendarRange.startKey,
    timeZone: settings.timezone,
    todayKey
  });
  const calendarItems: AppointmentCalendarBooking[] = calendarBookings.map((booking) => {
    const parts = localBookingParts(booking.startsAt, settings.timezone);
    const endParts = localBookingParts(booking.endsAt, settings.timezone);
    const durationMinutes = Math.max(1, Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000));
    return {
      adminNotes: booking.adminNotes || "",
      client: booking.client ?
      {
        affiliation: booking.client.companyName || booking.client.familyName || "Individual client",
        email: booking.client.email,
        id: booking.client.id,
        name: booking.client.name,
        phone: booking.client.phone || "",
        photoUrl: booking.client.photoUrl,
        pipeline: enumLabel(booking.client.pipelineStage),
        status: clientStatusLabel(booking.client.status)
      } :
      null,
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone || "",
      dateKey: parts.dateKey,
      durationLabel: formatDurationLabel(durationMinutes),
      durationMinutes,
      endTimeLabel: endParts.timeLabel,
      endsAt: booking.endsAt.toISOString(),
      hour: parts.hour,
      id: booking.id,
      minute: parts.minute,
      notes: booking.notes || "",
      policyAccepted: booking.policyAccepted,
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
    ...calendarItems.flatMap((booking) => [
      booking.hour,
      Math.min(24, Math.max(booking.hour + 1, Math.ceil((booking.hour * 60 + booking.minute + booking.durationMinutes) / 60)))
    ])]
    )
  ).sort((left, right) => left - right);
  const visibleRangeDateKeys = new Set(visibleRangeDays.map((day) => day.dateKey));
  const visibleCalendarItemCount = calendarItems.filter((booking) => visibleRangeDateKeys.has(booking.dateKey)).length;
  const selectedRangeLabel =
  view === "day" ?
  visibleRangeDays[0]?.label || selectedDateKey :
  `${visibleRangeDays[0]?.shortLabel || visibleCalendarRange.startKey} - ${
  visibleRangeDays[visibleRangeDays.length - 1]?.shortLabel || addDaysToDateKey(visibleCalendarRange.endKey, -1)}`;
  const currentAppointmentsHref = calendarHref({
    dateKey: selectedDateKey,
    page,
    resourceId: selectedResourceId,
    staffId: selectedStaffId,
    statusFilter,
    view
  });
  const savedMessage = params.saved?.startsWith("dashboard-card") ? "Dashboard card updated." : "Appointment desk updated.";


  return (
    <div className="appointments-workspace">
      <AppointmentCalendarShell
        appointmentCount={visibleCalendarItemCount}
        appointmentListPanel={
          <div className="appointments-modal-stack">
            <div className="appointments-panel-head">
              <div>
                <h2>Appointment list</h2>
                <p>{bookingCount} matching</p>
              </div>
            </div>
            <div className="appointments-status-filters">
              {statusFilters.map((filter) => (
                <Link
                  className={filter === statusFilter ? "ui-button" : "ui-button ui-button-secondary"}
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
            <div className="appointments-panel-table">
              <AppointmentsTable bookings={bookings} timezone={settings.timezone} />
            </div>
            <Pagination
              label="Appointment pages"
              nextHref={calendarHref({
                dateKey: selectedDateKey,
                page: Math.min(pageCount, page + 1),
                resourceId: selectedResourceId,
                staffId: selectedStaffId,
                statusFilter,
                view
              })}
              page={page}
              pageCount={pageCount}
              previousHref={calendarHref({
                dateKey: selectedDateKey,
                page: Math.max(1, page - 1),
                resourceId: selectedResourceId,
                staffId: selectedStaffId,
                statusFilter,
                view
              })}
            />
          </div>
        }
        bookingCount={bookingCount}
        errorMessage={params.error}
        filterPanel={
          <div className="appointments-modal-stack">
            <div className="appointments-inline-metrics" aria-label="Appointment status">
              <div className="appointments-metric">
                <Clock size={18} />
                <span>
                  <strong>{upcomingCount}</strong>
                  Upcoming
                </span>
              </div>
              <div className="appointments-metric">
                <ListChecks size={18} />
                <span>
                  <strong>{pendingCount}</strong>
                  Pending
                </span>
              </div>
              <div className="appointments-metric">
                <CalendarDays size={18} />
                <span>
                  <strong>{waitlistCount}</strong>
                  Waitlisted
                </span>
              </div>
            </div>
            <form id="appointments-filter-form" action="/admin/modules/appointments" className="appointment-calendar-filters appointments-hero-filters">
            <input name="status" type="hidden" value={statusFilter} />
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
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            </form>
          </div>
        }
        nextHref={calendarHref({
          dateKey: calendarRange.nextDateKey,
          resourceId: selectedResourceId,
          staffId: selectedStaffId,
          statusFilter,
          view
        })}
        previousHref={calendarHref({
          dateKey: calendarRange.previousDateKey,
          resourceId: selectedResourceId,
          staffId: selectedStaffId,
          statusFilter,
          view
        })}
        rangeLabel={selectedRangeLabel}
        savedMessage={params.saved ? savedMessage : undefined}
        todayHref={calendarHref({ dateKey: todayKey, resourceId: selectedResourceId, staffId: selectedStaffId, statusFilter, view })}
        toolsPanel={
          <div className="appointments-tools-list">
            <form action={addDashboardCardAction}>
              <input name="cardId" type="hidden" value="appointments.today" />
              <input name="returnTo" type="hidden" value={currentAppointmentsHref} />
              <input name="size" type="hidden" value="lg" />
              <Button type="submit" variant="secondary">
                <Plus size={18} />
                Add today card
              </Button>
            </form>
            <ButtonLink href="/admin/modules/scheduling" variant="secondary">
              <CalendarDays size={18} />
              Scheduling setup
            </ButtonLink>
          </div>
        }
        view={view}
        waitlistCount={waitlistCount}
        waitlistPanel={
          <div className="appointments-modal-stack">
              <div className="appointments-panel-head">
                <div>
                  <h2>Waitlist</h2>
                  <p>{waitlistCount} waiting</p>
                </div>
              </div>
              <div className="appointments-waitlist-list">
                {waitlistEntries.map((entry) => (
                  <article className="appointments-waitlist-card" key={entry.id}>
                    <div>
                      <strong>{entry.customerName}</strong>
                      <p>{entry.service.name}</p>
                      <small>{formatDateTime(entry.startsAt, settings.timezone)}</small>
                    </div>
                    <form action={promoteWaitlistEntryAction} className="appointments-promote-form">
                      <input type="hidden" name="id" value={entry.id} />
                      <label htmlFor={`waitlist-${entry.id}-startsAt`}>Start time</label>
                      <input
                        id={`waitlist-${entry.id}-startsAt`}
                        name="startsAt"
                        type="datetime-local"
                        defaultValue={formatDateTimeLocalInput(entry.startsAt, settings.timezone)}
                        required
                      />
                      {entry.service.staffAssignments.length ? (
                        <>
                          <label htmlFor={`waitlist-${entry.id}-staffId`}>Staff</label>
                          <select id={`waitlist-${entry.id}-staffId`} name="staffId" defaultValue={entry.staffId || ""} required>
                            <option value="">Choose staff</option>
                            {entry.service.staffAssignments.map((assignment) => (
                              <option key={assignment.staffId} value={assignment.staffId}>
                                {assignment.staff.name}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : null}
                      <div className="appointments-waitlist-actions">
                        <Button size="sm" type="submit" variant="secondary">
                          Promote
                        </Button>
                      </div>
                    </form>
                    <form action={updateWaitlistEntryStatusAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value={BookingWaitlistStatus.DECLINED} />
                      <Button size="sm" type="submit" variant="danger">
                        Decline
                      </Button>
                    </form>
                  </article>
                ))}
                {!waitlistEntries.length ? <p className="ui-zero">No waitlist entries match these filters.</p> : null}
              </div>
            </div>
        }
      >
        <AppointmentCalendar
          bookings={calendarItems}
          days={days}
          hours={calendarHours}
          key={`${selectedDateKey}:${view}:${settings.timezone}`}
          selectedDateKey={selectedDateKey}
          timezone={settings.timezone}
          view={view}
        />
      </AppointmentCalendarShell>
    </div>);

}
