import assert from "node:assert/strict";
import test from "node:test";
import { jazzrContentManifest } from "../clients/jazzr/content-manifest";
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
