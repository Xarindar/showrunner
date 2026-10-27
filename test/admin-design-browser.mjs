import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Synthetic component checks: no database, account changes or external requests.
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "showrunner-design-")), "fixture");
const captures = resolve(".impeccable/review/token-system");
mkdirSync(captures, { recursive: true });
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {Button} from './components/ui/button';
    import {Input, Field} from './components/ui/field';
    import {Card} from './components/ui/card';
    import {Badge} from './components/ui/badge';
    import {Modal} from './components/ui/modal';
    import {Switch} from './components/ui/switch';
    import {NotificationProvider} from './components/ui/notifications';
    import {AvailabilityPanel} from './modules/scheduling/components/availability-panel';
    import {BlockoutsPanel} from './modules/scheduling/components/blockouts-panel';
    import scheduleStyles from './modules/appointments/schedule.module.css';
    import serviceStyles from './modules/scheduling/service-editor.module.css';
    import packageStyles from './modules/scheduling/components/session-packages-editor.module.css';
    import {Fields} from './modules/content/studio/editor';
    import {ContentFields,MobileContentEditing} from './modules/content/studio/content-fields';
    import studioStyles from './modules/content/studio/studio.module.css';
    import {ImageFramingControl, HeaderFrameRatios} from './modules/content/studio/image-framing-control';
    import {ServiceBookingRulesTable} from './modules/scheduling/components/service-booking-rules-table';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    function Fixture() {
      const [open,setOpen]=useState(false);
      const [mobile,setMobile]=useState(false);
      const [content,setContent]=useState({heading:"Desktop heading",copy:"Shared copy",imageUrl:"/photo.svg",imageAlt:"Photo",imagePositionX:50,imagePositionY:50,imageZoom:1});
      const [photo,setPhoto]=useState({url:"/photo.svg",alt:"Photo",imagePositionX:75,imagePositionY:30,imageZoom:2});
      return <div className="showrunner-admin"><NotificationProvider><main className="admin-main" style={{height:'auto'}}>
        <div className="stack"><header className="page-header"><h1>Shared controls</h1><Button onClick={()=>setOpen(true)}>Open dialog</Button></header>
        <Card bodyClassName="form-grid"><Field label="Name"><Input placeholder="Name" /></Field>
          <Field label="Invalid"><Input aria-invalid="true" defaultValue="Needs correction" /></Field>
          <Field label="Disabled"><Input disabled defaultValue="Unavailable" /></Field>
          <div className="ui-cluster ui-gap-2"><Button>Save</Button><Button variant="secondary">Cancel</Button><Button variant="danger">Delete</Button><Button disabled>Disabled action</Button></div>
          <div className="ui-cluster ui-gap-2"><Badge>Neutral</Badge><Badge tone="success">Active</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Error</Badge></div>
          <Switch label="Published" defaultChecked />
          <ImageFramingControl source="/slow-photo.svg" ratio={1} value={{}} onChange={value=>window.appliedCrop=value} />
          <ServiceBookingRulesTable idPrefix="fixture" intakeOptions={["What should we prepare?"]} policyOptions={[]} />
        </Card></div>
        <HeaderFrameRatios.Provider value={{portrait: 9/16}}><section aria-label="Image inspector" className={studioStyles.fields} style={{width:240}}><Fields fields={{url:{kind:'text',label:'Image'},alt:{kind:'text',label:'Alt'}}} prefix="portrait" value={photo} onChange={setPhoto} /></section></HeaderFrameRatios.Provider>
        <section aria-label="Responsive inspector" className={studioStyles.fields} style={{width:240}}>
          <button onClick={()=>setMobile(false)}>Edit desktop</button><button onClick={()=>setMobile(true)}>Edit mobile</button>
          <MobileContentEditing.Provider value={mobile}><HeaderFrameRatios.Provider value={{responsive:9/16}}><ContentFields block={{id:'responsive',type:'about',editableFields:['heading','copy','imageUrl'],pageIds:['home']}} value={content} onChange={setContent} canUpload choices={[]} linkOptions={{pages:[],services:[]}} /></HeaderFrameRatios.Provider></MobileContentEditing.Provider>
        </section>
        <section aria-label="Button settings fixture" className={studioStyles.fields} style={{width:240}}><Fields fields={{buttonLabel:{kind:'text',label:'Title'},buttonHref:{kind:'url',label:'Link'}}} prefix="button" value={{buttonLabel:'Book The Hive',buttonHref:'/booking'}} onChange={()=>{}} linkOptions={{pages:[{path:'/booking',label:'Booking'}],services:[]}} /></section>
        <section aria-label="Plain fields fixture" style={{width:240,display:'grid',gap:16}}><label>Plain name<input /></label><label>Plain notes<textarea /></label><label><input type="checkbox" />Keep checked</label></section>
        <section aria-label="Schedule fixture" className={scheduleStyles.page}>
          <h1>Schedule</h1>
          <AvailabilityPanel availability={[]} staff={[{id:'staff-1',name:'Staff member',isActive:true}]} resources={[]} timezone="America/Chicago" />
          <BlockoutsPanel blockouts={[]} resources={[]} timezone="America/Chicago" />
          <section className={scheduleStyles.settings}><details open><summary>Staff & resources <span>1 staff</span></summary><div className={scheduleStyles.section}><details><summary>Nested schedule settings</summary><p>Settings content</p></details></div></details></section>
          <Card bodyClassName="ui-stack" data-testid="stack-card"><p>First group</p><p>Second group</p></Card>
          <div className={serviceStyles.page}><div className={serviceStyles.createGrid}><section className="studio-panel"><div className={packageStyles.editor}><label>Package price<input aria-label="Package price" type="number" /></label></div></section></div></div>
        </section>
        <Modal title="Shared dialog" open={open} onClose={()=>setOpen(false)}><Field label="Dialog field"><Input /></Field><div className="module-modal-actions"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel dialog</Button><Button>Confirm</Button></div></Modal>
      </main></NotificationProvider></div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` },
  bundle: true, outfile: `${output}.js`,
  plugins: [{ name: "schedule-actions-fixture", setup(build) {
    build.onResolve({ filter: /asset-picker$/ }, args => args.importer.endsWith("editor.tsx") ? {path:"asset-picker",namespace:"image-fixture"} : undefined);
    build.onResolve({ filter: /^\.\/actions$/ }, args => args.importer.endsWith("editor.tsx") ? {path:"actions",namespace:"image-fixture"} : undefined);
    build.onLoad({filter: /.*/, namespace:"image-fixture"}, args => ({contents: args.path === "actions" ? "export async function uploadStudioAsset() {}" : `import React from 'react'; export function AssetPicker({children,triggerClassName,onSelectAsset,onUploadedAssets}) {return <><button className={triggerClassName} onClick={()=>onSelectAsset({url:'/replacement-photo.svg',alt:'Selected photo'})}>{children}</button><button onClick={()=>onUploadedAssets([{url:'/uploaded-photo.svg',alt:'Uploaded photo'}])}>Complete upload</button></>}`,loader:"tsx",resolveDir:process.cwd()}));
    build.onResolve({ filter: /^\.\.\/actions$/ }, args => args.importer.includes("scheduling") ? { path: "schedule-actions", namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function saveWeeklyHoursAction() { return { error: '', success: 'Hours saved.' }; } export async function createBlockoutAction() {} export async function deleteBlockoutAction() {}", loader: "js" }));
  } }],
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent"
});
const js = readFileSync(`${output}.js`, "utf8");
const css = readFileSync(`${output}.css`, "utf8");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.fulfill(route.request().url().endsWith("photo.svg")
    ? { contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#789"/></svg>' }
    : { contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>` }));
  await page.goto("http://design.example");
  await page.getByRole("heading", { name: "Shared controls" }).waitFor();
  const input = page.getByPlaceholder("Name", { exact: true });
  const geometry = () => input.evaluate(element => { const style = getComputedStyle(element); return [style.borderRadius, style.minHeight, style.fontSize, style.backgroundColor, style.fontFamily]; });
  const baseline = await geometry();
  assert.match(baseline[4], /sans-serif/, "Admin font must have a working fallback without Next font injection");
  assert.deepEqual(baseline.slice(0, 3), ["12px", "30px", "13px"]);
  await page.evaluate(() => { document.body.style.cssText = "--color-surface:magenta;--color-brand:red;--space-4:999px;--radius-control:0;--font-sans:serif"; });
  assert.deepEqual(await geometry(), baseline, "Tenant values must not alter admin controls");
  assert.equal(await page.locator(".ui-card-slot[aria-hidden]").count(), 0);
  const scopeSummary = page.locator("summary").filter({ hasText: /^Staff & resource hours$/ });
  const closureSummary = page.locator("summary").filter({ hasText: /^Add closure$/ });
  const summaryGeometry = locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.paddingTop, style.paddingBottom, style.minHeight, style.fontWeight];
  });
  assert.deepEqual(await summaryGeometry(scopeSummary), ["12px", "12px", "44px", "500"]);
  assert.deepEqual(await summaryGeometry(closureSummary), await summaryGeometry(scopeSummary));
  assert.deepEqual(await summaryGeometry(page.locator("summary").filter({ hasText: /^Nested schedule settings$/ })), await summaryGeometry(scopeSummary));
  const closureCard = await page.getByRole("region", { name: "Closures", exact: true }).locator(".ui-card").first().boundingBox();
  const closureHeading = await closureSummary.boundingBox();
  assert.equal(closureHeading.y - closureCard.y - closureCard.height, 16, "Closures and Add closure use the shared stack gap");
  assert.equal(await page.getByTestId("stack-card").locator(".ui-card-body").evaluate(element => getComputedStyle(element).gap), "16px");
  const packageInput = page.getByRole("spinbutton", { name: "Package price" });
  assert.equal(await packageInput.evaluate(element => getComputedStyle(element).minHeight), "30px", "Service editors reuse shared desktop controls");
  await closureSummary.focus();
  await page.keyboard.press("Space");
  assert.equal(await closureSummary.evaluate(element => element.parentElement.open), true, "Native disclosure remains keyboard operable");
  const buttonSettings = page.getByRole('region',{name:'Button settings fixture'});
  async function checkLabelSpacing() {
    for (const name of ['Link to','Page']) {
      const control=buttonSettings.locator(name==='Link to'?'select[id="button-buttonHref-type"]':'select[id="button-buttonHref"]');
      assert.deepEqual(await control.evaluate(element=>{const label=element.closest('label');const style=getComputedStyle(label);return [style.display,style.rowGap,Math.round(element.getBoundingClientRect().width),Math.round(label.getBoundingClientRect().width)]}),['grid','8px',240,240]);
    }
    const plain=page.getByRole('region',{name:'Plain fields fixture'});
    assert.equal(await plain.getByLabel('Plain name',{exact:true}).evaluate(element=>getComputedStyle(element.parentElement).rowGap),'8px');
    assert.equal(await plain.getByLabel('Keep checked').evaluate(element=>getComputedStyle(element.parentElement).display),'block');
  }
  await checkLabelSpacing();
  await buttonSettings.screenshot({path: `${captures}/button-spacing-desktop.png`});
  await page.getByRole("region", { name: "Schedule fixture" }).screenshot({ path: `${captures}/schedule-desktop.png` });
  await input.focus();
  assert.match(await input.evaluate(element => getComputedStyle(element).boxShadow), /inset/);
  await page.screenshot({ path: `${captures}/controls-desktop.png` });
  await page.getByRole("button", { name: "Open dialog", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Shared dialog" });
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).borderRadius), "24px");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "Open dialog", exact: true }).evaluate(element => document.activeElement === element), true);
  let releasePhoto;
  const photoReady = new Promise(resolve => { releasePhoto = resolve; });
  await page.route("**/slow-photo.svg", async route => { await photoReady; await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#789"/></svg>' }); });
  await page.getByRole("button", { name: "Adjust framing", exact: true }).first().click();
  const cropDialog = page.getByRole("dialog", { name: "Adjust image framing" });
  const beforePhoto = await cropDialog.boundingBox();
  assert(beforePhoto.height > 480, "Reserve the photo canvas before the image arrives");
  assert.equal(await cropDialog.locator('img').evaluate(image => image.complete), false, "Image is still loading during the reserved-space check");
  releasePhoto();
  const frame = page.getByRole("button", { name: "Move crop frame" });
  await frame.waitFor();
  assert.equal((await cropDialog.boundingBox()).height, beforePhoto.height, "Loading the image must not grow the dialog");
  assert.equal(await cropDialog.locator('.ui-dialog-body').evaluate(element => element.scrollWidth > element.clientWidth), false, "Full-width slider must not cause horizontal scrolling");
  await cropDialog.screenshot({ path: `${captures}/crop-desktop.png` });
  assert.match(await frame.evaluate(element => getComputedStyle(element).boxShadow), /999px/, "Crop mask must shade outside the selected region");
  await frame.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Apply framing", exact: true }).click();
  assert((await page.evaluate(() => window.appliedCrop.imagePositionX)) > 50);
  const inspector = page.getByRole('region', {name:'Image inspector'});
  const thumbnail = inspector.locator('img');
  assert.deepEqual(await thumbnail.evaluate(image => {const style=getComputedStyle(image); const box=image.parentElement.getBoundingClientRect(); return [Math.round(box.width/box.height*1000),style.objectPosition,style.transform];}), [563,'75% 30%','matrix(2, 0, 0, 2, 0, 0)']);
  await inspector.getByRole('button', {name:'Choose or upload'}).click();
  await cropDialog.waitFor();
  await frame.waitFor();
  assert.equal(await cropDialog.getByRole('slider').inputValue(), '1', 'Selecting a photo opens a centered fresh crop, even when selecting the same source');
  await cropDialog.getByRole('slider').fill('1.5');
  await cropDialog.getByRole('button', {name:'Apply framing'}).click();
  assert.equal(await thumbnail.evaluate(image => getComputedStyle(image).transform), 'matrix(1.5, 0, 0, 1.5, 0, 0)', 'Inspector reflects applied framing');
  await inspector.getByRole('button', {name:'Complete upload'}).click();
  await cropDialog.waitFor();
  assert.equal(await cropDialog.getByRole('slider').inputValue(), '1', 'Completed uploads open fresh framing automatically');
  await page.keyboard.press('Escape');
  const responsive = page.getByRole('region', {name:'Responsive inspector'});
  await responsive.getByRole('button', {name:'Edit mobile',exact:true}).click();
  await responsive.getByLabel('Heading',{exact:true}).fill('Mobile heading');
  await responsive.getByRole('button', {name:'Choose or upload'}).click();
  await cropDialog.waitFor(); await frame.waitFor();
  await cropDialog.getByRole('button',{name:'Apply framing'}).click();
  assert.match(await responsive.locator('img').getAttribute('src'), /replacement-photo/);
  await responsive.getByRole('button',{name:'Edit desktop',exact:true}).click();
  assert.equal(await responsive.getByLabel('Heading',{exact:true}).inputValue(),'Desktop heading');
  assert.equal(await responsive.locator('img').getAttribute('src'),'/photo.svg');
  await responsive.getByLabel('Copy',{exact:true}).fill('New shared copy');
  await responsive.getByRole('button',{name:'Edit mobile',exact:true}).click();
  assert.equal(await responsive.getByLabel('Heading',{exact:true}).inputValue(),'Mobile heading');
  assert.equal(await responsive.getByLabel('Copy',{exact:true}).inputValue(),'New shared copy');
  await responsive.getByRole('button',{name:'Use desktop content for this section'}).click();
  assert.equal(await responsive.getByLabel('Heading',{exact:true}).inputValue(),'Desktop heading');
  assert.equal(await responsive.locator('img').getAttribute('src'),'/photo.svg');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual((await geometry()).slice(0, 3), ["12px", "44px", "16px"]);
  await checkLabelSpacing();
  await buttonSettings.screenshot({path: `${captures}/button-spacing-mobile.png`});
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).evaluate(element => getComputedStyle(element).minHeight), "44px");
  assert.deepEqual(await packageInput.evaluate(element => { const style = getComputedStyle(element); return [style.minHeight, style.fontSize]; }), ["44px", "16px"], "Service editors reuse shared mobile controls");
  assert.deepEqual(await summaryGeometry(closureSummary), await summaryGeometry(scopeSummary));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("region", { name: "Schedule fixture" }).screenshot({ path: `${captures}/schedule-mobile.png` });
  await page.screenshot({ path: `${captures}/controls-mobile.png` });
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByRole("button", { name: /What should we prepare/ }).click();
  assert.equal(await page.locator('input[name="intakePrompt"]').inputValue(), "What should we prepare?");
  assert.equal(await page.locator(".booking-rule-type-cell").evaluate(element => getComputedStyle(element).display), "grid");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "Adjust framing", exact: true }).first().click();
  await frame.waitFor();
  assert.equal(await cropDialog.locator('.ui-dialog-body').evaluate(element => element.scrollWidth > element.clientWidth), false, "Mobile crop dialog must not scroll horizontally");
  await cropDialog.screenshot({ path: `${captures}/crop-mobile.png` });
  await page.keyboard.press("Escape");
  const live = await browser.newPage({viewport:{width:1200,height:800}});
  await live.setContent('<h1 id="heading"></h1><div><img id="photo"></div>');
  await live.addScriptTag({content:readFileSync('public/showrunner-content.js','utf8')});
  await live.evaluate(() => window.dispatchEvent(new CustomEvent('showrunner:content',{detail:{blocks:[{id:'responsive',type:'strip',presentation:{bindings:[{path:'heading',selector:'#heading'},{path:'imageUrl',selector:'#photo',attribute:'src'}]},payload:{heading:'Desktop live',imageUrl:'https://example.com/desktop.jpg',imagePositionX:50,imagePositionY:50,imageZoom:1},mobilePayload:{heading:'Mobile live',imageUrl:'https://example.com/mobile.jpg',imagePositionX:25,imagePositionY:70,imageZoom:2}}]}})));
  assert.equal(await live.locator('h1').textContent(),'Desktop live');
  await live.setViewportSize({width:390,height:844});
  await live.waitForFunction(()=>document.querySelector('h1').textContent==='Mobile live');
  assert.match(await live.locator('img').getAttribute('src'),/mobile.jpg/);
  assert.equal(await live.locator('img').evaluate(image=>image.style.transform),'scale(2)');
  await live.setViewportSize({width:1200,height:800});
  await live.waitForFunction(()=>document.querySelector('h1').textContent==='Desktop live');
  assert.match(await live.locator('img').getAttribute('src'),/desktop.jpg/);
  await live.close();
  assert.deepEqual(errors, []);
  console.log("Passed: tenant isolation, shared field sizes, disclosure spacing/keyboard access, stack gaps, dialog dismissal/focus return, crop mask/keyboard framing, mobile targets and overflow.");
} finally { await browser.close(); }
