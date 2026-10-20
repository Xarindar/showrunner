import assert from "node:assert/strict";
import test from "node:test";
import { centeredFraming, cropFrame, moveFrame } from "../modules/content/studio/image-framing";
import { payloadSchema } from "../modules/content/studio/registry";

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
