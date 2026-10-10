import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Synthetic-only browser regression. No database, real clients, or payment provider calls.
// PLAYWRIGHT_MODULE may point to an existing Playwright install. CHROMIUM_PATH selects a browser.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(`${root}/package.json`);
const { build } = require('esbuild');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(mkdtempSync(resolve(tmpdir(), 'showrunner-proof-ui-')), 'fixture');
const captures = process.env.PROOF_SCREENSHOT_DIR || `${root}/.impeccable/review/proofs`;
mkdirSync(captures, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ProofClient} from './modules/portfolio/proof-client'; import {ProofPaymentReturn} from './modules/portfolio/proof-payment-return'; import './app/globals.css'; const view=window.__proofView; createRoot(document.getElementById('root')).render(location.pathname.endsWith('/payment-return') ? <ProofPaymentReturn/> : <ProofClient initialView={view} token="synthetic-private-token"/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, outfile: `${output}.js`, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
const js=readFileSync(`${output}.js`,'utf8');
const css=readFileSync(`${output}.css`,'utf8').replace(/@import[^;]+;/g,'');
let purchase=null, revoked=false, postCount=0;
const items=Array.from({length:6},(_,i)=>({id:`photo-${i+1}`,title:`Proof ${String(i+1).padStart(2,'0')}`,altText:`Synthetic proof ${i+1}`}));
let availableItems=items;
const view=()=>({termsVersion:'a'.repeat(64),gallery:{id:'synthetic-gallery',slug:'synthetic-shoot',title:'Autumn portrait shoot',description:'Synthetic test gallery. Choose the photographs you would like to keep.'},includedCount:2,extraImagePriceCents:2500,currency:'USD',items:availableItems,purchase});
const html=()=>`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><style>:root,body{--color-page:#fff;--color-surface:#fff;--color-surface-sunken:#ecece9;--color-text:#20221f;--color-muted:#656a65;--color-border:#d9dbd6;--color-brand:#116466;--color-brand-dark:#164e50;--color-brand-contrast:#fff;--font-sans:Arial,sans-serif;--leading-normal:1.5;--radius-control:5px;--control-height:44px;--space-3:12px;--color-danger:#b42318;--radius-card:12px;--color-hover:#f4f5f3;--color-brand-border:#116466}</style><style>${css}</style></head><body><div id="root"></div><script>window.__proofView=${JSON.stringify(view())}</script><script>${js}</script></body></html>`;
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{const req=route.request();const url=new URL(req.url());
if(url.hostname==='pay.example') return route.fulfill({contentType:'text/html',body:'<h1>Synthetic payment provider</h1>'});
if(url.pathname.startsWith('/api/portfolio/proofs/')) {
if(revoked) return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'This proof link is unavailable.'})});
if(req.method()==='POST'){postCount++; assert.equal(req.headers()['x-proof-request'],'1'); const {itemIds}=req.postDataJSON(); const extras=Math.max(0,itemIds.length-2); purchase={id:'synthetic-purchase',status:extras?'PENDING':'RELEASED',canRetryCheckout:extras>0,selectedItemIds:itemIds,includedCount:2,extraCount:extras,extraImagePriceCents:2500,totalCents:extras*2500,currency:'USD',checkoutUrl:extras?'https://pay.example/checkout':null,downloads:[]}; await new Promise(r=>setTimeout(r,200));return route.fulfill({contentType:'application/json',body:JSON.stringify({purchaseId:purchase.id,status:purchase.status,checkoutUrl:purchase.checkoutUrl})}); }
return route.fulfill({contentType:'application/json',body:JSON.stringify(view())}); }
if(url.pathname.startsWith('/api/portfolio/galleries/')){const id=url.pathname.split('/').at(-1);return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect width="640" height="800" fill="#d4d9d1"/><text x="320" y="370" fill="#3e4b40" font-family="Arial" font-size="28" text-anchor="middle">Synthetic ${id}</text><text x="320" y="425" fill="#3e4b40" font-family="Arial" font-size="18" text-anchor="middle">WATERMARKED PROOF</text></svg>`});}
if(url.hostname==='proof-fixture.example')return route.fulfill({contentType:'text/html',body:html()});
return route.abort();});
try {
await page.goto('https://proof-fixture.example/proofs/synthetic-private-token'); await page.getByRole('heading',{name:'Autumn portrait shoot'}).waitFor();
await page.screenshot({path:`${captures}/desktop.png`,fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${captures}/mobile.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.setViewportSize({width:1440,height:1000});
await page.getByRole('checkbox',{name:'Select Proof 06',exact:true}).check();
availableItems=items.filter(item=>item.id!=='photo-6');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
await page.getByText('Some previously selected proofs are no longer available and have been removed. Please review your selection.').waitFor();
assert.equal(await page.getByRole('checkbox',{checked:true}).count(),0);
availableItems=items;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByRole('checkbox',{name:'Select Proof 06',exact:true}).waitFor();
for(let n=1;n<=3;n++)await page.getByRole('checkbox',{name:`Select Proof 0${n}`,exact:true}).check();
await page.getByRole('button',{name:'Remove 1 extra photo',exact:true}).click();
assert.equal(await page.getByRole('checkbox',{name:'Select Proof 03',exact:true}).isChecked(),false);
await page.getByRole('checkbox',{name:'Select Proof 03',exact:true}).check();
await page.getByRole('button',{name:'Review selection',exact:true}).click();
assert.equal(await page.getByRole('button',{name:'Finalize & pay $25.00',exact:true}).isEnabled(),false);
await page.getByRole('button',{name:'Keep choosing',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'Remove Proof 03',exact:true}).isChecked(),true);
await page.getByRole('button',{name:'Review selection',exact:true}).click();await page.getByRole('checkbox',{name:'I’ve checked my choices'}).check();
await page.getByRole('button',{name:'Finalize & pay $25.00',exact:true}).evaluate(button=>{button.click();button.click()});
await page.waitForURL('https://pay.example/checkout');assert.equal(postCount,1);
await page.goto('https://proof-fixture.example/proofs/payment-return?checkout=success');await page.waitForURL('https://proof-fixture.example/proofs/synthetic-private-token');await page.getByRole('heading',{name:'Awaiting payment',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Your selected originals',exact:true}).count(),0);
assert.equal(await page.getByRole('checkbox',{name:'Remove Proof 01',exact:true}).isDisabled(),true);
purchase={...purchase,status:'RELEASED',canRetryCheckout:false,checkoutUrl:null,downloads:purchase.selectedItemIds.map(id=>({itemId:id,filename:`${id}.jpg`,url:`/api/portfolio/galleries/synthetic-shoot/media/${id}?variant=DOWNLOAD&access=synthetic-private-token`}))};
await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('heading',{name:'Your selected originals',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:/Download photo-/}).count(),3);
await page.reload();await page.getByRole('heading',{name:'Originals ready',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Remove Proof 01',exact:true}).isDisabled(),true);
revoked=true;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('heading',{name:'This proof link is unavailable',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:/Download/}).count(),0);
assert.deepEqual(errors,[]);
console.log(JSON.stringify({passed:['desktop/mobile overflow','unavailable draft selections reconciled','selection and remove extras','confirmation and cancel preservation','duplicate-submit prevention','safe payment return','query does not unlock downloads','verified release and reload','revoked-link fail-close'],screenshots:captures}));
} finally {await browser.close();}
