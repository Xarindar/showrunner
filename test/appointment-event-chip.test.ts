import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventContentArg } from "@fullcalendar/core";
import { AppointmentEventChip } from "../modules/appointments/components/appointment-event-chip";

test("compact calendar cards prioritize the session and keep complete contact/time information accessible", () => {
  const render = (type: string) => renderToStaticMarkup(createElement(AppointmentEventChip, {
    event: { extendedProps: { booking: { customerName: "Ruby Anderson", serviceName: "Portrait session", timeLabel: "10:00 AM", endTimeLabel: "11:00 AM", startsAt: "2026-11-12T16:00:00Z", durationMinutes: 60, status: "CONFIRMED", staffName: "Sam", warnings: [] } } },
    view: { type }
  } as unknown as EventContentArg));
  for (const view of ["timeGridWeek", "dayGridMonth"]) {
    const html = render(view);
    assert.match(html, /appointment-event-chip--summary/);
    assert.match(html, /<strong class="appointment-event-chip__title">Portrait session<\/strong>/);
    assert(!html.includes('class="appointment-event-chip__meta"'));
    assert.match(html, /aria-label="Ruby Anderson, Portrait session, 10:00 AM–11:00 AM, with Sam, confirmed"/);
  }
  const day = render("timeGridDay");
  assert(!day.includes("appointment-event-chip--summary"));
  assert.match(day, /class="appointment-event-chip__customer">Ruby Anderson/);
  assert.match(day, /class="appointment-event-chip__staff">Sam/);
});
