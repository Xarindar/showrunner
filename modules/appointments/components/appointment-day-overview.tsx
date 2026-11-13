import type { AppointmentCalendarBooking, AppointmentCalendarDay } from "./appointment-calendar";

export function AppointmentDayOverview({ bookings, days, selectedDateKey, view, onSelect, preview = false }: {
  bookings: Pick<AppointmentCalendarBooking, "dateKey">[];
  days: AppointmentCalendarDay[];
  selectedDateKey: string;
  view: "week" | "month";
  onSelect: (dateKey: string) => void;
  preview?: boolean;
}) {
  const start = new Date(`${selectedDateKey}T00:00:00Z`);
  if (view === "month") start.setUTCDate(1);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  if (view === "month") end.setUTCFullYear(Number(selectedDateKey.slice(0, 4)), Number(selectedDateKey.slice(5, 7)), 1);
  else end.setUTCDate(end.getUTCDate() + 7);
  const nextMonthKey = end.toISOString().slice(0, 10);
  const startKey = start.toISOString().slice(0, 10), endKey = end.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const booking of bookings) counts.set(booking.dateKey, (counts.get(booking.dateKey) || 0) + 1);
  return <div className="appointment-day-overview" data-view={view} data-preview={preview || undefined} aria-label={`Appointments by day, ${view} view`}>
    {view === "month" ? <div className="appointment-day-overview-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div> : null}
    <div className="appointment-day-overview-days">
      {days.filter(day => day.dateKey >= startKey && day.dateKey < endKey && (view !== "month" || day.dateKey.slice(0, 7) === selectedDateKey.slice(0, 7))).map(day => {
        const count = counts.get(day.dateKey) || 0;
        const countLabel = `${count} ${count === 1 ? "appointment" : "appointments"}`;
        return <button key={day.dateKey} type="button" className="appointment-day-overview-day"
          style={view === "month" && day.dayNumber === "1" ? { gridColumnStart: new Date(`${day.dateKey}T00:00:00Z`).getUTCDay() + 1 } : undefined}
          data-outside={day.dateKey.slice(0, 7) !== selectedDateKey.slice(0, 7)} aria-current={day.isToday ? "date" : undefined}
          aria-label={`${day.label}, ${countLabel}. Open day view`} onClick={() => onSelect(day.dateKey)}>
          <span>{view === "month" ? day.dayNumber : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day.dateKey}T00:00:00Z`))}</span>
          {view === "week" || count > 0 ? <span className="appointment-day-overview-count" data-empty={!count}>{view === "month" ? count : countLabel}</span> : null}
        </button>;
      })}
    </div>
    {view === "month" && !preview ? <>
      <h2 className="appointment-day-overview-next-month">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(end)}</h2>
      <AppointmentDayOverview bookings={bookings} days={days} selectedDateKey={nextMonthKey} view="month" onSelect={onSelect} preview />
    </> : null}
  </div>;
}
