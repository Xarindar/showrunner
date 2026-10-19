import assert from "node:assert/strict";
import test from "node:test";
import { uploadImageQueue } from "../lib/media-upload-queue";

test("nine uploads run separately, retain successes and continue after a failure", async () => {
  const images = Array.from({ length: 9 }, (_, index) => index);
  const attempts: number[] = [];
  const results = new Map<number, string | undefined>();
  let running = 0;
  await uploadImageQueue(images, async image => {
    assert.equal(running++, 0);
    attempts.push(image);
    await Promise.resolve();
    running--;
    if (image === 3) throw new Error("network");
    return image === 5 ? { error: "File too large" } : {};
  }, (image, error) => { results.set(image, error); });
  assert.deepEqual(attempts, images);
  assert.equal([...results.values()].filter(Boolean).length, 2);
  const retry = images.filter(image => results.get(image));
  const retried: number[] = [];
  await uploadImageQueue(retry, async image => { retried.push(image); return {}; }, (image, error) => { results.set(image, error); });
  assert.deepEqual(retried, [3, 5]);
  assert([...results.values()].every(error => !error));
});

test("leaving an upload panel stops the remaining queue after the current request", async () => {
  let active = true;
  const attempts: number[] = [];
  await uploadImageQueue([1, 2, 3], async image => { attempts.push(image); active = false; return {}; }, () => {}, () => active);
  assert.deepEqual(attempts, [1]);
});
