import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "table-pagination-")), "fixture");
const captures = resolve(".impeccable/review/token-system");
mkdirSync(captures, { recursive: true });
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React, {useState,useEffect} from 'react';
    import {createRoot} from 'react-dom/client';
    import {Pagination} from './components/ui/pagination';
    import {useCatalogTablePagination} from './modules/scheduling/components/use-catalog-table-pagination';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    function Fixture(){
      const [query,setQuery]=useState('');
      const [version,setVersion]=useState(0);
      useEffect(()=>{const update=()=>setVersion(v=>v+1);window.addEventListener('route',update);return()=>window.removeEventListener('route',update)},[]);
      const params=new URLSearchParams(location.search);
      const server=params.get('mode')==='server';
      const data=Array.from({length:100},(_,i)=>'Session '+String(i+1).padStart(3,'0')).filter(name=>name.includes(query));
      const client=useCatalogTablePagination(data.length);
      const pageSize=Number(params.get('pageSize')||25), page=Number(params.get('page')||1);
      const start=server?(page-1)*pageSize:client.startIndex;
      const end=server?Math.min(data.length,start+pageSize):client.endIndex;
      const rows=data.slice(start,end);
      return <div className="showrunner-admin"><main className="admin-main" style={{maxWidth:1100,margin:'4px auto'}}>
        <div className="stack"><header className="page-header"><h1>Services</h1></header>
        <section data-viewport-table style={{display:'grid',gap:12}}>
          <div><h2>Session types</h2><p aria-label="Record range">{data.length?start+1:0}–{end} of {data.length}</p></div>
          <input aria-label="Search" value={query} onChange={e=>{setQuery(e.target.value);client.firstPage()}} />
          <ul className="service-mobile-list">{rows.map(name=><li data-viewport-row key={name} style={{minHeight:88}}>{name}</li>)}</ul>
          <div className="catalog-table-scroll service-desktop-table"><table className="catalog-product-table"><thead><tr><th>Session type</th><th>Status</th><th>Duration</th></tr></thead><tbody>
            {rows.map(name=><tr key={name}><td><strong>{name}</strong><br/>Description of this service</td><td>Active</td><td>1 hour</td></tr>)}
            {!rows.length&&<tr><td colSpan={3}>No matching sessions.</td></tr>}
          </tbody></table></div>
          <Pagination label="Session pages" page={server?page:client.currentPage} pageCount={server?Math.ceil(data.length/pageSize):client.pageCount}
            pageSize={server?pageSize:undefined} onPageSizeChange={server?undefined:client.resizePage}
            onNext={client.nextPage} onPrevious={client.previousPage}
            nextHref={server?'?mode=server&status=active&page='+(page+1):undefined}
            previousHref={server?'?mode=server&status=active&page='+Math.max(1,page-1):undefined}/>
        </section></div>
      </main></div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` },
  outfile: `${output}.js`, bundle: true, logLevel: "silent",
  plugins: [{name:"router-fixture",setup(build){
    build.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const router={replace(href){window.routeCalls=(window.routeCalls||0)+1;history.replaceState({},'',href);window.dispatchEvent(new Event('route'))}};export function useRouter(){return router}`,loader:'js'}));
    build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link-fixture'}));
    build.onLoad({filter:/.*/,namespace:'link-fixture'},()=>({contents:`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,loader:'tsx',resolveDir:process.cwd()}));
  }}],
  define:{"process.env.NODE_ENV":'"production"'}
});
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://table.test/**',route=>route.fulfill({contentType:'text/html',body:`<html><head><style>${readFileSync(`${output}.css`,'utf8')}</style></head><body><div id="root"></div><script>${readFileSync(`${output}.js`,'utf8')}</script></body></html>`}));
  await page.goto('http://table.test/admin/modules/services');
  const count=()=>page.locator('.service-desktop-table tbody tr').count();
  const settled=async()=>{await page.waitForTimeout(650)};
  const fits=async()=>assert(await page.getByRole('navigation').evaluate(nav=>nav.getBoundingClientRect().bottom<=innerHeight-8),'Pagination fits in the viewport');
  await settled();
  const initial=await count();
  assert(initial>1&&initial<25);
  await fits();
  await page.screenshot({path:`${captures}/viewport-table-desktop.png`});
  await page.getByRole('button',{name:'Next'}).click();
  const firstBefore=await page.locator('tbody tr').first().innerText();
  await page.setViewportSize({width:1200,height:1100});await settled();
  const tall=await count();assert(tall>initial);
  assert(await page.locator('tbody').innerText().then(text=>text.includes(firstBefore.split('\n')[0])),'Resizing retains the prior first record');
  await fits();
  await page.setViewportSize({width:1200,height:620});await settled();
  assert(await count()<initial);await fits();
  await page.getByRole('textbox',{name:'Search'}).fill('not found');await settled();
  await page.getByText('No matching sessions.').waitFor();
  await page.getByRole('textbox',{name:'Search'}).fill('Session 001');await settled();
  assert.equal(await count(),1);
  await page.getByRole('textbox',{name:'Search'}).fill('');await settled();
  await page.setViewportSize({width:390,height:844});await settled();
  const mobileCount=await page.locator('[data-viewport-row]').count();
  assert(mobileCount>0&&mobileCount<25);await fits();
  assert(await page.evaluate(()=>{
    const nav=document.querySelector('nav');
    const row=document.querySelector('[data-viewport-row]');
    const inset=parseFloat(getComputedStyle(document.querySelector('.admin-main')).paddingBottom);
    return nav.getBoundingClientRect().bottom+row.getBoundingClientRect().height>innerHeight-inset;
  }),'Mobile capacity uses the available height');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${captures}/viewport-table-mobile.png`});
  await page.setViewportSize({width:1200,height:800});
  await page.goto('http://table.test/admin/modules/services?mode=server&status=active&page=2');await settled();
  const serverSize=Number(new URL(page.url()).searchParams.get('pageSize'));
  assert(serverSize>0&&serverSize<25);
  assert.equal(new URL(page.url()).searchParams.get('status'),'active');
  assert(await page.locator('tbody').innerText().then(text=>text.includes('Session 026')),'Server resizing retains the prior first record');
  assert.equal(new URL(await page.getByRole('link',{name:'Next'}).getAttribute('href'),'http://table.test').searchParams.get('pageSize'),String(serverSize));
  await fits();
  const routeCalls=await page.evaluate(()=>window.routeCalls);await settled();
  assert.equal(await page.evaluate(()=>window.routeCalls),routeCalls,'Page size stabilizes without navigation loops');
  await page.setViewportSize({width:1200,height:1100});await settled();
  assert(Number(new URL(page.url()).searchParams.get('pageSize'))>serverSize);await fits();
  assert.deepEqual(errors,[]);
  console.log('Passed: viewport row capacity, growing/shrinking screens, mobile cards, filtering, sparse/empty lists, server query preservation and stable navigation.');
} finally {await browser.close()}
