import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {SessionPackagesEditor} from './modules/scheduling/components/session-packages-editor';
  import {NotificationProvider} from './components/ui/notifications';
  import {sessionOfferingFormSchema} from './lib/scheduling/session-offering';
  import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
  window.submits=0;
  function Fixture(){return <div className="showrunner-admin"><main className="admin-main"><NotificationProvider>{['Existing session','New session'].map(label=><section aria-label={label} key={label}><h1>{label}</h1><form onSubmit={event=>{event.preventDefault();window.submits++;const result=sessionOfferingFormSchema.safeParse(new FormData(event.currentTarget).get('sessionOffering'));window.saved=result.success?result.data:result.error.issues;}}><SessionPackagesEditor isNew={label==='New session'} durationMinutes={30}/><button type="submit">Save session</button></form></section>)}</NotificationProvider></main></div>}
  createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,outdir:'.tmp/session-save-test',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent',plugins:[{name:'local-rates',setup(build){
  build.onResolve({filter:/^\.\.\/rate-actions$/},()=>({path:'rates',namespace:'local-rates'}));
  build.onLoad({filter:/.*/,namespace:'local-rates'},()=>({contents:`import {hourlyRateInputSchema} from './lib/scheduling/pricing';export async function saveHourlyRateAction(input){const value=hourlyRateInputSchema.parse(input);return {rate:{id:'saved-rate',name:value.name,amountCents:value.amount}}}`,resolveDir:process.cwd(),loader:'js'}));
  build.onResolve({filter:/^\.\.\/service-library-actions$/},()=>({path:'library',namespace:'local-library'}));
  build.onLoad({filter:/.*/,namespace:'local-library'},()=>({contents:'export async function saveServiceLibraryItemAction(){return {error:"Not used in this test"}}',loader:'js'}));
}}]});
const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text,js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://session.test/**',route=>route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div>`}));
  await page.goto('https://session.test/');await page.addScriptTag({content:js});
  const existing=page.getByRole('region',{name:'Existing session',exact:true});
  await existing.getByRole('button',{name:'Save session',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.saved)).tiers[0].hourlyRateId,null,'An untouched older flat-rate session submits valid data');
  const fresh=page.getByRole('region',{name:'New session',exact:true});
  await fresh.getByRole('button',{name:'Add package',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Package 1 name',exact:true}).fill('Portrait');
  await dialog.getByRole('spinbutton',{name:'Portrait price (USD)',exact:true}).fill('100');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await fresh.getByRole('button',{name:'Save session',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.saved)).tiers[0].hourlyRateId,null,'A new flat-rate package submits valid data');
  const submits=await page.evaluate(()=>window.submits);
  await fresh.getByRole('button',{name:'Edit Portrait',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'Pricing type',exact:true}).selectOption('HOURLY');
  await dialog.getByRole('combobox',{name:'Hourly rate',exact:true}).selectOption('__create_rate__');
  const rate=page.getByRole('dialog',{name:'New hourly rate',exact:true});
  await rate.getByRole('textbox',{name:'Rate name',exact:true}).fill('Photography');
  await rate.getByRole('spinbutton',{name:'Rate per hour (USD)',exact:true}).fill('125.50');
  await rate.getByRole('button',{name:'Save rate',exact:true}).click();
  await rate.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.submits),submits,'Saving a rate never submits the containing session');
  assert.equal(await dialog.getByRole('combobox',{name:'Hourly rate',exact:true}).inputValue(),'saved-rate');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await fresh.getByRole('button',{name:'Save session',exact:true}).click();
  const saved=await page.evaluate(()=>window.saved);
  assert.equal(saved.tiers[0].hourlyRateId,'saved-rate');assert.equal(saved.tiers[0].priceCents,6275);
  assert.deepEqual(errors,[]);
  console.log('Passed browser save flow: existing sessions, new flat-rate packages, inline rate creation and hourly package saves.');
}finally{await browser.close();}
