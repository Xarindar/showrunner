import assert from "node:assert/strict";
import test from "node:test";
import { contentLinkOptions, imageFirst } from "../modules/content/studio/field-layout";
import { blockRegistry, emptyFields } from "../modules/content/studio/registry";
import { configuredBlock } from "../modules/content/studio/manifest";
import { resolveStudioPayload, validateBlockUpdate, type StoredBlock } from "../modules/content/studio/state";
import { cottageContentManifest } from "../clients/content-manifests";

test("settings put each item's image first and keep every template binding in a visual group", () => {
  assert.deepEqual(imageFirst(blockRegistry.team.fields.items.fields!).slice(0, 2).map(([key]) => key), ["imageUrl", "imageAlt"]);
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
