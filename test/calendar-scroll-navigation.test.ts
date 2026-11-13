import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { bindCalendarScrollNavigation } from "../modules/appointments/components/calendar-scroll-navigation";

test("mobile edge scrolling changes periods once and preserves the range link filters", () => {
  const window = new Window();
  const original = { window: globalThis.window, Element: globalThis.Element };
  Object.assign(globalThis, { window, Element: window.Element });
  Object.defineProperty(window, "innerWidth", { value: 390, writable: true });
  const originalNow = Date.now;
  let now = 5000;
  Date.now = () => now;
  window.document.body.innerHTML = '<div id="root"><a aria-label="Previous range" href="/calendar?date=2026-11-01&view=week&q=Ruby"></a><a aria-label="Next range" href="/calendar?date=2026-11-15&view=week&q=Ruby"></a><div class="appointment-day-overview" data-view="week"></div></div>';
  const root = window.document.querySelector("#root")!;
  const scroller = root.querySelector(".appointment-day-overview")!;
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 400 } });
  const destinations: string[] = [];
  const cleanup = bindCalendarScrollNavigation(root as unknown as HTMLElement, href => destinations.push(href));
  const wheel = (deltaY: number) => scroller.dispatchEvent(new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }));
  try {
    scroller.scrollTop = 100;
    wheel(100);
    scroller.scrollTop = 200;
    now += 50;
    wheel(100);
    assert.equal(destinations.length, 0, "Reaching the bottom mid-gesture should not change the week");
    now += 300;
    wheel(40);
    assert.equal(destinations.length, 0);
    now += 20;
    wheel(40);
    assert.deepEqual(destinations, ["/calendar?date=2026-11-15&view=week&q=Ruby"]);
    wheel(100);
    assert.equal(destinations.length, 1, "Momentum must not navigate repeatedly");
    cleanup();
    const remountCleanup = bindCalendarScrollNavigation(root as unknown as HTMLElement, href => destinations.push(href));
    now += 250;
    wheel(100);
    assert.equal(destinations.length, 1, "The guard survives a calendar remount");
    now += 1300;
    wheel(100);
    assert.equal(destinations.length, 2, "A later gesture can navigate again");
    remountCleanup();
  } finally {
    cleanup();
    Date.now = originalNow;
    Object.assign(globalThis, original);
  }
});

test("day swipe at the top opens the previous day and desktop keeps normal scrolling", () => {
  const window = new Window();
  const original = { window: globalThis.window, Element: globalThis.Element };
  Object.assign(globalThis, { window, Element: window.Element });
  Object.defineProperty(window, "innerWidth", { value: 390, writable: true });
  window.document.body.innerHTML = '<div id="root"><a aria-label="Previous range" href="/calendar?date=2026-11-11&view=day"></a><div class="fc-timegrid"><div class="fc-scroller"></div></div></div>';
  const root = window.document.querySelector("#root")!;
  const scroller = root.querySelector(".fc-scroller")!;
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 400 } });
  const destinations: string[] = [];
  const cleanup = bindCalendarScrollNavigation(root as unknown as HTMLElement, href => destinations.push(href));
  const touch = (type: string, y: number) => {
    const event = new window.Event(type, { bubbles: true });
    Object.assign(event, { touches: [{clientX: 100, clientY: y}], changedTouches: [{clientX: 100, clientY: y}] });
    scroller.dispatchEvent(event);
  };
  try {
    Object.assign(window, { innerWidth: 1024 });
    scroller.dispatchEvent(new window.WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    assert.equal(destinations.length, 0);
    Object.assign(window, { innerWidth: 390 });
    scroller.scrollTop = 100;
    touch("touchstart", 100); touch("touchend", 220);
    assert.equal(destinations.length, 0, "Swipes within the day scroll its hours");
    scroller.scrollTop = 0;
    touch("touchstart", 100); touch("touchend", 220);
    assert.deepEqual(destinations, ["/calendar?date=2026-11-11&view=day"]);
  } finally {
    cleanup();
    Object.assign(globalThis, original);
  }
});
