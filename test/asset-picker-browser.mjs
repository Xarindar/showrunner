import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "asset-picker-")), "fixture");
const captures = resolve(".impeccable/review/asset-picker");
mkdirSync(captures, {recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import {AssetPicker} from './components/ui/asset-picker';
import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css';
createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main"><AssetPicker assets={[]} canUpload={false} title="Choose an image" onSelectAsset={asset=>window.selectedAsset=asset}>Open picker</AssetPicker></main></div>);
`},bundle:true,outfile:output+'.js',plugins:[{name:'fixture',setup(b){
b.onResolve({filter:/asset-upload-panel$/},()=>({path:'upload',namespace:'fixture'}));
b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='upload'?'export function AssetUploadPanel(){return null}':`import React from 'react'; export default function Image({unoptimized,...props}){return <img {...props}/>} `,loader:'tsx',resolveDir:process.cwd()}));
}}],define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
const js=readFileSync(output+'.js','utf8'),css=readFileSync(output+'.css','utf8');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});const requests=[];const errors=[];
page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
let failNext=false;
let releaseStale, markStaleStarted;
const staleGate=new Promise(resolve=>{releaseStale=resolve});
const staleStarted=new Promise(resolve=>{markStaleStarted=resolve});
await page.route('**/*',async route=>{
const url=new URL(route.request().url());
if(url.pathname==='/api/media/assets') {
 const folder=url.searchParams.get('folder')||'',query=url.searchParams.get('q')||'',number=Number(url.searchParams.get('page'));requests.push({folder,query,number});
 if(query==='old'){markStaleStarted();await staleGate;}
 if(failNext&&number===2){failNext=false;await route.fulfill({status:503,body:'Unavailable'});return;}
 const total=folder==='Empty'?0:folder||query?1:72;
 const assets=Array.from({length:Math.min(24,Math.max(0,total-(number-1)*24))},(_,index)=>({id:folder+query+((number-1)*24+index),filename:(query||folder||'Image')+' '+((number-1)*24+index)+'.jpg',folder,alt:'Photo',thumbnailUrl:'/photo.svg'}));
 await route.fulfill({json:{assets,page:number,pageCount:Math.max(1,Math.ceil(total/24)),total,folders:['Trips/Family','Events','Empty'],tagSummaries:[]}});return;
}
if(url.pathname==='/photo.svg'){await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#8eaa9d"/></svg>'});return;}
await route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>'});
});
await page.goto('http://picker.example');await page.getByRole('button',{name:'Choose an image',exact:true}).click();
const dialog=page.getByRole('dialog',{name:'Choose an image'}),grid=dialog.getByLabel('Available assets');
await dialog.getByRole('button',{name:'Open folder Trips',exact:true}).waitFor();
assert((await dialog.boundingBox()).width>=1000);assert((await dialog.boundingBox()).height>=800);
assert.equal(await dialog.getByRole('button',{name:'Load more assets'}).count(),0);
await dialog.screenshot({path:captures+'/desktop.png'});
await grid.evaluate(element=>element.scrollTop=element.scrollHeight);
await page.waitForFunction(()=>document.querySelectorAll('[aria-label^="Select Image"]').length===48);
assert.equal(requests.filter(request=>!request.folder&&!request.query&&request.number===2).length,1);
await grid.evaluate(element=>element.scrollTop=element.scrollHeight);
await page.waitForFunction(()=>document.querySelectorAll('[aria-label^="Select Image"]').length===72);
await dialog.getByRole('button',{name:'Open folder Trips',exact:true}).click();
await dialog.getByRole('button',{name:'Open folder Family',exact:true}).click();
await dialog.getByRole('button',{name:'Select Trips/Family 0.jpg',exact:true}).waitFor();
assert.equal(requests.at(-1).folder,'Trips/Family');
await dialog.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'All images',exact:true}).click();
await dialog.getByRole('button',{name:'Open folder Empty',exact:true}).click();
await dialog.getByText('No reusable assets yet.',{exact:true}).waitFor();
await dialog.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'All images',exact:true}).click();
await dialog.getByRole('button',{name:'Select Image 0.jpg',exact:true}).waitFor();
failNext=true;await grid.evaluate(element=>element.scrollTop=element.scrollHeight);
await dialog.getByRole('button',{name:'Try again',exact:true}).waitFor();
const failedCount=requests.length;await page.waitForTimeout(350);assert.equal(requests.length,failedCount,'Failed pagination must not loop');
await dialog.getByRole('button',{name:'Try again',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('[aria-label^="Select Image"]').length===48);
await dialog.getByRole('searchbox',{name:'Search assets'}).fill('old');
await staleStarted;
await dialog.getByRole('searchbox',{name:'Search assets'}).fill('flowers');
await dialog.getByRole('button',{name:'Select flowers 0.jpg',exact:true}).waitFor();
releaseStale();await page.waitForTimeout(100);
assert.equal(await dialog.getByRole('button',{name:'Select old 0.jpg',exact:true}).count(),0,'Stale responses cannot replace current search results');
assert.equal(requests.at(-1).number,1);assert.equal(requests.at(-1).query,'flowers');
await dialog.getByRole('button',{name:'Select flowers 0.jpg',exact:true}).click();await dialog.getByRole('button',{name:'Use image',exact:true}).click();
assert.equal(await page.evaluate(()=>window.selectedAsset.filename),'flowers 0.jpg');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Choose an image',exact:true}).click();
await dialog.getByRole('button',{name:'Open folder Trips',exact:true}).waitFor();
assert.equal(await dialog.evaluate(element=>element.scrollWidth>element.clientWidth),false);
assert.equal(await grid.evaluate(element=>element.scrollWidth>element.clientWidth),false);
await dialog.screenshot({path:captures+'/mobile.png'});
await dialog.getByRole('button',{name:'Open folder Trips',exact:true}).focus();await page.keyboard.press('Enter');
await dialog.getByRole('button',{name:'Open folder Family',exact:true}).waitFor();
assert.deepEqual(errors,[]);
console.log('Passed: generous desktop/mobile layout, folder icons and nested paths, automatic pagination, single requests, error recovery, search reset, selection, and keyboard navigation.');
} finally {await browser.close();}
