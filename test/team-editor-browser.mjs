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
import {cottageTeamBlock} from './clients/cottage616/team-blocks';import strips from './clients/cottage616/page-strips.json';
const entries=['home-section-7','hive-section-4'].map(id=>{const block=cottageTeamBlock(strips.find(block=>block.id===id));return {block:{...block,pageIds:['home'],presentation:{...block.presentation,selector:'#'+id,bindings:[]}},payload:block.defaults,revision:0,pageIds:['home'],choices:[]}});
const manifest={version:1,id:'fixture',previewUrl:'https://site.example',pages:[{id:'home',label:'Home',path:'/'}],blocks:entries.map(entry=>entry.block)};
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
  return route.fulfill({contentType:'text/html',body:website?'<html><head><style>body{margin:0}section{height:600px;padding:20px;box-sizing:border-box}h2{margin:0}article{min-height:40px}</style></head><body>'+['home-section-7','hive-section-4'].map(id=>'<section id="'+id+'"><div class="team-grid"><article><div class="team-card__media"><img></div><h3></h3><p></p></article></div></section>').join('')+'<script data-editor-origins="https://editor.example">'+bridge+'</script></body></html>':'<html><head><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>'});
 });
 await page.goto('https://editor.example');await page.getByRole('button',{name:'Edit website',exact:true}).click();
 const preview=page.frameLocator('iframe[title="Home website preview"]');
 const settings=page.getByRole('region',{name:'Section settings'});
 for(const [id,label,count] of [['home-section-7','Cottage 616 team',4],['hive-section-4','The Hive team',2]]) {
  await preview.locator('#'+id+' article').nth(count-1).waitFor();
  await page.getByRole('navigation',{name:'Page sections'}).getByRole('button',{name:label,exact:true}).click();
  await settings.getByRole('button',{name:'Add team member',exact:true}).click();
  await preview.locator('#'+id+' article').nth(count).waitFor();
  await settings.getByLabel('Name',{exact:true}).last().fill('New teammate');
  await preview.locator('#'+id+' h3').filter({hasText:'New teammate'}).waitFor();
  assert((await settings.locator('textarea').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).resize))).every(value=>value==='none'));
  while(await settings.getByRole('button',{name:'Remove team member',exact:true}).count()) await settings.getByRole('button',{name:'Remove team member',exact:true}).last().click();
  await preview.locator('#'+id+' article').waitFor({state:'detached'});
  await settings.getByRole('button',{name:'Add team member',exact:true}).click();
  await preview.locator('#'+id+' article').waitFor();
 }
 assert.deepEqual(errors,[]);
 console.log('Passed: both team editors add/edit/remove all/re-add with live preview and nonresizable textareas.');
}finally{await browser.close()}
