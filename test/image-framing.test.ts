import assert from "node:assert/strict";
import test from "node:test";
import { centeredFraming, cropFrame, moveFrame, imageFramingSchema, readImageFraming, framingImageSource } from "../modules/content/studio/image-framing";
import { resolveFeatured } from "../modules/content/studio/featured";
import { payloadSchema, emptyPayload } from "../modules/content/studio/registry";

test("crop frame matches cover rendering at both viewport orientations and with zoom", () => {
  for (const imageRatio of [0.75, 1, 1.5, 3]) for (const viewportRatio of [0.6, 1.5, 2.5]) for (const imageZoom of [1, 1.5, 3]) {
    const framing = { imagePositionX: 30, imagePositionY: 80, imageZoom };
    const frame = cropFrame(imageRatio, viewportRatio, framing);
    assert.ok(Math.abs(frame.width * imageRatio / frame.height - viewportRatio) < 1e-10);
    assert.ok(frame.left >= 0 && frame.top >= 0 && frame.left + frame.width <= 1 && frame.top + frame.height <= 1);
    const moved = moveFrame(framing, frame, 5, -5);
    assert.equal(moved.imagePositionX, frame.width === 1 ? 30 : 100);
    assert.equal(moved.imagePositionY, frame.height === 1 ? 80 : 0);
    assert.deepEqual(moveFrame(framing, frame, 0, 0), framing);
  }
});

test("legacy headers default to centered framing and saves reject invalid crops", () => {
  const slide = { id: "one", imageUrl: "/photo.jpg", imageAlt: "Venue", title: "Title", caption: "", buttonLabel: "", buttonHref: "" };
  const schema = payloadSchema("slideshow");
  const parsed = schema.parse({ slides: [slide] }) as { slides: Record<string, unknown>[] };
  for (const [key, value] of Object.entries(centeredFraming)) assert.equal(parsed.slides[0][key], value);
  for (const bad of [{ imagePositionX: -1 }, { imagePositionY: 101 }, { imageZoom: 0.5 }, { imageZoom: 4 }, { imageZoom: "2" }, { imageZoom: Infinity }]) {
    assert.equal(schema.safeParse({ slides: [{ ...slide, ...bad }] }).success, false);
  }
  assert.equal(schema.safeParse({ slides: [{ ...slide, imagePositionX: 0, imagePositionY: 100, imageZoom: 2.25 }] }).success, true);
});

test("all website photo fields default legacy crops and reject invalid framing", () => {
  for (const type of ["strip", "hero", "gallery", "team", "directory", "about", "featured", "coupon", "mailingList", "showcase"] as const) {
    const payload = emptyPayload(type);
    const field = ["strip", "hero", "gallery"].includes(type) ? "images" : ["team", "directory", "featured", "showcase"].includes(type) ? "items" : null;
    if (field) {
      const row = type === "featured" ? { id: "photo", referenceId: "service" } : type === "showcase" ? { id: "photo", catalogKey: "service:s1", displayOnly: false, variant: "" } : type === "team" ? { id: "photo", name: "", role: "", bio: "", imageUrl: "", imageAlt: "" } : type === "directory" ? { id: "photo", name: "", category: "", offer: "", description: "", imageUrl: "", imageAlt: "", ctaLabel: "", phone: "", secondaryPhone: "", email: "", website: "", facebook: "", addressUrl: "" } : { id: "photo", url: "/photo.jpg", alt: "", caption: "" };
      payload[field] = [row];
    }
    const schema = payloadSchema(type);
    const parsed = schema.parse(payload) as Record<string, unknown>;
    const photo = field ? (parsed[field] as Record<string, unknown>[])[0] : parsed;
    assert.equal(photo.imagePositionX, 50, type);
    if (field) payload[field] = [{ ...photo, imageZoom: 4 }]; else payload.imageZoom = 4;
    assert.equal(schema.safeParse(payload).success, false, type);
  }
});

test("featured photos inherit the live booking crop until a custom photo is chosen", () => {
  const service = { id: "service", name: "Party", imageUrl: "/booking.jpg", imageFraming: { imagePositionX: 15, imagePositionY: 75, imageZoom: 2 }, href: "/booking?service=party" };
  const row = { id: "slot", referenceId: "service" };
  assert.equal(resolveFeatured(row, service).imageZoom, 2);
  const custom = resolveFeatured({ ...row, imageSource: "custom", imageUrl: "/custom.jpg", ...centeredFraming }, service);
  assert.equal(custom.id, "service"); assert.equal(custom.editorId, "slot");
  assert.equal(custom.imageUrl, "/custom.jpg"); assert.equal(custom.imageZoom, 1);
  assert.equal(custom.ctaHref, service.href);
  const localCrop = resolveFeatured({ ...row, useServiceFraming: false, imagePositionX: 25, imagePositionY: 30, imageZoom: 1.5 }, { ...service, framingUrl: "/full.jpg" });
  assert.equal(localCrop.imageUrl, "/full.jpg"); assert.equal(localCrop.imageZoom, 1.5);
  assert.equal(resolveFeatured({ ...row, imageSource: "custom" }, service).imageUrl, "");
  assert.deepEqual(readImageFraming(null), centeredFraming);
  assert.equal(imageFramingSchema.safeParse({ ...centeredFraming, imageZoom: Infinity }).success, false);
  assert.equal(framingImageSource("/api/media/assets/photo?variant=CARD"), "/api/media/assets/photo?variant=FULL");
  assert.equal(framingImageSource("https://cdn.example/photo.jpg"), "https://cdn.example/photo.jpg");
});
