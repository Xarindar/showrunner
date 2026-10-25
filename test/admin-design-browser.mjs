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
    import {ImageFramingControl} from './modules/content/studio/image-framing-control';
    import {ServiceBookingRulesTable} from './modules/scheduling/components/service-booking-rules-table';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    function Fixture() {
      const [open,setOpen]=useState(false);
      return <div className="showrunner-admin"><main className="admin-main">
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
        <Modal title="Shared dialog" open={open} onClose={()=>setOpen(false)}><Field label="Dialog field"><Input /></Field><div className="module-modal-actions"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel dialog</Button><Button>Confirm</Button></div></Modal>
      </main></div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` },
  bundle: true, outfile: `${output}.js`,
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
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${captures}/controls-mobile.png` });
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByRole("button", { name: /What should we prepare/ }).click();
  assert.equal(await page.locator('input[name="intakePrompt"]').inputValue(), "What should we prepare?");
  assert.equal(await page.locator(".booking-rule-type-cell").evaluate(element => getComputedStyle(element).display), "grid");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log("Passed: tenant isolation, shared field sizes, focus rings, dialog dismissal/focus return, crop mask/keyboard framing, mobile targets and overflow.");
} finally { await browser.close(); }
