import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const React=require('react');
const {renderToString}=require('react-dom/server');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
mkdirSync('.tmp',{recursive:true});
const fixture=resolve('.tmp/responsive-tables-fixture.tsx');
writeFileSync(fixture,`
import React,{useState} from 'react';
import {ResponsiveTableFrame} from '../components/ui/responsive-table';
import {Table} from '../components/ui/table';
import {Input} from '../components/ui/field';
import {Button} from '../components/ui/button';
import '../app/globals.css';import '../app/admin/design-tokens.css';import '../app/admin/design-system.css';
export function Fixture(){const [amount,setAmount]=useState('12');return <div className="showrunner-admin"><main className="admin-main" style={{height:'100vh',padding:16}}>
  <form id="table-edit-form" onSubmit={event=>{event.preventDefault();window.submitted=Object.fromEntries(new FormData(event.currentTarget));}}>
    <ResponsiveTableFrame className="catalog-table-scroll" aria-label="Editable records" role="region"><table className="catalog-product-table"><thead><tr>{['Name','Status','Category','Tags','Duration','Price','Quantity','Actions'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody><tr><td>Portrait session</td><td>Active</td><td>Photography</td><td>Featured</td><td>1 hr 30 min</td><td>$120.00</td><td><Input aria-label="Quantity" name="quantity" type="number" value={amount} onChange={event=>setAmount(event.target.value)} /></td><td><Button type="submit">Save</Button></td></tr></tbody></table></ResponsiveTableFrame>
  </form>
  <Table mobileLayout="columns" aria-label="Compact clients"><thead><tr><th data-mobile-column>Client</th><th>Email</th><th data-mobile-column>Status</th><th data-mobile-column>Actions</th></tr></thead><tbody><tr><td data-mobile-column>Sam Wilson</td><td>sam@example.com</td><td data-mobile-column>Booked</td><td data-mobile-column><Button type="button" aria-label="Contact Sam">Contact</Button></td></tr></tbody></Table>
  <Table aria-label="Small table"><thead><tr><th>Name</th><th>Count</th></tr></thead><tbody><tr><td>Small</td><td>2</td></tr></tbody></Table>
</main></div>}
`, 'utf8');
const server=resolve('.tmp/responsive-tables-ssr.cjs');
await build({entryPoints:[fixture],outfile:server,bundle:true,platform:'node',packages:'external',jsx:'automatic',logLevel:'silent'});
const html=renderToString(React.createElement(require(server).Fixture));
const client=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {hydrateRoot} from 'react-dom/client';import {Fixture} from './.tmp/responsive-tables-fixture';window.recoverable=[];hydrateRoot(document.getElementById('root'),<Fixture/>,{onRecoverableError:error=>window.recoverable.push(error.message)});`},bundle:true,write:false,outdir:'.tmp/responsive-tables-client',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},jsx:'automatic',logLevel:'silent'});
const css=client.outputFiles.find(file=>file.path.endsWith('.css')).text;
const js=client.outputFiles.find(file=>file.path.endsWith('.js')).text;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setContent('<style>'+css+'</style><div id="root">'+html+'</div>');
 await page.addScriptTag({content:js});
 const frame=page.getByRole('region',{name:'Editable records',exact:true});
 const small=page.getByRole('region',{name:'Small table',exact:true});
 const compact=page.getByRole('region',{name:'Compact clients',exact:true});
 await page.waitForFunction(()=>document.querySelector('[data-responsive-table-frame] td')?.hasAttribute('data-table-label'));
 assert.equal(await frame.getAttribute('data-table-layout'),'table');
 await frame.getByRole('spinbutton',{name:'Quantity'}).fill('3');
 await frame.getByRole('spinbutton',{name:'Quantity'}).evaluate(el=>{el.dataset.original='yes';});
 for(const width of [677,390,1440]){
  await page.setViewportSize({width,height:1000});
  if(width!==677) await page.waitForFunction(expected=>document.querySelector('[aria-label="Editable records"]').dataset.tableLayout===expected,width===1440?'table':'cards');
  else await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(expected=>document.querySelector('[aria-label="Small table"]').dataset.tableLayout===expected,width<=860?'cards':'table');
  assert.equal(await small.getAttribute('data-table-layout'),width<=860?'cards':'table','Phones use simplified rows even when a small table would fit');
  await page.waitForFunction(expected=>document.querySelector('div[aria-label="Compact clients"]').dataset.tableLayout===expected,width<=860?'compact':'table');
  if(width<=860) {
    assert.equal(await compact.getByRole('columnheader',{name:'Email',exact:true}).count(),0);
    assert.equal(await compact.locator('tbody tr').evaluate(el=>getComputedStyle(el).display),'table-row');
    assert.equal(await compact.getByRole('button',{name:'Contact Sam'}).count(),1);
    assert.equal(await small.locator('tbody tr').evaluate(el=>getComputedStyle(el).display),'grid');
    assert.equal(await small.locator('td').last().getAttribute('data-table-label'),'Count');
  }
  assert.equal(await frame.getByRole('spinbutton',{name:'Quantity'}).getAttribute('data-original'),'yes','The same controls survive layout changes');
  assert.equal(await frame.getByRole('spinbutton',{name:'Quantity'}).inputValue(),'3');
  assert.equal(await frame.locator('table').count(),1,'No separate mobile table or sizing probe remains');
  assert(await frame.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Every display mode fits its workspace');
 }
 await page.setViewportSize({width:390,height:1000});
 await frame.getByRole('button',{name:'Save',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.submitted),{quantity:'3'},'Sizing probes do not add submitted fields');
 assert.equal(await page.getByLabel('Quantity',{exact:true}).count(),1);
 const touch=await browser.newPage({viewport:{width:932,height:430},hasTouch:true,isMobile:true});
 await touch.setContent('<style>'+css+'</style><div id="root">'+html+'</div>');await touch.addScriptTag({content:js});
 await touch.waitForFunction(()=>Array.from(document.querySelectorAll('[data-responsive-table-frame]')).every(el=>el.dataset.tableLayout===(el.getAttribute('aria-label')==='Compact clients'?'compact':'cards')));
 assert.equal(await touch.getByRole('region',{name:'Small table',exact:true}).getAttribute('data-table-layout'),'cards','Landscape touch devices also use simplified rows');
 await touch.close();
 assert.deepEqual(await page.evaluate(()=>window.recoverable),[]);
 assert.deepEqual(errors,[]);
 console.log('Passed: one shared renderer, SSR hydration, content fit, small tables on mobile, retained edits/actions and clean form submission.');
}finally{await browser.close();}
