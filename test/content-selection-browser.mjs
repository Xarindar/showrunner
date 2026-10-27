import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const require=createRequire(import.meta.url);const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve(mkdtempSync(resolve(tmpdir(),'section-selection-')),'fixture');
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {PuckContentEditor} from './modules/content/studio/puck-editor';
import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
const entries=Array.from({length:20},(_,i)=>({block:{id:'section-'+i,label:'Section '+(i+1),type:'strip',editableFields:['texts'],pageIds:['home'],fixedRows:true,presentation:{selector:'#section-'+i,bindings:[{path:'texts.0.text',selector:'#section-'+i+' h2'}]}},payload:{texts:[{id:'copy',text:'Section '+(i+1)}],images:[],links:[]},revision:0,pageIds:['home'],choices:[]}));
const manifest={version:1,id:'fixture',previewUrl:'http://site.example',pages:[{id:'home',label:'Home',path:'/'}],blocks:entries.map(entry=>entry.block)};
createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main"><PuckContentEditor manifest={manifest} entries={entries} canUpload={false} linkChoices={[]}/></main></div>);
`},bundle:true,outfile:output+'.js',plugins:[{name:'fixture',setup(b){
b.onResolve({filter:/^(\.\/actions|@\/components\/ui\/notifications|@\/components\/ui\/asset-picker)$/},a=>({path:a.path,namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('notifications')?'export const useNotify=()=>()=>{}':args.path.includes('asset-picker')?'export const AssetPicker=()=>null':'export async function saveStudioBlock(){return {revision:1}};export async function uploadStudioAsset(){}',loader:'js'}));
}}],define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
const js=readFileSync(output+'.js','utf8'),css=readFileSync(output+'.css','utf8'),bridge=readFileSync('public/showrunner-content.js','utf8');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
 await page.route('**/*',route=>{
  const website=new URL(route.request().url()).hostname==='site.example';
  return route.fulfill({contentType:'text/html',body:website?'<html><head><style>body{margin:0}section{height:600px;padding:20px;box-sizing:border-box}h2{margin:0}</style></head><body>'+Array.from({length:20},(_,i)=>'<section id="section-'+i+'"><h2>Section '+(i+1)+'</h2></section>').join('')+'<script data-editor-origins="http://editor.example">'+bridge+'</script></body></html>':'<html><head><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>'});
 });
 await page.goto('http://editor.example');await page.getByRole('button',{name:'Edit website',exact:true}).click();
 const preview=page.frameLocator('iframe[title="Home website preview"]');
 await preview.locator('#section-19[data-sr-section]').waitFor();
 const sections=page.getByRole('navigation',{name:'Page sections'});
 await sections.getByRole('button',{name:'Section 20',exact:true}).click();
 await preview.locator('#section-19[data-sr-selected]').waitFor();
 const website=page.frames().find(frame=>frame.url().startsWith('http://site.example'));
 await website.waitForFunction(()=>scrollY>10000);
 await website.evaluate(()=>scrollTo(0,0));
 await sections.getByRole('button',{name:'Section 20',exact:true}).click();
 await website.waitForFunction(()=>scrollY>10000);
 await website.evaluate(()=>scrollTo(0,0));
 await preview.locator('#section-0 h2').click();
 await page.waitForFunction(()=>document.querySelector('nav[aria-label="Page sections"] button[aria-current="true"]')?.textContent==='Section 1');
 const bounds=await sections.evaluate(nav=>{const selected=nav.querySelector('[aria-current="true"]').getBoundingClientRect();const box=nav.getBoundingClientRect();return {top:selected.top,bottom:selected.bottom,navTop:box.top,navBottom:box.bottom}});
 assert(bounds.top>=bounds.navTop-1&&bounds.bottom<=bounds.navBottom+1,'Preview click must reveal the selected sidebar row');
 await sections.evaluate(nav=>nav.scrollTop=nav.scrollHeight);
 await preview.locator('#section-0 h2').click();
 await page.waitForFunction(()=>{const nav=document.querySelector('nav[aria-label="Page sections"]');return nav.querySelector('[aria-current="true"]').getBoundingClientRect().top>=nav.getBoundingClientRect().top});
 const before=await website.evaluate(()=>scrollY);
 await page.getByRole('region',{name:'Section settings'}).locator('textarea').fill('Updated text');
 await preview.locator('#section-0 h2').filter({hasText:'Updated text'}).waitFor();
 assert.equal(await website.evaluate(()=>scrollY),before,'Typing must not move the preview');
 assert((await page.locator('textarea').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).resize))).every(value=>value==='none'),'Puck textareas must not resize');
 assert.deepEqual(errors,[]);
 console.log('Passed: actual Puck sidebar/iframe selection, repeated section reveal, sidebar visibility, and stable preview while editing.');
}finally{await browser.close()}
