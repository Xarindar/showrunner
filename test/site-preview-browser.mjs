import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const password = process.env.SITE_PREVIEW_TEST_PASSWORD;
assert(password, 'Set SITE_PREVIEW_TEST_PASSWORD to the configured preview password.');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
mkdirSync('.tmp/site-preview', { recursive: true });
try {
  for (const [name, base] of [['cottage', process.env.COTTAGE_PREVIEW_URL || 'http://127.0.0.1:4180'], ['jazzr', process.env.JAZZR_PREVIEW_URL || 'http://127.0.0.1:4181']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/public/v1/**', route => route.fulfill({ json: { data: { services: [], categories: [], blocks: [] } } }));
    await page.goto(base + '/booking.html?profile=cottage616');
    assert(await page.getByRole('heading', { name: 'Coming soon.' }).isVisible());
    assert.equal(await page.locator('[data-booking-root]').count(), 0);
    await page.screenshot({ path: `.tmp/site-preview/${name}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.tmp/site-preview/${name}-mobile.png`, fullPage: true });
    assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByLabel('Preview password', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Enter website' }).click();
    await page.getByText('That password did not match. Try again.', { exact: true }).waitFor();
    assert(await page.getByRole('dialog').isVisible());
    await page.getByLabel('Preview password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Enter website' }).click();
    await page.locator('[data-booking-root]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/booking.html');
    assert.equal(new URL(page.url()).searchParams.get('profile'), 'cottage616');
    const cookie = (await context.cookies()).find(item => item.name === 'site_preview');
    assert(cookie.httpOnly);
    assert.equal(await page.evaluate(() => document.cookie.includes('site_preview')), false);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Passed both branded coming-soon pages, desktop/mobile login, wrong-password recovery, private sessions and booking-page unlock.');
} finally { await browser.close(); }
