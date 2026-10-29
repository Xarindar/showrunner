import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(mkdtempSync(resolve(tmpdir(), 'header-alignment-')), 'fixture.js');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ContentFields,MobileContentEditing} from './modules/content/studio/content-fields';
import {configuredBlock} from './modules/content/studio/manifest';
import {emptyFields,blockRegistry} from './modules/content/studio/registry';
function App(){const [mobile,setMobile]=useState(false);const [payload,setPayload]=useState({slides:[{id:'first',...emptyFields(blockRegistry.slideshow.fields.slides.fields)}]});window.payload=payload;
return <><button onClick={()=>setMobile(!mobile)}>Switch device</button><MobileContentEditing.Provider value={mobile}><ContentFields block={configuredBlock('header','slideshow',['home'])} value={payload} onChange={setPayload} canUpload={false} choices={[]} linkOptions={{pages:[],services:[]}}/></MobileContentEditing.Provider></>}
createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, outfile: output, jsx: 'automatic', plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({ filter: /^(\.\/actions|@\/components\/ui\/asset-picker)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path.includes('asset-picker') ? 'export const AssetPicker=()=>null;' : 'export async function uploadStudioAsset(){}', loader: 'js' }));
} }], define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${readFileSync(output, 'utf8')}</script>` }));
  await page.goto('https://editor.example');
  await page.getByRole('combobox', { name: /^Alignment/ }).waitFor({ timeout: 5000 }).catch(async error => { console.error(await page.locator('body').innerText()); throw error; });
  assert.equal(await page.getByRole('combobox', { name: /^Alignment/ }).count(), 1);
  assert.equal(await page.getByRole('combobox', { name: /^Alignment/ }).inputValue(), 'right');
  await page.getByRole('combobox', { name: /^Alignment/ }).selectOption('center');
  assert.equal(await page.evaluate(() => window.payload.slides[0].buttonAlignment), 'center');
  await page.getByRole('button', { name: 'Switch device' }).click();
  await page.getByRole('combobox', { name: /^Alignment/ }).selectOption('right');
  assert.equal(await page.evaluate(() => window.payload.slides[0].buttonAlignment), 'center');
  assert.deepEqual(await page.evaluate(() => window.payload.mobileOverrides), [{ path: ['slides', 'first', 'buttonAlignment'], value: 'right' }]);
  await page.getByRole('button', { name: 'Switch device' }).click();
  assert.equal(await page.getByRole('combobox', { name: /^Alignment/ }).inputValue(), 'center');
  console.log('PASS: Button settings align desktop and mobile independently.');
} finally { await browser.close(); }
