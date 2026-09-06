import assert from "node:assert/strict";
import test from "node:test";
import { blockRegistry, emptyPayload, isSafeContentUrl, payloadSchema } from "../modules/content/studio/registry";
import { configuredBlock, validateManifest } from "../modules/content/studio/manifest";
import { readStudio, validateBlockUpdate, type StoredBlock } from "../modules/content/studio/state";
import { resolveBusinessInfo, resolveBusinessLocation, validateBusinessInfo } from "../modules/content/studio/business-info";
import { cottageContentManifest, resolveContentManifest } from "../clients/content-manifests";
import { renderContentRichText } from "../modules/content/studio/rich-text";

const faq = configuredBlock("faq", "faq", ["home", "about"], { allowPageTargeting: true, limits: { items: 1 } });
test("all selected block payloads have strict reusable schemas", () => {
  for (const type of Object.keys(blockRegistry) as (keyof typeof blockRegistry)[]) {
    assert.equal(payloadSchema(type).safeParse(emptyPayload(type)).success, true, type);
    assert.equal(payloadSchema(type).safeParse({ ...emptyPayload(type), alignment: "left" }).success, false, type);
  }
});
test("locked fields cannot be submitted directly", () => {
  assert.throws(() => validateBlockUpdate({ ...faq, editableFields: ["heading"] }, undefined, { id: "faq", revision: 0, payload: { items: [] }, pageIds: ["home"] }), /locked/);
});
test("unapproved page targeting is rejected, empty is explicit", () => {
  assert.throws(() => validateBlockUpdate(faq, undefined, { id: "faq", revision: 0, payload: {}, pageIds: ["admin"] }), /not allowed/);
  assert.deepEqual(validateBlockUpdate(faq, undefined, { id: "faq", revision: 0, payload: {}, pageIds: [] }).pageIds, []);
});
test("targeting remains locked unless configured", () => {
  assert.throws(() => validateBlockUpdate({ ...faq, allowPageTargeting: false }, undefined, { id: "faq", revision: 0, payload: {}, pageIds: [] }), /locked/);
});
test("stale revisions cannot overwrite another session", () => {
  const current: StoredBlock = { schemaVersion: 1, revision: 2, payload: emptyPayload("faq"), pageIds: ["home"], updatedAt: "", updatedBy: "" };
  assert.throws(() => validateBlockUpdate(faq, current, { id: "faq", revision: 1, payload: {}, pageIds: ["home"] }), /another session/);
});
test("configured list limits and nested field allowlists are enforced", () => {
  const item = { id: "1", question: "Why?", answer: "Because." };
  assert.throws(() => validateBlockUpdate(faq, undefined, { id: "faq", revision: 0, payload: { items: [item, { ...item, id: "2" }] }, pageIds: [] }), /at most/);
  assert.equal(payloadSchema("faq").safeParse({ heading: "", items: [{ ...item, background: "red" }] }).success, false);
});
test("unsafe links and protocol-relative URLs are rejected", () => {
  for (const value of ["javascript:alert(1)", "//evil.test", "\\evil.test", "data:text/html,hi", "java\nscript:alert(1)"]) assert.equal(isSafeContentUrl(value), false, value);
  for (const value of ["/book", "booking.html", "https://example.com", "mailto:hello@example.com", "tel:+15551234567", ""]) assert.equal(isSafeContentUrl(value), true, value);
});
test("unconfigured sites do not receive Cottage editors", () => {
  assert.equal(resolveContentManifest("another-site", {}).legacyProfiles, undefined);
  assert.equal(resolveContentManifest("legacy-site", { profiles: { cottage616: {} } }).legacyProfiles, true);
});
test("second deployment can compose different editors without shared code changes", () => {
  const manifest = validateManifest({ version: 1, id: "second", pages: [{ id: "home", path: "/", label: "Home" }, { id: "about", path: "/about", label: "About" }], blocks: [faq, configuredBlock("our-story", "about", ["about"], { label: "Our story", editableFields: ["heading", "copy"], presentation: { variant: "narrow" } })] });
  assert.equal(manifest.blocks[1].label, "Our story");
  assert.throws(() => validateManifest({ ...manifest, blocks: [...manifest.blocks, faq] }), /duplicate/);
  assert.throws(() => validateManifest({ ...manifest, blocks: [{ ...faq, pageIds: ["missing"] }] }), /page/);
});
test("Cottage manifest composes reusable defaults and event-only service sourcing", () => {
  const events = cottageContentManifest.blocks.find(block => block.id === "home-events");
  const gallery = cottageContentManifest.blocks.find(block => block.id === "home-venue-gallery");
  const vendors = cottageContentManifest.blocks.find(block => block.id === "vendors-directory");
  assert.equal(events?.type, "featured");
  assert.equal(events?.source, "services");
  assert.equal(events?.sourceCategory, "events");
  assert.equal((events?.defaults?.items as unknown[]).length, 3);
  assert.equal(gallery?.type, "gallery");
  assert.equal((gallery?.defaults?.images as unknown[]).length, 10);
  assert.equal(vendors?.type, "directory");
  assert.equal((vendors?.defaults?.items as unknown[]).length, 7);
});
test("directory entries accept display and contact fields but reject unknown data", () => {
  const entry = {
    id: "vendor-1", name: "Vendor", category: "Florals", offer: "Preferred rate", description: "Local event florist.",
    imageUrl: "assets/vendor.jpg", imageAlt: "Vendor arrangement", ctaLabel: "Get in touch", phone: "tel:+15551234567",
    secondaryPhone: "", email: "mailto:hello@example.com", website: "https://example.com", facebook: "", addressUrl: ""
  };
  assert.equal(payloadSchema("directory").safeParse({ heading: "Favorites", copy: "Trusted partners", items: [entry] }).success, true);
  assert.equal(payloadSchema("directory").safeParse({ heading: "Favorites", copy: "Trusted partners", items: [{ ...entry, secret: "no" }] }).success, false);
});
test("source categories are only valid with service-backed blocks", () => {
  assert.throws(() => validateManifest({ version: 1, id: "test", pages: [], blocks: [configuredBlock("gallery", "gallery", [], { sourceCategory: "events" })] }), /service source/);
});
test("mailing-list editors require a configured form", () => {
  assert.throws(() => validateManifest({ version: 1, id: "test", pages: [], blocks: [configuredBlock("signup", "mailingList", [])] }), /form/);
});
test("Business Info resolves existing authoritative name/email and shared fields", () => {
  const result = resolveBusinessInfo({ businessName: "Current", contactEmail: "current@example.com", timezone: "America/Chicago", publicContentConfig: { studio: { version: 1, blocks: { "business-info": { payload: { businessName: "stale", email: "stale@example.com", phone: "+15551234567" } } } } } });
  assert.equal(result.businessName, "Current"); assert.equal(result.email, "current@example.com"); assert.equal(result.phone, "+15551234567");
});
test("business hours reject invalid weekdays, timezones and overlapping intervals", () => {
  const valid = { ...emptyPayload("business"), businessName: "Example", timezone: "America/Chicago", hours: [{ id: "a", day: "Monday", opens: "09:00", closes: "17:00" }] };
  assert.doesNotThrow(() => validateBusinessInfo(valid));
  assert.throws(() => validateBusinessInfo({ ...valid, timezone: "Unknown/Place" }), /timezone/);
  assert.throws(() => validateBusinessInfo({ ...valid, hours: [...valid.hours, { id: "b", day: "Monday", opens: "16:00", closes: "18:00" }] }), /overlap/);
});
test("studio reads do not mutate legacy data or invent persisted content", () => {
  const legacy = { profiles: { cottage616: { header: { headline: "Existing" } } } };
  const before = JSON.stringify(legacy); assert.deepEqual(readStudio(legacy), { version: 1, blocks: {} }); assert.equal(JSON.stringify(legacy), before);
  assert.throws(() => readStudio({ studio: { version: 2 } }), /Unsupported/);
});
test("API callers cannot reorder existing content rows", () => {
  const items = [{ id: "a", question: "A", answer: "A" }, { id: "b", question: "B", answer: "B" }];
  const current: StoredBlock = { schemaVersion: 1, revision: 1, payload: { heading: "", items }, pageIds: ["home"], updatedAt: "", updatedBy: "" };
  assert.throws(() => validateBlockUpdate({ ...faq, limits: {} }, current, { id: "faq", revision: 1, payload: { items: [...items].reverse() }, pageIds: ["home"] }), /ordering/);
});
test("secondary locations distinguish inheritance from intentional empty values", () => {
  const business = { phone: "123", email: "hello@example.com", hours: [{ day: "Monday" }], locations: [{ id: "branch", phone: "", email: "", hours: [], overridePhone: true, overrideEmail: false, overrideHours: true }] };
  const location = resolveBusinessLocation(business, "branch");
  assert.equal(location.phone, ""); assert.equal(location.email, "hello@example.com"); assert.deepEqual(location.hours, []);
});
test("rich text supports formatting while escaping executable markup", () => {
  assert.equal(renderContentRichText("**Hello** _world_"), "<p><strong>Hello</strong> <em>world</em></p>");
  assert.equal(renderContentRichText("- One\n- Two"), "<ul><li>One</li><li>Two</li></ul>");
  assert.ok(!renderContentRichText('<img src=x onerror="alert(1)">').includes("<img"));
});
