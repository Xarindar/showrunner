import assert from 'node:assert/strict';
import test from 'node:test';
import { albumPhotoError, albumPhotoLimit } from '../modules/portfolio/album-upload';
test('album photos reject empty, oversized, and unsupported uploads', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) assert.equal(albumPhotoError({ size: albumPhotoLimit, type }), '');
  assert.match(albumPhotoError({ size: 0, type: 'image/jpeg' }), /Choose a photo/);
  assert.match(albumPhotoError({ size: albumPhotoLimit + 1, type: 'image/jpeg' }), /12 MB/);
  assert.match(albumPhotoError({ size: 10, type: 'application/pdf' }), /JPG/);
  assert.match(albumPhotoError({ size: 10, type: 'image/svg+xml' }), /JPG/);
});
