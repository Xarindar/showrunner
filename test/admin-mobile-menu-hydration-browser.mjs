import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
mkdirSync(".tmp", { recursive: true });
const serverPath = resolve(".tmp/admin-menu-hydration.cjs");
await build({ entryPoints:["shell/admin-mobile-menu.tsx"], outfile:serverPath, bundle:true, platform:"node", packages:"external", jsx:"automatic", logLevel:"silent" });
const { AdminMobileMenu } = require(serverPath);
const h = React.createElement;
const header = () => h("header", { className:"page-header", style:{height:64} }, h("h1", null, "Session"));
const app = Header => h("div", {className:"admin-root"}, h(AdminMobileMenu,{fallbackTitle:"Showrunner",routeKey:"test"},h("button",{className:"admin-page-menu", "aria-label":"Open admin menu"},"Menu")), h("main",{className:"admin-main"},h(React.Suspense,{fallback:null},h(Header))));
const html = renderToString(app(header));
const client = await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
  import React from 'react';
  import {hydrateRoot} from 'react-dom/client';
  import {AdminMobileMenu} from './shell/admin-mobile-menu';
  let ready=false, release;
  const pending=new Promise(resolve=>{release=resolve});
  window.releaseHeader=()=>{ready=true;release()};
  window.recoverable=[];
  function Header(){if(!ready)throw pending;return <header className="page-header" style={{height:64}}><h1>Session</h1></header>}
  hydrateRoot(document.getElementById('root'),<div className="admin-root"><AdminMobileMenu fallbackTitle="Showrunner" routeKey="test"><button className="admin-page-menu" aria-label="Open admin menu">Menu</button></AdminMobileMenu><main className="admin-main"><React.Suspense fallback={null}><Header /></React.Suspense></main></div>,{onRecoverableError:error=>window.recoverable.push(error.message)});
`},bundle:true,write:false,format:"iife",jsx:"automatic",logLevel:"silent"});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const css=readFileSync('app/globals.css','utf8')+readFileSync('app/admin/design-tokens.css','utf8')+readFileSync('shell/admin.css','utf8');
  await page.setContent('<style>'+css+'</style><div class="showrunner-admin"><div id="root">'+html+'</div></div>');
  await page.addScriptTag({content:client.outputFiles[0].text});
  await page.locator('.admin-page-menu-anchor').waitFor({state:'visible'});
  assert.equal(await page.locator('.admin-main header button').count(),0,'Menu must not mutate an unhydrated page header');
  await page.evaluate(()=>window.releaseHeader());
  await page.getByRole('heading',{name:'Session',exact:true}).waitFor();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.deepEqual(await page.evaluate(()=>window.recoverable),[],'Deferred page hydration must complete without recovery');
  assert.deepEqual(errors,[]);
  const geometry=await page.evaluate(()=>{const header=document.querySelector('.admin-main header').getBoundingClientRect(),button=document.querySelector('.admin-page-menu-anchor button').getBoundingClientRect();return {vertical:Math.abs(header.y+header.height/2-button.y-button.height/2),right:header.right-button.right,count:document.querySelectorAll('.admin-page-menu').length}});
  assert(geometry.vertical<1);assert(Math.abs(geometry.right-16)<1);assert.equal(geometry.count,1);
  console.log('Passed: deferred header hydration has no DOM mutation or recovery; one mobile menu stays aligned to the header.');
} finally {await browser.close();}
