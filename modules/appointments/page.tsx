import { DateTimeInput } from "@/components/ui/time-input";
import { getClientStatusSettings } from "@/lib/clients/configuration";
import { redirect } from "next/navigation";
import { BookingStatus, BookingWaitlistStatus, Prisma } from "@prisma/client";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, ListChecks } from "lucide-react";
import { getAccessibleBookingWaitlistWhere, getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { bookingConflictWarnings } from "@/lib/bookings/conflicts";
import { clientStatusLabel } from "@/lib/clients/status";
import { formatTime, enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { addDaysToDateKey, getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { promoteWaitlistEntryAction, updateWaitlistEntryStatusAction } from "./actions";
import { AppointmentCalendar, type AppointmentCalendarBooking, type AppointmentCalendarDay } from "./components/appointment-calendar";
import { AppointmentDatePicker } from "./components/appointment-date-picker";
import { AppointmentCalendarShell } from "./components/appointment-calendar-shell";
import { Button, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

const calendarViews = ["month", "week", "day", "agenda"] as const;

type AppointmentsPageProps = {
  searchParams?: Promise<{
    date?: string;
    diagnosticDate?: string;
    diagnosticResourceId?: string;
    diagnosticServiceId?: string;
    diagnosticStaffId?: string;
    error?: string;
    q?: string;
    panel?: string;
    resourceId?: string;
    saved?: string;
    staffId?: string;
    tab?: string;
    view?: string;
  }>;
};

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
  const endKeys = [...windows.map((window) => window.endKey), addMonths(dateKey, 2)].sort();
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
    timeLabel: formatTime(date, timeZone)
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
  query: string;
  resourceId: string;
  staffId: string;
  view: string;
}) {
  const params = new URLSearchParams({
    date: input.dateKey,
    view: input.view
  });
  if (input.staffId) params.set("staffId", input.staffId);
  if (input.resourceId) params.set("resourceId", input.resourceId);
  if (input.query) params.set("q", input.query);
  return `/admin/modules/appointments?${params.toString()}`;
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps = {}) {
  const now = new Date();
  const params = searchParams ? await searchParams : {};
  if (params.panel === "rules") {
    const query = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "panel" && value !== undefined) as [string, string][]);
    redirect(`/admin/modules/appointments/schedule?${query}`);
  }
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const { options: configuredStatusOptions } = await getClientStatusSettings(settings.siteId);
  const query = (params.q || "").trim().slice(0, 200);
  const view = normalizeCalendarView(params.view);
  const todayKey = getTodayDateKey(settings.timezone);
  const selectedDateKey = validDateKey(params.date, todayKey);
  const selectedStaffId = params.staffId || "";
  const selectedResourceId = params.resourceId || "";
  const visibleRange = calendarWindow(view, selectedDateKey);
  const dateLabel = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", timeZone: "UTC" });
  const rangeLabel = view === "month"
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateKeyToUtcDate(selectedDateKey))
    : view === "day"
      ? dateLabel.format(dateKeyToUtcDate(selectedDateKey))
      : `${dateLabel.format(dateKeyToUtcDate(visibleRange.startKey))} – ${dateLabel.format(dateKeyToUtcDate(addDaysToDateKey(visibleRange.endKey, -1)))}`;
  const currentWeekStart = startOfWeekKey(todayKey);
  const compactRangeLabel = view === "week"
    ? visibleRange.startKey === currentWeekStart ? "This Week" : visibleRange.startKey < currentWeekStart ? "Previous Week" : "Next Week"
    : undefined;
  const calendarRange = calendarDataWindow(view, selectedDateKey);
  const rangeStart = parseZonedDateKey(calendarRange.startKey, settings.timezone) || now;
  const rangeEnd = parseZonedDateKey(calendarRange.endKey, settings.timezone) || now;
  const assignmentWhere: Prisma.BookingWhereInput = {
    ...(selectedStaffId ? { staffId: selectedStaffId } : {}),
    ...(selectedResourceId ? { resources: { some: { resourceId: selectedResourceId } } } : {})
  };
  const calendarWhere: Prisma.BookingWhereInput = await getAccessibleBookingWhere(user, settings.siteId, {
    ...assignmentWhere,
    ...(query ? { OR: [
      { customerName: { contains: query, mode: "insensitive" as const } },
      { customerEmail: { contains: query, mode: "insensitive" as const } },
      { sessionName: { contains: query, mode: "insensitive" as const } },
      { service: { name: { contains: query, mode: "insensitive" as const } } },
      { client: { name: { contains: query, mode: "insensitive" as const } } }
    ] } : {}),
    status: { not: BookingStatus.CANCELED },
    startsAt: { lt: rangeEnd },
    endsAt: { gt: rangeStart }
  });
  const waitlistWhere: Prisma.BookingWaitlistEntryWhereInput = await getAccessibleBookingWaitlistWhere(user, settings.siteId, {
    status: BookingWaitlistStatus.WAITING,
    ...(selectedStaffId ? { staffId: selectedStaffId } : {}),
    ...(selectedResourceId ? { service: { resourceAssignments: { some: { resourceId: selectedResourceId } } } } : {})
  });

  const [
    pendingCount,
    upcomingCount,
    waitlistEntries,
    waitlistCount,
    calendarBookings,
    staff,
    resources
  ] = await Promise.all([
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
        status: clientStatusLabel(booking.client.status, configuredStatusOptions)
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
      serviceName: booking.sessionName || booking.service.name,
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
  const savedMessage = params.saved?.startsWith("dashboard-card")
    ? "Dashboard card updated."
    : params.saved
      ? "Appointment settings updated."
      : undefined;
  const errorMessage = params.error;


  return (
    <div className="appointments-workspace">
      <AppointmentCalendarShell
        searchQuery={query}
        errorMessage={errorMessage}
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
            <input name="q" type="hidden" value={query} />
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
        savedMessage={savedMessage}
        view={view}
        waitlistCount={waitlistCount}
        waitlistPanel={
          <div className="appointments-modal-stack">
              <p className="muted-text ui-zero">{waitlistCount} waiting</p>
              <div className="appointments-waitlist-list">
                {waitlistEntries.map((entry) => (
                  <article className="studio-panel ui-section-card" key={entry.id}>
                    <div className="ui-section-header">
                      <h2>{entry.customerName}</h2>
                      <form action={updateWaitlistEntryStatusAction}>
                        <input type="hidden" name="id" value={entry.id} />
                        <input type="hidden" name="status" value={BookingWaitlistStatus.DECLINED} />
                        <Button size="sm" type="submit" variant="danger">
                          Decline
                        </Button>
                      </form>
                    </div>
                    <div className="ui-section-body">
                    <p className="ui-zero">{entry.service.name} · {formatDateTime(entry.startsAt, settings.timezone)}</p>
                    <details className="ui-disclosure">
                      <summary>
                        <span>Promote to appointment</span>
                        <ChevronDown aria-hidden="true" className="ui-disclosure-caret" size={16} />
                      </summary>
                      <form action={promoteWaitlistEntryAction} className="appointments-promote-form">
                        <input type="hidden" name="id" value={entry.id} />
                        <label htmlFor={`waitlist-${entry.id}-startsAt`}>Start time</label>
                        <DateTimeInput aria-label="Waitlist start"
                          id={`waitlist-${entry.id}-startsAt`}
                          name="startsAt"

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
                    </details>
                    </div>
                  </article>
                ))}
                {!waitlistEntries.length ? <p className="ui-zero">No waitlist entries match these filters.</p> : null}
              </div>
            </div>
        }
      >
        <AppointmentCalendar
          rangeControls={<nav aria-label="Calendar range" className="appointments-range-nav">
            <ButtonLink variant="secondary" size="sm" aria-label="Previous range" href={calendarHref({ dateKey: calendarRange.previousDateKey, resourceId: selectedResourceId, staffId: selectedStaffId, query, view })}><ChevronLeft size={17} aria-hidden="true" /></ButtonLink>
            <AppointmentDatePicker dateKey={selectedDateKey} label={rangeLabel} compactLabel={compactRangeLabel} />
            <ButtonLink variant="secondary" size="sm" aria-label="Next range" href={calendarHref({ dateKey: calendarRange.nextDateKey, resourceId: selectedResourceId, staffId: selectedStaffId, query, view })}><ChevronRight size={17} aria-hidden="true" /></ButtonLink>
          </nav>}
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
