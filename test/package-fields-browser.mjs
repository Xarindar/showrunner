// Real editor components; service persistence and API responses are fixtures.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = join(mkdtempSync(join(tmpdir(), 'package-fields-')), 'fixture');
const counts = { finalPhotos: 10, locations: 2, outfitChanges: 1 };
const offering = { coverageItems: [], tiers: [{ id: 'standard', name: 'Standard', durationMinutes: 60, priceCents: 10000, coverageIds: [], deliverables: counts }], addOns: [] };
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {SessionPackagesEditor} from './modules/scheduling/components/session-packages-editor';
  import {ServiceLibraryPicker} from './modules/scheduling/components/service-library-picker';
  import {NotificationProvider} from './components/ui/notifications';
  import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css';
  const params = new URLSearchParams(location.search), packageFields = params.has('cottage') ? [] : undefined;
  createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><NotificationProvider><main className="admin-main">
    {params.has('library') ? <ServiceLibraryPicker packageFields={packageFields} editingItem={{id:'extra',name:'Extra',deliverables:${JSON.stringify(counts)}}} selectedItems={[]} rates={[]} onRateSaved={()=>{}} onChoose={item=>window.savedLibrary=item} onClose={()=>{}} /> : <form><SessionPackagesEditor packageFields={packageFields} initialOffering={${JSON.stringify(offering)}} /></form>}
  </main></NotificationProvider></div>);
` }, bundle: true, outfile: `${output}.js`, jsx: 'automatic', loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, logLevel: 'silent', plugins: [{ name: 'server-fixtures', setup(builder) {
  builder.onResolve({ filter: /\.\.\/(service-library-actions|rate-actions)$/ }, args => ({ path: args.path, namespace: 'server-fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'server-fixture' }, () => ({ contents: 'export async function saveHourlyRateAction(){}; export async function saveServiceLibraryItemAction(input){window.savedLibraryInput=input;return {item:{...input,id:"extra",tags:[],priceCents:0}}}', loader: 'js' }));
} }] });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(`${output}.css`, 'utf8')}</style></head><body><div id="root"></div><script>${readFileSync(`${output}.js`, 'utf8')}</script></body></html>`;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
mkdirSync('.tmp/package-fields', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  for (const cottage of [false, true]) {
    await page.goto(`https://fixture.example/?${cottage ? 'cottage=1' : ''}`);
    await page.getByRole('button', { name: 'Edit Standard', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Standard', exact: true });
    for (const name of ['Final photos', 'Locations', 'Outfit changes']) assert.equal(await dialog.getByRole('spinbutton', { name, exact: true }).count(), cottage ? 0 : 1);
    await dialog.getByRole('combobox', { name: 'Hours', exact: true }).selectOption('2');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    const draft = JSON.parse(await page.locator('[name=sessionOffering]').inputValue());
    assert.deepEqual(draft.tiers[0].deliverables, counts, 'Editing duration preserves hidden allowances');
  }
  await page.goto('https://fixture.example/?cottage=1&library=1');
  const library = page.getByRole('dialog');
  await library.waitFor();
  assert.equal(await library.getByText('Adds to the session', { exact: true }).count(), 0);
  await library.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.savedLibraryInput.deliverables), counts, 'Saving a reusable service retains hidden allowances');
  await page.goto('https://fixture.example/?cottage=1');
  await page.getByRole('button', { name: 'Edit Standard', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.tmp/package-fields/cottage-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Passed site-specific editor fields, shared defaults, retained hidden package/service values, desktop/mobile.');
} finally { await browser.close(); }
