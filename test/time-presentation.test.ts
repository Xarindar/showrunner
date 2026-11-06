import assert from "node:assert/strict";
import test from "node:test";
import { formatTime, formatDateTime, formatTimeValue, parseTimeValue, minutesToTime } from "../lib/format";
import { dayHoursDraft } from "../lib/scheduling/weekly-hours";

test("every minute round-trips between canonical storage and explicit AM/PM", () => {
  for (let minute = 0; minute < 1440; minute++) {
    const stored = minutesToTime(minute);
    const shown = formatTimeValue(stored);
    assert.match(shown, / (AM|PM)$/);
    assert.equal(parseTimeValue(shown), stored);
  }
  assert.equal(formatTimeValue("00:00"), "12:00 AM");
  assert.equal(formatTimeValue("12:00"), "12:00 PM");
  assert.equal(formatTimeValue("17:00"), "5:00 PM");
  assert.equal(parseTimeValue(" 9:15 pm "), "21:15");
  for (const invalid of ["9:00", "17:00 PM", "0:00 AM", "9:60 AM", "noon"]) assert.equal(parseTimeValue(invalid), "");
});

test("dated labels include AM/PM and preserve the requested timezone", () => {
  const date = new Date("2026-10-25T14:00:00Z");
  assert.equal(formatTime(date, "America/Chicago"), "9:00 AM");
  assert.equal(formatTime(date, "UTC"), "2:00 PM");
  assert.match(formatDateTime(date, "America/Chicago"), /9:00 AM/);
});

test("each day opens checked with its saved sorted hours, without reusing a discarded draft", () => {
  const rules = [
    { weekday: 1, startMinutes: 540, endMinutes: 1020 },
    { weekday: 2, startMinutes: 780, endMinutes: 990 },
    { weekday: 2, startMinutes: 600, endMinutes: 720 }
  ];
  const monday = dayHoursDraft(rules, 1);
  assert.deepEqual(monday, { accepting: true, ranges: [{ start: "09:00", end: "17:00" }] });
  monday.ranges[0].start = "11:00";
  assert.equal(dayHoursDraft(rules, 1).ranges[0].start, "09:00");
  assert.deepEqual(dayHoursDraft(rules, 2).ranges, [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "16:30" }]);
  assert.equal(dayHoursDraft(rules, 0).accepting, false);
});
