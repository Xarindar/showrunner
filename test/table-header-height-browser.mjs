import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {build} = require('esbuild');
const {chromium, firefox} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {outputFiles} = await build({stdin: {
  contents: '@import "./app/globals.css"; @import "./app/admin/design-tokens.css"; @import "./app/admin/design-system.css";',
  resolveDir: process.cwd(), loader: 'css'
}, bundle: true, write: false});
const css = outputFiles[0].text;

for (const [name, engine] of Object.entries({chromium, firefox})) {
  const browser = await engine.launch({headless: true});
  try {
    const page = await browser.newPage();
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 900});
      for (const tableClass of ['ui-table ui-data-table', 'catalog-product-table', 'table']) {
        for (const empty of [true, false]) {
          const body = empty ? '<tr><td colspan="2">No sessions yet.</td></tr>' : '<tr><td>Portrait session</td><td>Ready</td></tr><tr><td>Wedding session</td><td>Awaiting photos</td></tr>';
          const markup = `<table class="${tableClass}"><thead><tr><th>Session</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>`;
          await page.setContent(`<style>${css}</style><div class="showrunner-admin"><section class="ui-data-table-shell clients-session-index" style="height:470px"><header class="ui-data-table-titlebar"><h2>Sessions</h2></header><div class="ui-table-wrap">${markup}</div></section><div class="ui-table-wrap">${markup}</div></div>`);
          const natural = await page.locator('table').last().boundingBox();
          const header = await page.locator('thead').last().boundingBox();
          await page.locator('table').first().evaluate(table => { table.style.height = '100%'; });
          const stretched = await page.locator('table').first().boundingBox();
          const stretchedHeader = await page.locator('thead').first().boundingBox();
          const label = `${name}, ${width}px, ${tableClass}, ${empty ? 'empty' : 'populated'}`;
          assert(stretched.height > natural.height, `${label}: fixture must stretch the table`);
          assert(Math.abs(stretchedHeader.height - header.height) < 1, `${label}: spare height must not stretch column headers (${stretchedHeader.height} versus ${header.height})`);
          assert(header.height <= 40, `${label}: natural headers stay compact`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
        }
      }
    }
    console.log(`${name}: compact headers pass for all shared table recipes, empty/populated and desktop/mobile.`);
  } finally {
    await browser.close();
  }
}
