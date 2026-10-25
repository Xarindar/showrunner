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
    import {ImageFramingControl} from './modules/content/studio/image-framing-control';
    import {ServiceBookingRulesTable} from './modules/scheduling/components/service-booking-rules-table';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    function Fixture() {
      const [open,setOpen]=useState(false);
      return <div className="showrunner-admin"><NotificationProvider><main className="admin-main" style={{height:'auto'}}>
        <div className="stack"><header className="page-header"><h1>Shared controls</h1><Button onClick={()=>setOpen(true)}>Open dialog</Button></header>
        <Card bodyClassName="form-grid"><Field label="Name"><Input placeholder="Name" /></Field>
          <Field label="Invalid"><Input aria-invalid="true" defaultValue="Needs correction" /></Field>
          <Field label="Disabled"><Input disabled defaultValue="Unavailable" /></Field>
          <div className="ui-cluster ui-gap-2"><Button>Save</Button><Button variant="secondary">Cancel</Button><Button variant="danger">Delete</Button><Button disabled>Disabled action</Button></div>
          <div className="ui-cluster ui-gap-2"><Badge>Neutral</Badge><Badge tone="success">Active</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Error</Badge></div>
          <Switch label="Published" defaultChecked />
          <ImageFramingControl source="/photo.svg" ratio={1} value={{}} onChange={value=>window.appliedCrop=value} />
          <ServiceBookingRulesTable idPrefix="fixture" intakeOptions={["What should we prepare?"]} policyOptions={[]} />
        </Card></div>
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
  await page.getByRole("region", { name: "Schedule fixture" }).screenshot({ path: `${captures}/schedule-desktop.png` });
  await input.focus();
  assert.match(await input.evaluate(element => getComputedStyle(element).boxShadow), /inset/);
  await page.screenshot({ path: `${captures}/controls-desktop.png` });
  await page.getByRole("button", { name: "Open dialog", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Shared dialog" });
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).borderRadius), "24px");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "Open dialog", exact: true }).evaluate(element => document.activeElement === element), true);
  await page.getByRole("button", { name: "Adjust framing", exact: true }).click();
  const frame = page.getByRole("button", { name: "Move crop frame" });
  await frame.waitFor();
  assert.match(await frame.evaluate(element => getComputedStyle(element).boxShadow), /999px/, "Crop mask must shade outside the selected region");
  await frame.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Apply framing", exact: true }).click();
  assert((await page.evaluate(() => window.appliedCrop.imagePositionX)) > 50);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual((await geometry()).slice(0, 3), ["12px", "44px", "16px"]);
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
  assert.deepEqual(errors, []);
  console.log("Passed: tenant isolation, shared field sizes, disclosure spacing/keyboard access, stack gaps, dialog dismissal/focus return, crop mask/keyboard framing, mobile targets and overflow.");
} finally { await browser.close(); }
