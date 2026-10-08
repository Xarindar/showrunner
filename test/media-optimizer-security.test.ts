import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import nextConfig from "../next.config";

const require = createRequire(import.meta.url);
const { ImageOptimizerCache } = require("next/dist/server/image-optimizer");
const { imageConfigDefault } = require("next/dist/shared/lib/image-config");
const config = { ...nextConfig, images: { ...imageConfigDefault, ...nextConfig.images } };
function validate(url: string) {
  return ImageOptimizerCache.validateParams({ headers: { accept: "image/webp,image/*" } }, { url, w: "640", q: "75" }, config, false);
}

test("Next optimizer rejects protected local routes before any fetching or caching", () => {
  for (const url of [
    "/api/portfolio/galleries/shoot/media/photo?access=bearer&variant=DOWNLOAD",
    "/api/portfolio/galleries/shoot/media/photo?access=bearer&variant=CARD",
    "/api/portfolio/galleries/shoot/media/photo",
    "/api/media/assets/original?variant=DOWNLOAD&expires=9999999999&signature=signed",
    "/api/media/assets/original",
    "/proofs/bearer",
    "/hero.svg?access=bearer",
    "/_next/static/media/../../../../api/media/assets/original?signature=signed"
  ]) {
    assert.equal(validate(url).errorMessage, '"url" parameter is not allowed', url);
  }
});

test("Next optimizer refuses signed object-storage originals and all remote query strings", () => {
  for (const url of [
    "https://account.r2.cloudflarestorage.com/private/original.jpg?X-Amz-Signature=signature&X-Amz-Expires=60",
    "https://account.cloudflarestorage.com/private/original.jpg?signature=signed",
    "https://imagedelivery.net/account/image/full?token=bearer",
    "https://private-bucket.s3.amazonaws.com/original.jpg?X-Amz-Signature=signature"
  ]) {
    assert.equal(validate(url).errorMessage, '"url" parameter is not allowed', url);
  }
  assert.equal(config.images.maximumRedirects, 0, "allowed public URLs cannot redirect the optimizer onto a protected source");
});

test("Next optimizer keeps query-free approved public images and static imports working", () => {
  for (const url of [
    "/hero.svg",
    "/_next/static/media/public-hero.abc123.jpg",
    "https://account.r2.cloudflarestorage.com/public/curated.jpg",
    "https://account.cloudflarestorage.com/public/curated.jpg",
    "https://imagedelivery.net/account/public-image/full"
  ]) {
    assert.equal(validate(url).errorMessage, undefined, url);
  }
});
