import assert from "node:assert/strict";
import test from "node:test";
import { jazzrContentManifest, jazzrEditorManifest } from "../clients/jazzr/content-manifest";
import { resolveFeatured } from "../modules/content/studio/featured";
import { contentFieldId } from "../modules/content/studio/field-selection";
import { resolveMobilePayload } from "../modules/content/studio/mobile-overrides";
import { resolveStudioPayload, validateBlockUpdate } from "../modules/content/studio/state";
import { emptyPayload, payloadSchema } from "../modules/content/studio/registry";

test("Jazzr registers each public page with valid defaults and field bindings", () => {
  assert.deepEqual(jazzrContentManifest.pages.map(page => page.id), ["home", "portfolio", "about", "contact", "booking"]);
  for (const block of jazzrContentManifest.blocks) {
    assert.ok(payloadSchema(block.type).safeParse({ ...emptyPayload(block.type), ...block.defaults }).success, block.id);
    for (const binding of block.presentation?.bindings || []) {
      assert.equal(typeof binding.path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], block.defaults), "string", `${block.id}: ${binding.path}`);
    }
  }
});

test("Jazzr editorial homepage omits retired sections and registers booking and footer copy", () => {
  const ids = jazzrContentManifest.blocks.map(block => block.id);
  assert.ok(!ids.includes("home-service-categories"));
  assert.ok(!ids.includes("home-service-areas"));
  assert.ok(ids.includes("home-inquiry"));
  assert.ok(ids.includes("site-service-areas"));
  const footer = jazzrContentManifest.blocks.find(block => block.id === "site-footer")!;
  assert.ok(footer.presentation!.bindings!.every(binding => !binding.selector.includes("address:nth-child") && !binding.selector.startsWith(".site-footer > a:nth-child")));
});


test("Jazzr sessions are independently selectable and accept only approved layouts", () => {
  const sessions = jazzrContentManifest.blocks.filter(block => block.id.startsWith("home-session-"));
  assert.deepEqual(sessions.map(block => block.presentation?.selector), ["#featured-session-1", "#featured-session-2"]);
  for (const block of sessions) {
    const items = block.defaults!.items as Record<string, unknown>[];
    for (const layout of ["full", "split", ""]) {
      const payload = { ...block.defaults, items: [{ ...items[0], layout }] };
      assert.ok(payloadSchema("featured").safeParse(payload).success);
      assert.equal(resolveFeatured(payload.items[0], { id: "portrait", name: "Portrait" }).layout, layout);
    }
    assert.equal(payloadSchema("featured").safeParse({ ...block.defaults, items: [{ ...items[0], layout: "unapproved" }] }).success, false);
    assert.equal(contentFieldId(block.id, block.defaults!, "items.0.title", ["items"]), `${block.id}-items-${items[0].id}-title`);
  }
});

test("legacy Jazzr headers and grouped sessions retain photos, copy, links and mobile overrides", () => {
  const legacyHeader = { images: [{ id: "photo", url: "/saved.jpg", alt: "Saved alt", imageZoom: 2 }], texts: [{ id: "title", text: "Saved title" }, { id: "caption", text: "Saved caption" }], links: [{ id: "book", label: "Book", href: "/booking.html" }], mobileOverrides: [{ path: ["texts", "title", "text"], value: "Mobile title" }] };
  const legacySessions = { items: [{ id: "session-1", referenceId: "portrait", imageUrl: "/first.jpg" }, { id: "session-2", referenceId: "creative", title: "Creative", imageUrl: "/second.jpg", layout: "full" }], mobileOverrides: [{ path: ["items", "session-2", "layout"], value: "split" }] };
  const config = { studio: { blocks: { "home-header-photo": { payload: legacyHeader }, "home-featured-sessions": { payload: legacySessions } } } };
  const before = structuredClone(config);
  const manifest = jazzrEditorManifest(config);
  const header = manifest.blocks.find(block => block.id === "home-header-photo")!;
  assert.equal(header.type, "slideshow");
  const slide = (header.defaults!.slides as Record<string, unknown>[])[0];
  assert.deepEqual([slide.imageUrl, slide.imageAlt, slide.imageZoom, slide.title, slide.caption, slide.buttonHref], ["/saved.jpg", "Saved alt", 2, "Saved title", "Saved caption", "/booking.html"]);
  assert.equal((resolveMobilePayload(header.defaults!).slides as Record<string, unknown>[])[0].title, "Mobile title");
  const second = manifest.blocks.find(block => block.id === "home-session-2")!;
  assert.equal((second.defaults!.items as Record<string, unknown>[])[0].referenceId, "creative");
  assert.equal((resolveMobilePayload(second.defaults!).items as Record<string, unknown>[])[0].layout, "split");
  assert.deepEqual(config, before);
  for (const block of [header, second]) assert.ok(payloadSchema(block.type).safeParse({ ...emptyPayload(block.type), ...block.defaults }).success);
  const saved = { schemaVersion: 1 as const, revision: 4, payload: { slides: [{ ...slide, title: "New saved title" }] }, pageIds: ["home"], updatedAt: "", updatedBy: "" };
  assert.equal(resolveStudioPayload(header, saved), saved.payload);
  const baseline = { ...saved, payload: header.defaults! };
  assert.doesNotThrow(() => validateBlockUpdate(header, baseline, { id: header.id, revision: 4, pageIds: ["home"], payload: { slides: [slide] } }));
});
