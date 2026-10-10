// Run: node --import tsx test/media-variant-urls.mjs
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
const require = createRequire(import.meta.url);
// Next normally resolves this marker; use its empty server entry for this server-only check.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, context);
} });
const { getMediaAdapter } = require('../lib/media.ts');
const asset = { id: 'photo-1', isPrivate: false, key: 'photo.jpg', storageProviderId: '', url: 'https://cdn.example.com/original.jpg' };
for (const driver of ['S3', 'R2', 'SERVER_ASSETS']) {
  for (const variant of ['THUMBNAIL', 'CARD', 'FULL']) {
    assert.equal(getMediaAdapter(driver).generateVariantUrl(asset, variant), `/api/media/assets/photo-1?variant=${variant}`);
  }
}
for (const driver of ['S3', 'R2']) {
  assert.equal(getMediaAdapter(driver).generateVariantUrl(asset, 'DOWNLOAD'), asset.url);
  assert.equal(getMediaAdapter(driver).generateVariantUrl({ ...asset, isPrivate: true }, 'THUMBNAIL'), '/api/media/assets/photo-1?variant=THUMBNAIL');
}
console.log('PASS: cloud previews use resized variants; original downloads and private routing remain intact.');
