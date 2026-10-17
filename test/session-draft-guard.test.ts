import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("session drafts warn on changed fields and package JSON, but allow unchanged and new-tab navigation", () => {
  class Element { closest() { return this; } }
  class Anchor extends Element {
    target = "";
    constructor(public href: string) { super(); }
    hasAttribute() { return false; }
  }
  class Form {
    entries = [["name", "Portraits"], ["sessionOffering", "original"], ["$ACTION_KEY", "first"]];
    contains(value: unknown) { return value === "photo-button"; }
  }
  const form = new Form();
  const listeners = new Map<string, (value: ReturnType<typeof event>) => void>();
  let cleanup: (() => void) | undefined;
  let prompts = 0;
  let discard = false;
  const events = {
    addEventListener: (name: string, callback: (value: ReturnType<typeof event>) => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name)
  };
  const exports: { SessionDraftGuard?: (props: { formId: string }) => null; revealInvalidSessionField?: (event: unknown) => void } = {};
  class Details { open = false; constructor(public parentElement: unknown) {} }
  const code = ts.transpileModule(readFileSync("modules/scheduling/components/session-draft-guard.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  runInNewContext(code, {
    exports, Element, HTMLAnchorElement: Anchor, HTMLFormElement: Form, HTMLDetailsElement: Details, URL,
    FormData: class { [Symbol.iterator]() { return form.entries[Symbol.iterator](); } },
    location: new URL("https://example.test/admin/modules/services/portrait"),
    window: { ...events, confirm: () => { prompts++; return discard; } },
    document: { ...events, getElementById: () => form },
    require: (id: string) => id === "react" ? { useState: () => [false, () => {}], useRef: () => ({ current: null }), useEffect: (effect: () => (() => void) | undefined) => { const result = effect(); if (result) cleanup = result; } } : id === "react/jsx-runtime" ? {} : { useFormStatus: () => ({ pending: false }) }
  });
  exports.SessionDraftGuard!({ formId: "service-core-form" });
  function event(href = "https://example.test/admin/modules/services") {
    return { target: new Anchor(href) as unknown, submitter: null as unknown, button: 0, ctrlKey: false, prevented: false, stopped: false, returnValue: undefined as string | undefined,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  }
  const unchanged = event();
  listeners.get("click")!(unchanged);
  assert.equal(unchanged.prevented, false);
  form.entries[2][1] = "changed-action-key";
  listeners.get("click")!(event());
  assert.equal(prompts, 0, "React action metadata is not a user edit");
  form.entries[1][1] = "changed-package";
  const canceled = event();
  listeners.get("click")!(canceled);
  assert.ok(canceled.prevented && canceled.stopped);
  assert.equal(form.entries[1][1], "changed-package", "canceling departure keeps the draft");
  const localAnchor = event("https://example.test/admin/modules/services/portrait#packages");
  listeners.get("click")!(localAnchor);
  const newTab = event(); newTab.ctrlKey = true;
  listeners.get("click")!(newTab);
  assert.equal(prompts, 1, "same-page anchors and new-tab links do not abandon the draft");
  const unload = event();
  listeners.get("beforeunload")!(unload);
  assert.ok(unload.prevented);
  assert.equal(unload.returnValue, "");
  const photo = event(); photo.target = new Form(); photo.submitter = "photo-button";
  listeners.get("submit")!(photo);
  assert.ok(photo.prevented && photo.stopped, "photo actions cannot silently discard unsaved packages");
  const save = event(); save.target = form; save.submitter = "photo-button";
  listeners.get("submit")!(save);
  assert.equal(save.prevented, false, "normal session saves remain available");
  const unrelated = event(); unrelated.target = new Form();
  listeners.get("submit")!(unrelated);
  assert.equal(unrelated.prevented, false, "unrelated forms are unaffected");
  discard = true;
  const accepted = event();
  listeners.get("click")!(accepted);
  assert.equal(accepted.prevented, false);
  form.entries[1][1] = "original";
  const restored = event();
  listeners.get("beforeunload")!(restored);
  assert.equal(restored.prevented, false, "restoring the original values is no longer dirty");
  cleanup!();
  assert.equal(listeners.size, 0);
  const outer = new Details(form);
  const inner = new Details(outer);
  exports.revealInvalidSessionField!({ target: { parentElement: { parentElement: inner } }, currentTarget: form });
  assert.ok(inner.open && outer.open, "native validation reveals every closed section around the invalid field");
});
