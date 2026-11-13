import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { LocationInput } from "../components/ui/location-input";

test("location combobox supports keyboard selection, dismissal, pointer selection and manual addresses", async () => {
  const window = new Window({ url: "http://localhost" });
  Object.assign(window.HTMLElement.prototype, { showPopover() {} });
  let results = ["Chicago, Illinois", "Chicago Heights, Illinois"];
  let fail = false;
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, getComputedStyle: globalThis.getComputedStyle, ResizeObserver: globalThis.ResizeObserver };
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver: window.ResizeObserver,
    fetch: async () => { if (fail) throw new Error("Offline"); return { ok: true, json: async () => ({ suggestions: results }) }; } });
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host as unknown as HTMLElement);
  try {
    await act(async () => { root.render(createElement(LocationInput, { id: "location", name: "location" })); });
    const input = host.querySelector("input")!;
    const type = async (value: string, wait = true) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      if (wait) await act(async () => { await new Promise(resolve => setTimeout(resolve, 480)); });
    };
    const key = async (key: string) => { await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true })); }); };
    await type("C", false);
    assert.match(host.textContent!, /Type at least 3 characters/);
    await type("Chi", false);
    assert.match(host.textContent!, /Searching addresses/);
    assert.equal(host.querySelector('[role="listbox"]')!.getAttribute("popover"), "manual");
    await type("Chicago");
    assert.equal(host.querySelectorAll('[role="option"]').length, 2);
    assert.equal(host.querySelector("datalist"), null);
    await key("ArrowDown");
    assert.equal(input.getAttribute("aria-activedescendant"), host.querySelector('[role="option"]')!.id);
    await key("Enter");
    assert.equal(input.value, "Chicago, Illinois");
    assert.equal(input.getAttribute("aria-expanded"), "false");
    await type("Chicago");
    await key("Escape");
    assert.equal(host.querySelector('[role="listbox"]'), null);
    await key("ArrowUp");
    await key("Enter");
    assert.equal(input.value, "Chicago Heights, Illinois");
    await type("Chicago");
    await act(async () => { host.querySelector("button")!.click(); });
    assert.equal(input.value, "Chicago, Illinois");
    await type("My private studio");
    await key("Tab");
    assert.equal(input.value, "My private studio");
    await act(async () => { input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })); });
    assert.equal(input.getAttribute("aria-expanded"), "false");
    results = [];
    await type("Nowhere");
    assert.match(host.textContent!, /No matches found/);
    fail = true;
    await type("My studio");
    assert.match(host.textContent!, /Suggestions unavailable/);
    assert.equal(input.value, "My studio");
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, original);
    await window.happyDOM.close();
  }
});
