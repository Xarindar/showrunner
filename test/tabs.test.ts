import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { Tab, Tabs } from "../components/ui/tabs";

test("tab indicator follows the selected tab and variable widths after resize", async () => {
  const window = new Window();
  const original = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  let resize = () => {}, disconnected = 0;
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() { disconnected++; } } });
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host as unknown as HTMLElement);
  const render = async (selected: string) => { await act(async () => {
    root.render(createElement(Tabs, null, ["Day", "Week", "Month"].map(label => createElement(Tab, { key: label, "aria-selected": selected === label }, label))));
  }); };
  try {
    await render("Day");
    const positions = [2, 50, 112], widths = [48, 62, 70];
    host.querySelectorAll("button").forEach((tab, index) => {
      Object.defineProperties(tab, { offsetLeft: { get: () => positions[index] }, offsetTop: { value: 2 }, offsetWidth: { get: () => widths[index] }, offsetHeight: { value: 28 } });
    });
    resize();
    const indicator = host.querySelector("span")!;
    assert.equal(indicator.style.transform, "translateX(2px)");
    await render("Month");
    assert.equal(indicator.style.transform, "translateX(112px)");
    assert.equal(indicator.style.width, "70px");
    positions[2] = 125; widths[2] = 80; resize();
    assert.equal(indicator.style.transform, "translateX(125px)");
    assert.equal(indicator.style.width, "80px");
    assert.equal(indicator.getAttribute("aria-hidden"), "true");
  } finally {
    await act(async () => { root.unmount(); });
    assert(disconnected > 0);
    Object.assign(globalThis, original);
    await window.happyDOM.close();
  }
});
