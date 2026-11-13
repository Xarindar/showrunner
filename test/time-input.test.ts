import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement, useState } from "react";
import { TimeInput } from "../components/ui/time-input";

test("time entry starts at hours, advances through minutes and AM/PM, and supports Tab and pasted text", async () => {
  const window = new Window();
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host as unknown as HTMLElement);
  function ControlledTime() {
    const [value, setValue] = useState("09:15");
    return createElement(TimeInput, { name: "time", value, onValueChange: setValue });
  }
  try {
    await act(async () => { root.render(createElement(ControlledTime)); });
    const input = host.querySelectorAll("input")[1]!;
    const stored = () => host.querySelector('input[type="hidden"]')!.getAttribute("value");
    const selected = () => input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
    const key = async (key: string, shiftKey = false) => {
      const event = new window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
      await act(async () => { input.dispatchEvent(event); });
      return event.defaultPrevented;
    };
    await act(async () => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); input.click(); });
    assert.equal(selected(), "9");
    await key("1");
    assert.equal(selected(), "1");
    await key("2");
    assert.equal(selected(), "15");
    await key("3"); await key("0");
    assert.equal(selected(), "AM");
    await key("p"); await key("m");
    assert.equal(input.value, "12:30 PM");
    assert.equal(stored(), "12:30");
    assert.equal(await key("Tab"), false, "Tab leaves the last segment");
    assert.equal(await key("Tab", true), true);
    assert.equal(selected(), "30");
    await key("Tab", true);
    assert.equal(selected(), "12");
    assert.equal(await key("Tab", true), false, "Shift-Tab leaves the first segment");
    await key("9");
    assert.equal(selected(), "30", "A single unambiguous hour advances immediately");
    await key("0"); await key("5"); await key("a");
    assert.equal(input.value, "9:05 AM");
    assert.equal(stored(), "09:05");
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "11:45 PM");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(stored(), "23:45");
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, original);
    await window.happyDOM.close();
  }
});
