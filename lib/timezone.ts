import "server-only";

const datePartFormatterCache = new Map<string, Intl.DateTimeFormat>();

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDatePartFormatter(timeZone: string) {
  const cached = datePartFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  datePartFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getDatePartFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (localAsUtc - date.getTime()) / 60000;
}

export function zonedTimeToUtc(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }
) {
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0)
  );
  const firstOffset = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  const adjusted = new Date(utcGuess.getTime() - firstOffset * 60000);
  const finalOffset = getTimeZoneOffsetMinutes(adjusted, timeZone);

  if (finalOffset !== firstOffset) {
    return new Date(utcGuess.getTime() - finalOffset * 60000);
  }

  return adjusted;
}

export function getZonedDateKey(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseZonedDateKey(dateKey: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const [, year, month, day] = match;
  return zonedTimeToUtc(timeZone, {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  });
}

export function parseZonedDateTimeInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return zonedTimeToUtc(timeZone, {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute)
  });
}

export function getZonedDayBounds(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const start = zonedTimeToUtc(timeZone, {
    year: parts.year,
    month: parts.month,
    day: parts.day
  });
  const endAnchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const endParts = {
    year: endAnchor.getUTCFullYear(),
    month: endAnchor.getUTCMonth() + 1,
    day: endAnchor.getUTCDate()
  };

  return {
    start,
    end: zonedTimeToUtc(timeZone, endParts)
  };
}

export function getZonedWeekday(date: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

export function addMinutesToZonedDay(day: Date, minutes: number, timeZone: string) {
  const parts = getZonedParts(day, timeZone);
  return zonedTimeToUtc(timeZone, {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60
  });
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function getTodayDateKey(timeZone: string) {
  return getZonedDateKey(new Date(), timeZone);
}
