import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("showcase renderer uses safe semantic cards and selection scrolls once", async () => {
  class Node {
    children: Node[] = [];
    dataset: Record<string, string> = {};
    textContent = "";
    className = "";
    href = "";
    src = "";
    alt = "";
    loading = "";
    tabIndex = -1;
    scrolls = 0;
    constructor(public tag: string) {}
    append(...nodes: Node[]) { this.children.push(...nodes); }
    replaceChildren(...nodes: Node[]) { this.children = nodes; }
    setAttribute() {}
    scrollIntoView() { this.scrolls++; }
  }
  const host = new Node("section");
  const listeners: Record<string, (event: unknown) => Promise<void>> = {};
  const parent = { postMessage() {} };
  const window = { parent, addEventListener(name: string, callback: typeof listeners[string]) { listeners[name] = callback; }, dispatchEvent() {} };
  const document = {
    readyState: "complete", currentScript: { dataset: { editorOrigins: "https://editor.example" } },
    head: { append() {} }, createElement: (tag: string) => new Node(tag), createDocumentFragment: () => new Node("fragment"),
    addEventListener() {}, querySelectorAll: (selector: string) => selector === ".showcase" ? [host] : [],
  };
  runInNewContext(readFileSync("public/showrunner-content.js", "utf8"), { window, document, parent, URL, URLSearchParams, CustomEvent, Intl, location: { href: "https://site.example/", search: "?showrunner-editor=1" } });
  const message = { source: parent, origin: "https://editor.example", data: { channel: "showrunner-editor-v1", type: "connect" } };
  await listeners.message(message);
  const card = { name: "<script>safe text</script>", description: "Catalog description", imageUrl: "javascript:alert(1)", kind: "product", priceCents: 2500, currency: "USD", available: false, ctaHref: "/shop.html", ctaLabel: "View product", variant: "compact" };
  const blocks = [{ id: "menu", type: "showcase", presentation: { selector: ".showcase" }, payload: { heading: "Menu", items: [card] } }];
  const update = { ...message, data: { channel: "showrunner-editor-v1", type: "update", blocks, selectedId: "menu" } };
  await listeners.message(update);
  assert.equal(host.scrolls, 1);
  const article = host.children[0].children[1].children[0];
  assert.equal(article.tag, "article");
  assert.equal(article.dataset.variant, "compact");
  assert.equal(article.children[0].src, "");
  assert.equal(article.children[1].textContent, card.name);
  assert.ok(article.children.some(node => node.textContent === "$25.00"));
  assert.ok(!article.children.some(node => node.tag === "a"));
  await listeners.message(update);
  assert.equal(host.scrolls, 1, "typing drafts must not reset canvas scroll");
  card.available = true;
  card.ctaHref = "javascript:alert(1)";
  await listeners.message(update);
  assert.ok(!host.children[0].children[1].children[0].children.some(node => node.tag === "a"));
  card.ctaHref = "/shop.html?product=kit";
  await listeners.message(update);
  assert.equal(host.children[0].children[1].children[0].children.at(-1)?.href, "https://site.example/shop.html?product=kit");
});

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
  window.showrunnerContentReady = Promise.reject(new Error("Public content offline"));
  await listeners.message(connect);
  assert.equal(messages.length, 2, "draft editing can connect even when published content fails to load");
});

test("preview clicks keep menus interactive, route navigation to the editor, and select content", async () => {
  const listeners: Record<string, (event: unknown) => Promise<void>> = {};
  const clicks: Record<string, (event: unknown) => void> = {};
  const messages: { type: string; href?: string; id?: string }[] = [];
  const parent = { postMessage: (message: typeof messages[number]) => messages.push(message) };
  class Element {
    constructor(public matchesBySelector: Record<string, unknown>) {}
    closest(selector: string) { return this.matchesBySelector[selector]; }
  }
  const document = {
    readyState: "complete", currentScript: { dataset: { editorOrigins: "https://editor.example" } },
    head: { append() {} }, createElement: () => ({}),
    addEventListener(name: string, callback: (event: unknown) => void) { clicks[name] = callback; },
    getElementById: () => ({ matches: () => true }),
  };
  const window = { parent, addEventListener(name: string, callback: (event: unknown) => Promise<void>) { listeners[name] = callback; } };
  runInNewContext(readFileSync("public/showrunner-content.js", "utf8"), {
    window, document, parent, Element, URL, URLSearchParams,
    location: { href: "https://site.example/index.html?showrunner-editor=1", pathname: "/index.html", search: "?showrunner-editor=1", origin: "https://site.example" },
  });
  await listeners.message({ source: parent, origin: "https://editor.example", data: { channel: "showrunner-editor-v1", type: "connect" } });
  function click(matches: Record<string, unknown>) {
    const event = { target: new Element(matches), prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    clicks.click(event);
    return event;
  }
  const section = { dataset: { srSection: "hero" } };
  assert.equal(click({ "[data-sr-section]": section, button: { getAttribute: () => "site-nav" } }).prevented, false);
  const navigation = { 'nav,[role="navigation"]': {} };
  assert.equal(click({ ...navigation, "a[href]": { href: "https://site.example/index.html?showrunner-editor=1#team" } }).prevented, false);
  assert.equal(click({ ...navigation, "a[href]": { href: "https://site.example/the-hive.html" } }).prevented, true);
  assert.equal(messages.at(-1)?.type, "navigate");
  assert.equal(messages.at(-1)?.href, "https://site.example/the-hive.html");
  assert.equal(click({ "[data-sr-section]": section, "a[href]": { href: "/booking.html" } }).stopped, true);
  assert.equal(messages.at(-1)?.id, "hero");
  const submit = { prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  clicks.submit(submit);
  assert.equal(submit.prevented, true);
});
