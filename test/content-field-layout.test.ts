import assert from "node:assert/strict";
import test from "node:test";
import { contentLinkOptions, destinationKind, editorPageDestination, imageFirst } from "../modules/content/studio/field-layout";
import { blockRegistry, emptyFields, payloadSchema } from "../modules/content/studio/registry";
import { configuredBlock } from "../modules/content/studio/manifest";
import { resolveStudioPayload, validateBlockUpdate, type StoredBlock } from "../modules/content/studio/state";
import { cottageContentManifest } from "../clients/content-manifests";

test("settings put each item's image first and keep every template binding in a visual group", () => {
  assert.deepEqual(imageFirst(blockRegistry.team.fields.items.fields!).slice(0, 2).map(([key]) => key), ["imageUrl", "name"]);
  for (const block of cottageContentManifest.blocks.filter(block => block.type === "strip")) {
    const paths = block.editorGroups!.flatMap(group => group.fields.map(field => field.path));
    assert.equal(paths.length, new Set(paths).size);
    for (const binding of block.presentation!.bindings!) {
      const path = /^(images|links)\./.test(binding.path) ? binding.path.split(".").slice(0, 2).join(".") : binding.path;
      assert.ok(paths.includes(path), `${block.id}: ${path}`);
    }
  }
});

test("service buttons use slugs and route to the matching booking profile", () => {
  const options = contentLinkOptions(cottageContentManifest, [{ id: "private-id", slug: "head-spa", label: "Head spa", category: "The-Hive" }]);
  assert.equal(destinationKind("https://", options), "url");
  assert.equal(destinationKind("http://[", options), "url");
  assert.equal(options.services[0].href, "/booking.html?service=head-spa&next=1&profile=the-hive");
});

test("header slides can be appended while section targeting, row order, and minimum stay protected", () => {
  const first = { id: "slide-1", ...emptyFields(blockRegistry.slideshow.fields.slides.fields!) };
  const block = configuredBlock("home-hero", "slideshow", ["home"], { defaults: { slides: [first] }, minimums: { slides: 1 } });
  const legacy: StoredBlock = { schemaVersion: 1, revision: 2, payload: { texts: [] }, pageIds: ["home"], updatedAt: "", updatedBy: "" };
  const current = { ...legacy, payload: resolveStudioPayload(block, legacy) };
  const slides = [first, { ...first, id: "slide-2" }];
  const request = { id: block.id, revision: 2, pageIds: ["home"], payload: { slides } };
  assert.doesNotThrow(() => validateBlockUpdate(block, current, request));
  assert.throws(() => validateBlockUpdate(block, current, { ...request, pageIds: ["hive"] }), /not allowed/);
  assert.throws(() => validateBlockUpdate(block, current, { ...request, payload: { slides: [] } }), /at least/);
  assert.throws(() => validateBlockUpdate(block, { ...current, payload: { slides } }, { ...request, payload: { slides: [...slides].reverse() } }), /ordering/);
});

test("client controls omit technical metadata while preserving stored accessibility text", () => {
  for (const fields of [blockRegistry.strip.fields.images.fields!, blockRegistry.slideshow.fields.slides.fields!, blockRegistry.team.fields.items.fields!, blockRegistry.contact.fields]) {
    assert.ok(!imageFirst(fields).some(([key]) => ["alt", "imageAlt", "locationId"].includes(key)));
  }
  const payload = { ...emptyFields(blockRegistry.slideshow.fields.slides.fields!), imageAlt: "A garden ceremony" };
  const parsed = payloadSchema("slideshow").parse({ slides: [{ id: "slide-1", ...payload }] }) as { slides: { imageAlt: string }[] };
  assert.equal(parsed.slides[0].imageAlt, "A garden ceremony");
});

test("canvas navigation resolves only installed site pages and preserves anchors and booking context", () => {
  const pages = cottageContentManifest.pages;
  const base = "https://site.example/index.html?showrunner-editor=1";
  assert.deepEqual(editorPageDestination("the-hive.html#treatments", base, pages), { pageId: "hive", href: "https://site.example/the-hive.html#treatments" });
  assert.deepEqual(editorPageDestination("/", base, pages), { pageId: "home", href: "https://site.example/" });
  assert.deepEqual(editorPageDestination("booking.html?profile=the-hive&showrunner-editor=1", base, pages), { pageId: "booking", href: "https://site.example/booking.html?profile=the-hive" });
  for (const href of ["https://elsewhere.example/the-hive.html", "javascript:alert(1)", "/not-installed.html", "https://"]) assert.equal(editorPageDestination(href, base, pages), null);
});
