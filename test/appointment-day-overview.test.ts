import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentDayOverview } from "../modules/appointments/components/appointment-day-overview";

test("mobile calendar counts appointments by day and opens the chosen date", () => {
  const days = Array.from({ length: 100 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 20 + index));
    const dateKey = date.toISOString().slice(0, 10);
    return { dateKey, dayNumber: String(date.getUTCDate()), label: dateKey, shortLabel: dateKey, isToday: dateKey === "2026-11-12", isOutsideMonth: false };
  });
  let selected = "";
  const props = { days, selectedDateKey: "2026-11-12", bookings: [{dateKey: "2026-11-12"}, {dateKey: "2026-11-12"}, {dateKey: "2026-11-14"}, {dateKey: "2026-11-15"}], onSelect: (date: string) => { selected = date; } };
  const week = AppointmentDayOverview({ ...props, view: "week" });
  const buttons = week.props.children[1].props.children;
  assert.equal(buttons.length, 7);
  assert.match(buttons[0].props["aria-label"], /^2026-11-08, 0 appointments/);
  assert.match(buttons[4].props["aria-label"], /^2026-11-12, 2 appointments/);
  assert.match(buttons[6].props["aria-label"], /^2026-11-14, 1 appointment\./);
  assert.equal(buttons[4].props["aria-current"], "date");
  assert.equal(buttons[3].props["aria-current"], undefined);
  buttons[4].props.onClick();
  assert.equal(selected, "2026-11-12");
  const month = AppointmentDayOverview({ ...props, view: "month", selectedDateKey: "2026-12-01" });
  const monthButtons = month.props.children[1].props.children;
  assert.equal(monthButtons.length, 31);
  assert.equal(monthButtons[0].props.children[1], null, "Empty month cells have no count placeholder");
  const november = AppointmentDayOverview({ ...props, view: "month" }).props.children[1].props.children;
  assert.equal(november[11].props.children[1].props.children, 2);
  assert.equal(month.props.children[2].props.children[1].props.selectedDateKey, "2027-01-01");
  assert.equal(month.props.children[2].props.children[1].props.preview, true);
  assert.equal(monthButtons[0].props.style.gridColumnStart, 3);
  assert.match(monthButtons[0].props["aria-label"], /^2026-12-01/);
  assert.match(monthButtons.at(-1).props["aria-label"], /^2026-12-31/);
});
