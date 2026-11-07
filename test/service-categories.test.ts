import assert from "node:assert/strict";
import test from "node:test";
import { jazzrContentManifest } from "../clients/jazzr/content-manifest";
import { emptyPayload, payloadSchema } from "../modules/content/studio/registry";
import { configuredBlock, validateManifest } from "../modules/content/studio/manifest";
import { resolveServiceCategories, validateServiceCategories } from "../modules/content/studio/service-categories";
import { validateBlockUpdate } from "../modules/content/studio/state";

const choices = [{ id: "weddings", label: "Weddings", imageUrl: "/wedding.jpg", description: "Wedding photography" }, { id: "families", label: "Families" }];
const rows = [{ id: "row-1", categoryId: "weddings" }];

test("categories inherit current catalog content and omit removed selections", () => {
  const resolved = resolveServiceCategories([...rows, { id: "missing", categoryId: "deleted" }], choices);
  assert.deepEqual(resolved, [{ ...rows[0], name: "Weddings", description: "Wedding photography", imageUrl: "/wedding.jpg" }]);
  assert.deepEqual(resolveServiceCategories([], choices), []);
  assert.equal(resolveServiceCategories(rows, [{ ...choices[0], label: "New name" }])[0].name, "New name");
});

test("category selection rejects duplicates, cross-site and removed references", () => {
  assert.doesNotThrow(() => validateServiceCategories(rows, choices));
  assert.doesNotThrow(() => validateServiceCategories([], choices));
  assert.throws(() => validateServiceCategories([...rows, { ...rows[0], id: "row-2" }], choices), /only once/);
  assert.throws(() => validateServiceCategories(rows, []), /unavailable for this site/);
});

test("category sections allow removable catalog selections and enforce strict fields", () => {
  const block = configuredBlock("test-categories", "serviceCategories", ["home"], { source: "categories", presentation: { selector: "#photography-categories" } });
  assert.equal(block.presentation?.selector, "#photography-categories");
  assert.equal(payloadSchema("serviceCategories").safeParse({ ...emptyPayload("serviceCategories"), items: rows }).success, true);
  assert.equal(payloadSchema("serviceCategories").safeParse({ heading: "Title", items: [{ ...rows[0], name: "Spoofed" }] }).success, false);
  assert.doesNotThrow(() => validateBlockUpdate(block, undefined, { id: block.id, revision: 0, pageIds: ["home"], payload: { heading: "Sessions", items: [] } }));
  assert.throws(() => validateManifest({ ...jazzrContentManifest, blocks: [{ ...block, source: "services" }] }), /category source/);
});
