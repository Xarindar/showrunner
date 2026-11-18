import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { createPreviewServer, safeReturnPath } from '../clients/site-preview/server.mjs';

test('preview return paths stay on the same website and inside the installation', () => {
  for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', '/%2f%2fevil', '/path\r\nheader:value']) assert.equal(safeReturnPath(value, '/site/'), '/site/');
  assert.equal(safeReturnPath('/site/booking?service=spa', '/site/'), '/site/booking?service=spa');
});

test('preview gates pages/assets, validates passwords, signs private sessions, retains redirects and supports media ranges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'showrunner-preview-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'coming-soon.html'), '<h1>Coming soon</h1><form>{{NEXT}} {{ERROR}}</form>');
  await writeFile(join(root, 'coming-soon.css'), 'body{}');
  await writeFile(join(root, 'index.html'), '<h1>Private website</h1>');
  await writeFile(join(root, 'booking.html'), '<h1>Booking</h1>');
  await writeFile(join(root, 'assets/video.mp4'), '0123456789');
  await writeFile(join(root, '.env'), 'private-secret');
  const passwordHash = 'fixture-salt:' + scryptSync('fixture-password', 'fixture-salt', 64).toString('hex');
  const server = await createPreviewServer({ root, passwordHash, secret: 'test-secret-that-is-at-least-32-characters', redirects: { book: 'booking.html' }, spaPaths: ['about'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (password, extra = {}) => fetch(base + '/__preview/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', ...extra }, body: new URLSearchParams({ password, next: '/booking.html?service=spa' }), redirect: 'manual' });
  try {
    for (const path of ['/', '/booking.html', '/assets/video.mp4']) assert.match(await (await fetch(base + path)).text(), /Coming soon/);
    assert.equal((await fetch(base + '/coming-soon.css')).headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('fixture-password', { Origin: 'https://evil.example' })).status, 403);
    const response = await login('fixture-password');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/booking.html?service=spa');
    const session = response.headers.get('set-cookie');
    assert.match(session, /HttpOnly; SameSite=Lax/);
    const cookie = session.split(';')[0];
    const headers = { Cookie: cookie };
    assert.match(await (await fetch(base + '/', { headers })).text(), /Private website/);
    assert.match(await (await fetch(base + '/about', { headers })).text(), /Private website/);
    assert.equal((await fetch(base + '/.env', { headers })).status, 404);
    const redirect = await fetch(base + '/book?service=spa', { headers, redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/booking.html?service=spa');
    const range = await fetch(base + '/assets/video.mp4', { headers: { ...headers, Range: 'bytes=2-4' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), '234');
    assert.equal((await fetch(base + '/assets/video.mp4', { headers: { ...headers, Range: 'bytes=20-' } })).status, 416);
    assert.equal((await fetch(base + '/booking.html', { method: 'HEAD', headers: { ...headers, 'Accept-Encoding': 'identity' } })).headers.get('content-length'), '16');
    assert.match(await (await fetch(base + '/', { headers: { Cookie: cookie + 'broken' } })).text(), /Coming soon/);
    for (let attempt = 0; attempt < 10; attempt++) await login('wrong');
    assert.equal((await login('fixture-password')).status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert(root.startsWith(join(tmpdir(), 'showrunner-preview-')));
    await rm(root, { recursive: true, force: true });
  }
});
