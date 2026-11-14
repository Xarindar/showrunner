import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = join(mkdtempSync(join(tmpdir(), 'package-flow-')), 'fixture');
const offering = { coverageItems: [{id:'first',libraryItemId:'first-look',name:'First Look'}, {id:'reception',libraryItemId:'reception-photos',name:'Reception photos'}], tiers:[
  {id:'gold',name:'Gold',durationMinutes:120,priceCents:50000,coverageIds:['first']},
  {id:'basic',name:'Basic',durationMinutes:60,priceCents:20000,coverageIds:['reception']}], addOns:[] };
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {SessionPackagesEditor} from './modules/scheduling/components/session-packages-editor';
  import {NotificationProvider} from './components/ui/notifications';
  import {ResponsiveTableFrame} from './components/ui/responsive-table';
  import {Button} from './components/ui/button';
  import {Pencil,X} from 'lucide-react';
  import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css'; import './app/admin/notifications.css';
  createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><NotificationProvider><main className="admin-main" style={{height:'auto'}}><SessionPackagesEditor initialOffering={${JSON.stringify(offering)}} />
  <ResponsiveTableFrame aria-label="Shared actions fixture"><table className="catalog-product-table"><thead><tr><th>Name</th><th>Actions</th></tr></thead><tbody><tr><td>A deliberately long service name that must not force the action buttons to stack</td><td><Button aria-label="Edit row"><Pencil size={15}/></Button><Button aria-label="Remove row"><X size={15}/></Button></td></tr></tbody></table></ResponsiveTableFrame>
  </main></NotificationProvider></div>);
`},bundle:true,outfile:`${output}.js`,jsx:'automatic',loader:{'.woff2':'dataurl','.woff':'dataurl'},define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent',plugins:[{name:'server-fixtures',setup(builder){
  builder.onResolve({filter:/\.\.\/(service-library-actions|rate-actions)$/},args=>({path:args.path,namespace:'server-fixture'}));
  builder.onLoad({filter:/.*/,namespace:'server-fixture'},()=>({contents:'export async function saveHourlyRateAction(){throw Error("not used")}; export async function saveServiceLibraryItemAction(){throw Error("not used")}',loader:'js'}));
}}]});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(`${output}.css`,'utf8')}</style></head><body><div id="root"></div><script>${readFileSync(`${output}.js`,'utf8')}</script></body></html>`;
const browser=await chromium.launch({headless:true});
mkdirSync('.tmp/package-check',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/scheduling/service-library?*',route=>route.fulfill({json:{items:offering.coverageItems.map(item=>({id:item.libraryItemId,name:item.name,description:'',tags:[],category:'',pricingType:'FLAT_RATE',priceCents:0})),categories:[],tags:[],total:2,page:1,pageCount:1}}));
  await page.goto('https://fixture.example');
  await page.getByRole('button',{name:'Edit Basic',exact:true}).click();
  await page.getByRole('button',{name:'Add Services',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Add Services',exact:true});
  const first=picker.getByRole('checkbox',{name:'Select First Look',exact:true}),reception=picker.getByRole('checkbox',{name:'Select Reception photos',exact:true});
  await first.waitFor(); assert.equal(await first.isChecked(),false);assert(await first.isEnabled());assert(await reception.isChecked());
  await reception.uncheck();await first.check();await picker.getByRole('button',{name:'Apply to package'}).click();
  let draft=JSON.parse(await page.locator('input[name=sessionOffering]').inputValue());
  assert.deepEqual(draft.tiers[0].coverageIds,['first']);assert.deepEqual(draft.tiers[1].coverageIds,['first']);
  await page.getByRole('button',{name:'Remove First Look from Basic'}).click();
  draft=JSON.parse(await page.locator('input[name=sessionOffering]').inputValue());
  assert.deepEqual(draft.tiers[0].coverageIds,['first']);assert.deepEqual(draft.tiers[1].coverageIds,[]);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Edit Gold',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit Gold'});
  for(const name of ['photos','locations','outfit changes']) await dialog.getByRole('switch',{name:name==='photos'?'Unlimited final photos':`Unlimited ${name}`,exact:true}).check();
  draft=JSON.parse(await page.locator('input[name=sessionOffering]').inputValue());
  assert.deepEqual(draft.tiers[0].deliverables,{finalPhotos:null,locations:null,outfitChanges:null});
  assert.equal(draft.tiers[1].deliverables,undefined);
  for(const width of [1440,1000,390]){
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(100);
    await dialog.getByRole('group',{name:'Booking settings',exact:true}).scrollIntoViewIfNeeded();
    const buttons=dialog.getByRole('region',{name:'Package services table'}).getByRole('button');
    const bounds=await buttons.evaluateAll(items=>items.map(item=>{const b=item.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width}}));
    assert.equal(bounds.length,2);assert.equal(bounds[0].top,bounds[1].top,'Actions remain on one line');
    const tops=await dialog.getByRole('group',{name:'Booking settings',exact:true}).getByRole('spinbutton').evaluateAll(items=>items.map(item=>Math.round(item.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size,width>860?1:3,'Compact desktop booking row');
    assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.screenshot({path:`.tmp/package-check/package-${width}.png`,fullPage:true});
  }
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
    const tops=await page.getByRole('region',{name:'Shared actions fixture'}).getByRole('button').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().top));
    assert.equal(tops[0],tops[1],'Shared actions also stay inline outside package modals');
  }
  assert.deepEqual(errors,[]);console.log('Passed: independent package choices, unlimited counts, global inline actions, compact booking settings, desktop/mobile.');
} finally {await browser.close();}
