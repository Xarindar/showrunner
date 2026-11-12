import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve(mkdtempSync(resolve(tmpdir(),'mobile-menu-')),'fixture');
const captures=resolve('.impeccable/review/mobile-menu');mkdirSync(captures,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {AdminMobileMenu} from './shell/admin-mobile-menu';
import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
function Fixture(){const [screen,setScreen]=useState('loading');const [route,setRoute]=useState('a');
useEffect(()=>{window.setScreen=setScreen;window.setRoute=setRoute;},[]);
return <div className="showrunner-admin"><div className="admin-root">
<AdminMobileMenu routeKey={route} fallbackTitle="Sessions"><button className="admin-menu-toggle admin-page-menu" aria-label="Open admin menu" onClick={()=>window.menuClicks=(window.menuClicks||0)+1}>Menu</button></AdminMobileMenu>
<main className="admin-main">{screen==='detail'?<header className="page-header"><a href="/admin/modules/clients"><svg className="lucide-arrow-left" width="15" height="15"/>Ruby Anderson</a><h1>Faux upload test session</h1></header>:screen==='config'?<div className="has-mobile-shell-header"><header className="page-header"><h1>Package settings</h1></header></div>:screen==='editor'?<header className="page-header"><h1>Design Session</h1></header>:screen==='index'?<header className="page-header"><div><h1>Sessions</h1></div><button className="ui-button">New session</button></header>:screen==='custom'?<header><h1>Photo albums</h1></header>:screen==='calendar'?<header className="appointments-subtle-header" data-admin-page-header><div className="appointments-subtle-title"><span>Appointments</span><strong>November 5</strong></div><nav className="appointments-header-nav">Calendar range</nav><div className="appointments-header-actions">Calendar tools</div></header>:screen==='product'?<header className="product-studio-header"><h1>Product editor</h1></header>:null}
<section className="product-studio-page"><div style={{minHeight:1100}}>Editor content</div><footer className="product-studio-sticky-footer"><button className="ui-button">Save session</button></footer></section></main>
</div></div>};createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,outfile:output+'.js',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:517,height:764}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<style>'+readFileSync(output+'.css','utf8')+'</style><div id="root"></div><script>'+readFileSync(output+'.js','utf8')+'</script>');
 const menu=page.getByRole('button',{name:'Open admin menu',exact:true});
 await menu.waitFor();assert.equal(await page.locator('.admin-mobile-bar').count(),1,'Fallback exists only while a page header is missing');
 for(const screen of ['editor','index','product','custom','calendar']){
  await page.evaluate(screen=>window.setScreen(screen),screen);
  await page.locator('.admin-page-menu-anchor .admin-page-menu').waitFor();
  assert.equal(await page.locator('.admin-mobile-bar').count(),0,'No duplicate mobile top bar');
  assert.equal(await page.locator('.admin-page-menu-anchor').count(),1,'Exactly one shell anchor owns the menu');
  for(const width of [517,390]){
   await page.setViewportSize({width,height:764});
   await page.waitForFunction(screen=>{const header=document.querySelector(screen==='calendar'?'.appointments-subtle-title':'.admin-main header')?.getBoundingClientRect(),button=document.querySelector('.admin-page-menu-anchor button')?.getBoundingClientRect();return header&&button&&Math.abs(button.y+button.height/2-header.y-header.height/2)<2;},screen);

   const header=await page.locator('.admin-main header').boundingBox(),title=await page.locator(screen==='calendar'?'.appointments-subtle-title':'.admin-main header').boundingBox(),button=await menu.boundingBox(),save=await page.getByRole('button',{name:'Save session',exact:true}).boundingBox();
   assert(button.x>=header.x&&button.x+button.width<=header.x+header.width+1,'Menu fits inside the existing page header');
   assert(Math.abs(button.y+button.height/2-title.y-title.height/2)<2,'Menu is centered with the '+screen+' heading at '+width+'px');
   assert(button.y+button.height<save.y,'Menu never overlaps Save');
   assert.equal(button.width,44);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await menu.focus();await page.keyboard.press('Enter');
   await page.screenshot({path:captures+'/'+screen+'-'+width+'.png'});
  }
 }
 assert.equal(await page.evaluate(()=>window.menuClicks),10,'The anchored menu remains keyboard operable');
 for(const screen of ['detail','config']) {
  await page.evaluate(screen=>window.setScreen(screen),screen);
  await page.getByRole('heading',{name:screen==='detail'?'Faux upload test session':'Package settings',exact:true}).waitFor({state:'attached'});
  await menu.waitFor({state:'hidden'});
  assert.equal(await page.locator('.admin-mobile-bar').count(),0,'Details use only their own contextual header');
  await page.screenshot({path:captures+'/'+screen+'-390.png'});
 }
 await page.evaluate(()=>{window.setScreen('loading');window.setRoute('b')});
 await page.locator('.admin-mobile-bar').waitFor();assert.equal(await page.locator('[data-admin-menu-host]').count(),0,'Removed headers release the menu');
 await page.evaluate(()=>window.setScreen('editor'));
 await page.locator('.admin-page-menu-anchor .admin-page-menu').waitFor();
 await page.setViewportSize({width:1440,height:900});assert.equal(await menu.isVisible(),false,'Desktop navigation remains unchanged');
 assert.deepEqual(errors,[]);
 console.log('Passed: menu in existing editor/index/product/portfolio/calendar headers at 517/390px, no duplicate bar or Save overlap, late headers, route replacement, keyboard activation, and desktop hiding.');
}finally{await browser.close();}
