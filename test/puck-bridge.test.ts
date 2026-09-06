import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("website bridge authenticates the parent and limits preview updates to safe content", async () => {
  const listeners: Record<string, (event: unknown) => Promise<void>> = {};
  const messages: unknown[] = [];
  const parent = { postMessage: (message: unknown) => messages.push(message) };
  const section = { dataset: {} as Record<string, string>, tabIndex: -1, setAttribute() {} };
  const text = { textContent: "Before", style: {} };
  const link = { href: "", setAttribute(key: string, value: string) { this.href = value; } };
  const document = {
    readyState: "complete",
    currentScript: { dataset: { editorOrigins: "https://editor.example" }, src: "https://site.example/editor.js" },
    head: { append() {} }, createElement: () => ({}),
    addEventListener() {},
    querySelectorAll: (selector: string) => selector === ".copy" ? [text] : selector === ".link" ? [link] : selector === ".section" ? [section] : [],
  };
  const window = { parent, showrunnerContentReady: Promise.resolve(), addEventListener: (name: string, callback: (event: unknown) => Promise<void>) => { listeners[name] = callback; }, dispatchEvent() {} };
  runInNewContext(readFileSync("public/showrunner-content.js", "utf8"), {
    window, document, parent, URL, URLSearchParams, CustomEvent,
    location: { href: "https://site.example/", search: "?showrunner-editor=1", origin: "https://site.example" },
  });
  const connect = { source: parent, origin: "https://editor.example", data: { channel: "showrunner-editor-v1", type: "connect" } };
  await listeners.message({ ...connect, origin: "https://untrusted.example" });
  await listeners.message({ ...connect, source: {} });
  assert.equal(messages.length, 0);
  await listeners.message(connect);
  assert.equal(messages.length, 1);
  const update = { ...connect, data: { channel: "showrunner-editor-v1", type: "update", blocks: [{ id: "hero", payload: { copy: "After", href: "javascript:alert(1)" }, presentation: { selector: ".section", bindings: [{ path: "copy", selector: ".copy" }, { path: "href", selector: ".link", attribute: "href" }] } }] } };
  await listeners.message({ ...update, origin: "https://untrusted.example" });
  assert.equal(text.textContent, "Before");
  await listeners.message(update);
  assert.equal(text.textContent, "After");
  assert.equal(link.href, "");
  assert.equal(section.dataset.srSection, "hero");
});
