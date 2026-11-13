import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement, forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("calendar search expands, debounces live queries and clears when closed", async () => {
  const window = new Window({ url: "http://localhost/admin/modules/appointments?date=2026-11-12&view=week&resourceId=room" });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const require = createRequire(import.meta.url);
  const replacements: string[] = [];
  const router = { replace: (href: string) => replacements.push(href) };
  const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function TestButton(props, ref) { return createElement("button", { ...props, ref }); });
  const mocks: Record<string, unknown> = {
    "next/navigation": { useRouter: () => router },
    "@/components/ui/button": { Button, ButtonLink: ({ children, href }: {children: ReactNode; href: string}) => createElement("a", {href}, children) },
    "@/components/ui/tabs": { Tabs: ({children}: {children: ReactNode}) => createElement("div", null, children), Tab: Button },
    "@/components/ui/modal": { Modal: () => null }, "@/components/ui/notifications": { Notification: () => null }
  };
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  runInNewContext(ts.transpileModule(readFileSync("modules/appointments/components/appointment-calendar-shell.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, window, setTimeout, clearTimeout, URL, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host as unknown as HTMLElement);
  try {
    await act(async () => { root.render(createElement(exports.AppointmentCalendarShell, { searchQuery: "", view: "week", waitlistCount: 4 })); });
    assert.equal(host.querySelector('input[type="search"]'), null);
    await act(async () => { host.querySelector('button[aria-label="Search appointments"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    const input = host.querySelectorAll("input")[1]!;
    assert.equal(host.querySelector('button[aria-label="Search appointments"]'), null, "Search becomes a field rather than revealing a second control");
    assert.equal(window.document.activeElement, input);
    const type = async (text: string) => { await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    }); };
    await type("Rub"); await type("Ruby");
    assert.equal(replacements.length, 0);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
    assert.equal(replacements.length, 1);
    const url = new URL(replacements[0], "http://localhost");
    assert.equal(url.searchParams.get("q"), "Ruby");
    assert.equal(url.searchParams.get("view"), "week");
    assert.equal(url.searchParams.get("resourceId"), "room");
    await act(async () => { host.querySelector('button[aria-label="Close search"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.equal(host.querySelector('input[type="search"]'), null);
    assert.equal(new URL(replacements.at(-1)!, "http://localhost").searchParams.has("q"), false);
    assert.equal(window.document.activeElement?.getAttribute("aria-label"), "Search appointments");
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, original);
    await window.happyDOM.close();
  }
});
