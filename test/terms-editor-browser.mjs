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
import './app/admin/notifications.css';import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
const documents=[{id:'default',name:'Default terms',version:1,kind:'TERMS',isDefault:true,rules:[{id:'terms',kind:'policy',category:'Terms',label:'Existing agreement text.',type:'TEXT',required:true,options:[]}]}];
function Demo(){const [path,setPath]=useState(location.pathname);useEffect(()=>{const changed=()=>setPath(location.pathname);addEventListener('popstate',changed);return()=>removeEventListener('popstate',changed)},[]);return <div className="showrunner-admin"><NotificationProvider><main className="admin-main"><FormsTerms key={path} initialDocuments={window.saved?[window.saved]:documents} initialTermsId={path.includes('/terms/')?path.split('/').pop():undefined}/></main></NotificationProvider></div>}createRoot(document.getElementById('root')).render(<Demo/>);
`},bundle:true,outfile:output+'.js',plugins:[{name:'server-fixtures',setup(b){
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  b.onResolve({filter:/\.\/forms-terms-actions$/},()=>({path:'actions',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='navigation'?'export const useRouter=()=>({push:path=>{history.pushState({},"",path);dispatchEvent(new PopStateEvent("popstate"))},refresh:()=>{}})':'function assertActionSerializable(value){if(!value||typeof value!=="object")return;if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)throw Error("Server actions require plain objects");Object.values(value).forEach(assertActionSerializable)}export async function saveBookingDocument(input){assertActionSerializable(input);if(window.failSave)return {error:"Save failed. Your changes are still here."};window.saved={...input,id:"default",version:(input.version||0)+1};return {document:window.saved}}',loader:'js'}));
}}]});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(output+'.css','utf8')}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const browser=await chromium.launch({headless:true});mkdirSync('.tmp/terms-check',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
 await page.route('**/*',route=>route.fulfill(route.request().url().endsWith('/fixture.js')?{contentType:'text/javascript',body:readFileSync(output+'.js','utf8')}:{contentType:'text/html',body:html}));await page.goto('https://fixture.example');
 await page.getByRole('button',{name:'Edit Default terms',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Booking terms',exact:true});
 await editor.waitFor();assert.equal(await editor.innerText(),'Existing agreement text.');
 await editor.click();
 for(const [label,tag] of [['Heading','h2'],['Subheading','h3'],['Paragraph','p']]){
  const button=page.getByRole('button',{name:label,exact:true});await button.click();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.equal(await editor.locator(tag).innerText(),'Existing agreement text.');
 }
 assert.equal(await page.getByRole('combobox').count(),0,'Formatting uses toolbar buttons, not dropdowns');
 await editor.click();await editor.press('ControlOrMeta+a');
 await page.getByRole('button',{name:'Bold',exact:true}).click();
 assert.equal(await editor.locator('strong').innerText(),'Existing agreement text.');
 await editor.click();await editor.press('ControlOrMeta+End');
 await page.waitForTimeout(50);
 const picker=page.getByRole('dialog',{name:'Add Dynamic Field',exact:true});
 async function insertField(label){
  await page.getByRole('button',{name:'Add Dynamic Field',exact:true}).click();
  await picker.getByRole('button',{name:label,exact:true}).click();
  await picker.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Booking terms');
 }
 await editor.press('ControlOrMeta+Home');
 for(let i=0;i<'Existing '.length;i++)await editor.press('ArrowRight');
 await page.waitForTimeout(50);
 await insertField('Package name');
 assert.equal(await editor.textContent(),'Existing Package nameagreement text.','The modal inserts in the middle at the saved cursor');
 await editor.press('ControlOrMeta+End');
 await page.waitForTimeout(50);
 await insertField('Booking total');
 const beforeCancel=await editor.innerHTML();
 await page.getByRole('button',{name:'Add Dynamic Field',exact:true}).click();
 await page.keyboard.press('Escape');
 await picker.waitFor({state:'hidden'});
 assert.equal(await editor.innerHTML(),beforeCancel,'Cancel does not modify the document');
 await editor.press('ControlOrMeta+a');
 await page.waitForTimeout(50);
 await insertField('Duration');
 assert.equal(await editor.textContent(),'Duration','A chosen field replaces selected text');
 await page.getByRole('button',{name:'Undo',exact:true}).click();

 assert.equal(await editor.locator('[data-terms-field]').count(),2);
 await page.getByRole('button',{name:'Save terms',exact:true}).click();
 const saved=await page.evaluate(()=>window.saved);assert(saved,"The editor payload must be serializable by server actions");assert(saved.rules[0].richText);assert.match(saved.rules[0].label,/Package name/);
 await page.getByRole('button',{name:'Edit Default terms',exact:true}).click();
 assert.equal(await editor.locator('[data-terms-field]').count(),2);assert(await editor.locator('strong').count());

 await page.evaluate(()=>{window.failSave=true});
 for(let attempt=0;attempt<2;attempt++){
  for(const button of await page.getByRole('button',{name:'Dismiss notification'}).all())await button.click();
  await page.getByRole('button',{name:'Save terms',exact:true}).click();
  await page.getByRole('region',{name:'Notifications'}).getByRole('alert').getByText('Save failed. Your changes are still here.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Booking terms editor'}).getByRole('alert').count(),0,'Save errors must only appear in the unified toast host');
  assert.equal(await editor.locator('[data-terms-field]').count(),2,'Failed saves preserve the draft');
 }
 await page.evaluate(()=>{window.failSave=false});
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);await page.screenshot({path:`.tmp/terms-check/editor-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Add Dynamic Field',exact:true}).click();const box=await picker.boundingBox();assert(box.width>0&&box.x>=0&&box.x+box.width<=width+1);assert.equal(await picker.getByRole('button',{name:'Client phone',exact:true}).count(),1);await page.screenshot({path:`.tmp/terms-check/field-picker-${width}.png`,fullPage:true});await picker.getByRole('button',{name:'Close dialog',exact:true}).click();await picker.waitFor({state:'hidden'});assert.equal(await page.getByRole('region',{name:'Booking terms editor'}).evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.equal(await page.getByRole('dialog').count(),0);}
 const toolbar=page.getByRole('group',{name:'Terms formatting',exact:true});
 assert.equal(await toolbar.getByRole('button').last().innerText(),'Save terms');
 await page.setViewportSize({width:768,height:900});
 const firstButton=await toolbar.getByRole('button').first().boundingBox();
 const saveButton=await toolbar.getByRole('button',{name:'Save terms',exact:true}).boundingBox();
 assert(Math.abs(firstButton.y-saveButton.y)<2,'Save stays inline when the toolbar has room');
 await editor.fill(Array.from({length:80},(_,i)=>`Agreement paragraph ${i+1}`).join('\n'));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await editor.evaluate(el=>{let parent=el.parentElement;while(parent&&!/(auto|scroll)/.test(getComputedStyle(parent).overflowY))parent=parent.parentElement;if(parent)parent.scrollTop=500;else window.scrollTo(0,500)});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Terms formatting"]').dataset.docked==='true');
  const box=await toolbar.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.y>0&&box.y+box.height<=900);
  await toolbar.getByRole('button',{name:'Add Dynamic Field',exact:true}).click();
  await picker.getByRole('button',{name:'Close dialog',exact:true}).click();
  await toolbar.evaluate(el=>{let parent=el.parentElement;while(parent&&!/(auto|scroll)/.test(getComputedStyle(parent).overflowY))parent=parent.parentElement;if(parent)parent.scrollTop=0;window.scrollTo(0,0)});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Terms formatting"]').dataset.docked==='false');
 }
 assert.deepEqual(errors,[]);console.log('Passed: cursor and selection insertion, cancel, undo, serializable save/reopen, repeated error toasts, desktop/mobile field picker.');
}finally{await browser.close();}
