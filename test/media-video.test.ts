import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { MediaUploadMetadata, MediaUploadValidationOptions } from "../lib/media";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync("lib/media.ts", "utf8") + `
exports.validate = assertUploadFile;
fetchMediaAssetSource = async () => new Response(new Uint8Array([0,1,2,3,4,5,6,7,8,9]));
`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
type DeliveryAsset = { mimeType: string; filename: string; isPrivate: boolean; deletedAt: Date | null };
const api: Partial<{
  validate: (file: File, metadata: MediaUploadMetadata, validation: MediaUploadValidationOptions) => Promise<string>;
  mediaDeliveryResponse: (input: { asset: DeliveryAsset; type: "FULL"; request: { headers: Headers } }) => Promise<Response | null>;
}> = {};
runInNewContext(source, { exports: api, File, Buffer, Response, Headers, URL, process, console,
  require: (name: string) => name === "server-only" || name.startsWith("@/") ? {} : require(name) });
const { validate, mediaDeliveryResponse } = api;
assert.ok(validate);
assert.ok(mediaDeliveryResponse);
const mp4 = new File([new Uint8Array([0,0,0,24]), "ftypisom", new Uint8Array(12)], "clip.mp4", { type: "video/mp4" });

test("video validation is opt-in, checks file signatures and retains image accessibility rules", async () => {
  assert.equal(await validate(mp4, {}, { allowVideo: true }), "clip.mp4");
  await assert.rejects(validate(mp4, {}, {}), /image/);
  await assert.rejects(validate(new File(["not a video"], "fake.mp4", { type: "video/mp4" }), {}, { allowVideo: true }), /contents/);
  for (const [type, bytes] of [["video/quicktime", Buffer.concat([Buffer.alloc(4), Buffer.from("ftypqt  ")])], ["video/webm", Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]), Buffer.from("webm")])]] as const) {
    await validate(new File([bytes], "clip", { type }), {}, { allowVideo: true });
  }
  await assert.rejects(validate(new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.mp4", { type: "video/mp4" }), {}, { allowVideo: true }), /25 MB/);
  await assert.rejects(validate(new File([Buffer.from([0xff,0xd8,0xff])], "photo.jpg", { type: "image/jpeg" }), {}, { allowVideo: true }), /alt text/);
});

test("video delivery supports seeking and retains private access checks", async () => {
  const asset = { mimeType: "video/mp4", filename: "clip.mp4", isPrivate: false, deletedAt: null };
  const deliver = (range: string, override = {}) => mediaDeliveryResponse({asset: {...asset, ...override}, type: "FULL", request: {headers: new Headers({range})}});
  const partial = await deliver("bytes=2-5");
  assert.ok(partial);
  assert.equal(partial.status,206); assert.equal(partial.headers.get("content-range"),"bytes 2-5/10");
  assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())],[2,3,4,5]);
  assert.equal((await deliver("bytes=-3"))?.headers.get("content-range"),"bytes 7-9/10");
  assert.equal((await deliver("bytes=20-"))?.status,416);
  assert.equal((await deliver("bytes=0-1,3-4"))?.status,416);
  assert.equal(await deliver("bytes=0-1", {isPrivate:true}),null);
});
