import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {ServiceCatalogTable} from './modules/scheduling/components/service-catalog-table';
  import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
  const services=['Design Session','Portrait Session','Family Session','Wedding Session','Creative Session'].map((name,index)=>({id:'session-'+index,name,bookingPath:'session-'+index,category:'Photography',description:'',durationMinutes:120,location:'',isActive:true,pricing:'$150',packageCount:1,tags:[]}));
  createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main" style={{height:'100vh',padding:16}}><ServiceCatalogTable services={services} initialCategory="all" initialTag="all" initialSearch="" categoryOptions={[{value:'all',label:'All categories'}]} tagOptions={[{value:'all',label:'All tags'}]} createAction={<a href="/admin/modules/services/new">New session</a>} toggleServiceAction={()=>{}}/></main></div>);
`},bundle:true,write:false,outdir:'.tmp/session-mobile-test',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent',plugins:[{name:'local-router',setup(build){
  build.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'local-router'}));
  build.onLoad({filter:/.*/,namespace:'local-router'},()=>({contents:'export function useRouter(){return {push(){},replace(){}}}',loader:'js'}));
}}]});
const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text,js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const captures=resolve('.impeccable/review/token-system');mkdirSync(captures,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
  const page=await browser.newPage({viewport:{width:530,height:764}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(`<style>${css}</style><div id="root"></div>`);await page.addScriptTag({content:js});
  const table=page.getByRole('region',{name:'Sessions table',exact:true});
  await table.waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Sessions table"]').dataset.tableLayout==='compact');
  assert.deepEqual(await table.getByRole('columnheader').allTextContents(),['Session','Status','Packages','Actions']);
  assert(await table.locator('tbody tr').count()>=3,'Compact rows show multiple sessions in the viewport');
  assert(await table.locator('tbody tr').first().evaluate(el=>el.getBoundingClientRect().height<100),'Rows remain compact');
  assert.equal(await table.getByRole('link',{name:'Edit Design Session',exact:true}).getAttribute('href'),'/admin/modules/services/session-0');
  assert.equal(await table.getByRole('link',{name:'Mark Design Session draft',exact:true}).getAttribute('href'),'/admin/modules/services?statusService=session-0');
  assert.equal(await table.locator('tbody tr').first().getByRole('link').count(),3,'Name, pencil and eye links stay available');
  assert(await table.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Mobile columns fit without horizontal scrolling');
  await page.screenshot({path:resolve(captures,'sessions-compact-mobile.png')});
  await page.getByRole('textbox',{name:'Search session, category, tag',exact:true}).fill('Portrait');
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Sessions table"] tbody tr').length===1);
  assert.equal(await table.getByRole('link',{name:'Portrait Session',exact:true}).count(),1);
  await page.getByRole('textbox',{name:'Search session, category, tag',exact:true}).fill('');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('region',{name:'Sessions table',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Sessions table"]').dataset.tableLayout==='table');
  assert.equal(await page.getByRole('region',{name:'Sessions table',exact:true}).locator('thead th').count(),8,'Desktop retains its full columns');
  assert.deepEqual(errors,[]);
  console.log('Passed: compact Session/Status/Packages/Actions headers, multiple mobile rows, pencil/eye actions, search and full desktop columns.');
}finally{await browser.close();}
