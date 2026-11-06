import assert from "node:assert/strict";
import test from "node:test";
import { desktopPayload, mobileOverrides, updateMobileOverrides, resolveMobilePayload } from "../modules/content/studio/mobile-overrides";
import { configuredBlock } from "../modules/content/studio/manifest";
import { emptyPayload } from "../modules/content/studio/registry";
import { validateBlockUpdate, type StoredBlock } from "../modules/content/studio/state";

const base = { ...emptyPayload("slideshow"), slides: [{ id: "first", imageUrl: "/desktop.jpg", imageAlt: "Photo", imagePositionX: 50, imagePositionY: 50, imageZoom: 1, title: "Desktop title", caption: "Shared caption", buttonLabel: "Book", buttonHref: "/booking" }] };
const block = configuredBlock("header", "slideshow", ["home"]);
const current: StoredBlock = { schemaVersion: 1, revision: 3, payload: base, pageIds: ["home"], updatedAt: "", updatedBy: "" };
const request = (payload: Record<string, unknown>) => ({ id: "header", revision: 3, pageIds: ["home"], payload });

test("mobile changes only changed leaves while desktop remains intact and other fields inherit", () => {
  const next = structuredClone(base);
  Object.assign(next.slides[0], { imageUrl: "/mobile.jpg", imagePositionY: 80, title: "Mobile title", buttonHref: "/mobile-booking" });
  const overrides = mobileOverrides(base, next);
  assert.equal(overrides.length, 6);
  assert(overrides.every(change => change.path[1] === "first"));
  const saved = validateBlockUpdate(block, current, request({ ...base, mobileOverrides: overrides })).payload;
  assert.deepEqual(desktopPayload(saved), base);
  assert.deepEqual(resolveMobilePayload(saved), next);
  const updated = { ...saved, slides: [{ ...base.slides[0], caption: "Updated shared caption", imageUrl: "/new-desktop.jpg" }] };
  const mobile = resolveMobilePayload(updated).slides as typeof base.slides;
  assert.equal(mobile[0].caption, "Updated shared caption");
  assert.equal(mobile[0].imageUrl, "/mobile.jpg");
  assert.deepEqual(resolveMobilePayload({ ...updated, mobileOverrides: [] }).slides, updated.slides);
});

test("overrides follow stable row IDs and never transfer to a replacement row", () => {
  const next = structuredClone(base); next.slides[0].title = "Mobile title";
  const overrides = mobileOverrides(base, next);
  const replacement = { ...base, slides: [{ ...base.slides[0], id: "replacement" }], mobileOverrides: overrides };
  assert.deepEqual(resolveMobilePayload(replacement).slides, replacement.slides);
});

test("mobile-only list edits retain desktop lists and obey fixed row and size rules", () => {
  const next = { ...base, slides: [...base.slides, { ...base.slides[0], id: "second" }] };
  const payload = { ...base, mobileOverrides: mobileOverrides(base, next) };
  assert.equal((validateBlockUpdate(block, current, request(payload)).payload.slides as unknown[]).length, 1);
  assert.equal((resolveMobilePayload(payload).slides as unknown[]).length, 2);
  assert.throws(() => validateBlockUpdate({ ...block, fixedRows: true }, current, request(payload)), /fixed/);
  assert.throws(() => validateBlockUpdate({ ...block, limits: { slides: 1 } }, current, request(payload)), /at most/);
});

test("mobile overrides preserve validation, locked fields, and stale revision protection", () => {
  const override = (path: string[], value: unknown) => request({ ...base, mobileOverrides: [{ path, value }] });
  assert.throws(() => validateBlockUpdate(block, current, override(["slides", "first", "buttonHref"], "javascript:alert(1)")), /safe/);
  assert.throws(() => validateBlockUpdate(block, current, override(["slides", "first", "imageZoom"], 99)));
  assert.throws(() => validateBlockUpdate(block, current, override(["slides", "first", "unknown"], "injected")));
  assert.throws(() => validateBlockUpdate(block, current, override(["__proto__", "polluted"], true)));
  assert.throws(() => validateBlockUpdate(block, current, override(["presentation"], {})), /locked/);
  assert.throws(() => validateBlockUpdate(block, current, { ...override(["slides", "first", "title"], "Mobile"), revision: 2 }), /another session/);
});

test("service photo overrides include optional source fields and resolve empty images", () => {
  const payload = { ...emptyPayload("featured"), items: [{ id: "service", referenceId: "service-1", imageUrl: "" }] };
  const next = { ...payload, items: [{ ...payload.items[0], imageSource: "custom", useServiceFraming: false, imageUrl: "/mobile.jpg" }] };
  const result = resolveMobilePayload({ ...payload, mobileOverrides: mobileOverrides(payload, next) });
  assert.deepEqual(result, next);
});

test("explicit overrides survive matching desktop values and unrelated later mobile edits", () => {
  const next = structuredClone(base); next.slides[0].title = "Mobile title";
  const saved = { ...next, mobileOverrides: mobileOverrides(base, next) };
  const edited = structuredClone(next); edited.slides[0].caption = "Mobile caption";
  const overrides = updateMobileOverrides(saved, edited);
  assert(overrides.some(change => change.path.at(-1) === "title"));
  const changedDesktop = { ...base, mobileOverrides: overrides };
  assert.equal((resolveMobilePayload(changedDesktop).slides as typeof base.slides)[0].title, "Mobile title");
});
