import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=join(mkdtempSync(join(tmpdir(),'terms-editor-')),'fixture');
await build({define:{"process.env.NODE_ENV":"\"production\"","process.env":"{}"},stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {FormsTerms} from './modules/appointments/forms-terms';import {NotificationProvider} from './components/ui/notifications';
import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
const documents=[{id:'default',name:'Default terms',version:1,kind:'TERMS',isDefault:true,rules:[{id:'terms',kind:'policy',category:'Terms',label:'Existing agreement text.',type:'TEXT',required:true,options:[]}]}];
function Demo(){const [path,setPath]=useState(location.pathname);useEffect(()=>{const changed=()=>setPath(location.pathname);addEventListener('popstate',changed);return()=>removeEventListener('popstate',changed)},[]);return <div className="showrunner-admin"><NotificationProvider><main className="admin-main"><FormsTerms key={path} initialDocuments={window.saved?[window.saved]:documents} initialTermsId={path.includes('/terms/')?path.split('/').pop():undefined}/></main></NotificationProvider></div>}createRoot(document.getElementById('root')).render(<Demo/>);
`},bundle:true,outfile:output+'.js',plugins:[{name:'server-fixtures',setup(b){
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  b.onResolve({filter:/\.\/forms-terms-actions$/},()=>({path:'actions',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='navigation'?'export const useRouter=()=>({push:path=>{history.pushState({},"",path);dispatchEvent(new PopStateEvent("popstate"))},refresh:()=>{}})':'export async function saveBookingDocument(input){window.saved={...input,id:"default",version:(input.version||0)+1};return {document:window.saved}}',loader:'js'}));
}}]});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(output+'.css','utf8')}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const browser=await chromium.launch({headless:true});mkdirSync('.tmp/terms-check',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
 await page.route('**/*',route=>route.fulfill(route.request().url().endsWith('/fixture.js')?{contentType:'text/javascript',body:readFileSync(output+'.js','utf8')}:{contentType:'text/html',body:html}));await page.goto('https://fixture.example');
 await page.getByRole('button',{name:'Edit Default terms',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Booking terms',exact:true});
 await editor.waitFor();assert.equal(await editor.innerText(),'Existing agreement text.');
 await editor.click();await editor.press('ControlOrMeta+a');
 await page.getByRole('button',{name:'Bold',exact:true}).click();
 assert.equal(await editor.locator('strong').innerText(),'Existing agreement text.');
 await editor.click();await editor.press('ControlOrMeta+End');
 await page.waitForTimeout(50);
 await page.getByRole('combobox',{name:'Insert dynamic field'}).selectOption('packageName');
 await page.getByRole('combobox',{name:'Insert dynamic field'}).selectOption('total');
 assert.equal(await editor.locator('[data-terms-field]').count(),2);
 await page.getByRole('button',{name:'Save terms',exact:true}).click();
 const saved=await page.evaluate(()=>window.saved);assert(saved.rules[0].richText);assert.match(saved.rules[0].label,/Package name/);
 await page.getByRole('button',{name:'Edit Default terms',exact:true}).click();
 assert.equal(await editor.locator('[data-terms-field]').count(),2);assert(await editor.locator('strong').count());
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);await page.screenshot({path:`.tmp/terms-check/editor-${width}.png`,fullPage:true});assert.equal(await page.getByRole('region',{name:'Booking terms editor'}).evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.equal(await page.getByRole('dialog').count(),0);}
 assert.deepEqual(errors,[]);console.log('Passed: legacy text, bold formatting, dynamic insertion, save/reopen, desktop/mobile terms editor.');
}finally{await browser.close();}
