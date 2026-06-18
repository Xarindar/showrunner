import "server-only";

import crypto from "node:crypto";
import { BookingStatus } from "@prisma/client";
import { headers } from "next/headers";
import { publicAppBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { CalendarBookingScope, CalendarFeedScope, CalendarFileAdapter } from "@/lib/scheduling/types";

const calendarSecretFallback = "dev-calendar-feed-secret-change-before-deploying";
const maxFeedBookings = 1000;
const feedLookaheadDays = 366;

type CalendarBooking = {
  id: string;
  siteId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
  service: {
    location: string | null;
    name: string;
  };
  staff: {
    name: string;
  } | null;
  resources: Array<{
    resource: {
      name: string;
    };
  }>;
};

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me") || normalized.includes("change-before-deploying");
}

function calendarSecret() {
  const secret = process.env.CALENDAR_FEED_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("CALENDAR_FEED_SECRET or AUTH_SECRET must be strong before calendar feed links can be used.");
  }

  return secret || calendarSecretFallback;
}

function calendarToken(parts: string[]) {
  return crypto.createHmac("sha256", calendarSecret()).update(parts.join(":")).digest("base64url");
}

function timingSafeTokenMatches(expected: string, actual: string) {
  if (!expected || !actual) return false;

  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const actualHash = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(expectedHash, actualHash);
}

function feedTokenScope(input: CalendarFeedScope) {
  return ["calendar-feed", "v1", input.siteId, input.staffId || "site"];
}

function bookingTokenScope(input: CalendarBookingScope) {
  return ["booking-calendar", "v1", input.siteId, input.bookingId];
}

export function calendarFeedToken(input: CalendarFeedScope) {
  return calendarToken(feedTokenScope(input));
}

export function bookingCalendarToken(input: CalendarBookingScope) {
  return calendarToken(bookingTokenScope(input));
}

export function verifyCalendarFeedToken(input: CalendarFeedScope & { token: string }) {
  return timingSafeTokenMatches(calendarFeedToken(input), input.token);
}

export function verifyBookingCalendarToken(input: CalendarBookingScope & { token: string }) {
  return timingSafeTokenMatches(bookingCalendarToken(input), input.token);
}

export function calendarFeedPath(input: CalendarFeedScope) {
  const params = new URLSearchParams({
    siteId: input.siteId,
    token: calendarFeedToken(input)
  });
  if (input.staffId) params.set("staffId", input.staffId);

  return `/api/calendar/feed.ics?${params.toString()}`;
}

export function bookingCalendarPath(input: CalendarBookingScope) {
  const params = new URLSearchParams({
    bookingId: input.bookingId,
    token: bookingCalendarToken(input)
  });

  return `/api/calendar/booking.ics?${params.toString()}`;
}

export const icsCalendarAdapter: CalendarFileAdapter = {
  bookingPath: bookingCalendarPath,
  feedPath: calendarFeedPath
};

export function absoluteCalendarUrl(origin: string, path: string) {
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

export async function requestBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (host) {
    const proto = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return publicAppBaseUrl();
}

function icsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string | null | undefined) {
  return (value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line: string) {
  if (line.length <= 75) return [line];

  const lines: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    lines.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  lines.push(remaining);
  return lines;
}

function icsLines(lines: string[]) {
  return lines.flatMap(foldIcsLine).join("\r\n");
}

function eventStatus(status: BookingStatus) {
  if (status === BookingStatus.CANCELED) return "CANCELLED";
  if (status === BookingStatus.PENDING) return "TENTATIVE";
  return "CONFIRMED";
}

function bookingDescription(booking: CalendarBooking) {
  const details = [
    `Customer: ${booking.customerName}`,
    booking.customerEmail ? `Email: ${booking.customerEmail}` : "",
    booking.customerPhone ? `Phone: ${booking.customerPhone}` : "",
    booking.staff?.name ? `Staff: ${booking.staff.name}` : "",
    booking.resources.length ? `Resources: ${booking.resources.map((item) => item.resource.name).join(", ")}` : "",
    booking.notes ? `Notes: ${booking.notes}` : ""
  ].filter(Boolean);

  return details.join("\n");
}

function bookingEventLines(booking: CalendarBooking, now: Date) {
  return [
    "BEGIN:VEVENT",
    `UID:booking-${booking.id}@site-${booking.siteId}`,
    `DTSTAMP:${icsDate(now)}`,
    `CREATED:${icsDate(booking.createdAt)}`,
    `LAST-MODIFIED:${icsDate(booking.updatedAt)}`,
    `DTSTART:${icsDate(booking.startsAt)}`,
    `DTEND:${icsDate(booking.endsAt)}`,
    `SUMMARY:${icsText(`${booking.service.name}: ${booking.customerName}`)}`,
    `DESCRIPTION:${icsText(bookingDescription(booking))}`,
    booking.service.location ? `LOCATION:${icsText(booking.service.location)}` : "",
    `STATUS:${eventStatus(booking.status)}`,
    "TRANSP:OPAQUE",
    "END:VEVENT"
  ].filter(Boolean);
}

export function renderBookingsIcs(input: { bookings: CalendarBooking[]; calendarName: string }) {
  const now = new Date();
  return `${icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Showrunner//Scheduling Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(input.calendarName)}`,
    ...input.bookings.flatMap((booking) => bookingEventLines(booking, now)),
    "END:VCALENDAR"
  ])}\r\n`;
}

export async function findCalendarBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: { select: { location: true, name: true } },
      staff: { select: { name: true } }
    }
  });
}

export async function listFeedBookings(input: { now?: Date; siteId: string; staffId?: string }) {
  const now = input.now || new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + feedLookaheadDays);

  return prisma.booking.findMany({
    where: {
      siteId: input.siteId,
      ...(input.staffId ? { staffId: input.staffId } : {}),
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      startsAt: {
        gte: now,
        lte: windowEnd
      }
    },
    include: {
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: { select: { location: true, name: true } },
      staff: { select: { name: true } }
    },
    orderBy: { startsAt: "asc" },
    take: maxFeedBookings
  });
}

export function calendarResponse(body: string, filename: string, disposition: "attachment" | "inline" = "attachment") {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  headers.set("content-disposition", `${disposition}; filename="${filename.replace(/"/g, "")}"`);
  headers.set("content-type", "text/calendar; charset=utf-8");

  return new Response(body, { headers });
}
