import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Synthetic component checks: no database, account changes or external requests.
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "showrunner-staff-")), "fixture");
const captures = resolve(".impeccable/review/staff");
mkdirSync(captures, { recursive: true });
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {StaffPanel} from './modules/scheduling/components/staff-panel';
    import {AvailabilityPanel} from './modules/scheduling/components/availability-panel';
    import {NotificationProvider} from './components/ui/notifications';
    import styles from './modules/appointments/schedule.module.css';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    const staff = [{id:'alex', name:'Alex Example', title:'Photographer', email:'alex@example.test', phone:'',bio:'',isActive:true,adminUserId:null}, {id:'inactive',name:'Inactive Employee',title:'',email:'',phone:'',bio:'',isActive:false,adminUserId:null}];
    const availability = [{id:'hours',staffId:'alex',resourceId:null,weekday:1,startMinutes:540,endMinutes:720,staff:staff[0],resource:null}];
    createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><NotificationProvider><main className="admin-main" style={{height:'auto'}}><div className={styles.page}>
      <h1>Staff</h1><StaffPanel staff={staff} availability={availability} timezone="America/Chicago" assignedStaffIds={new Set(['alex'])} staffIdsWithAvailability={new Set(['alex'])} adminUsers={[]} canLinkStaffAccounts={false} />
      <section aria-label="Schedule fixture"><AvailabilityPanel availability={availability} staff={[]} resources={[]} timezone="America/Chicago" /></section>
    </div></main></NotificationProvider></div>);
  ` },
  bundle: true, outfile: `${output}.js`,
  plugins: [{ name: "schedule-actions-fixture", setup(build) {
    build.onResolve({ filter: /^\.\.\/actions$/ }, args => args.importer.includes("scheduling") ? { path: "schedule-actions", namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function saveWeeklyHoursAction() { return { error: '', success: 'Hours saved.' }; } export async function createStaffMemberAction() {} export async function updateStaffMemberAction() {} export async function linkStaffMemberAdminUserAction() {}", loader: "js" }));
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
  await page.getByRole("heading", { name: "Staff", exact: true }).waitFor();
  await page.locator('summary').filter({hasText:'Alex Example'}).click();
  const roster = page.locator('details').filter({has:page.locator('input[value="alex"]')});
  assert.equal(await page.getByText('Linked admin account', {exact:true}).count(), 0);
  assert.equal(await roster.getByRole('button', {name:'Back to business hours'}).count(), 0);
  assert.match(await roster.innerText(), /9:00 AM.*12:00 PM/);
  assert.equal(await page.getByRole('region', {name:'Schedule fixture'}).getByText('Alex Example').count(), 0);
  await roster.getByRole('button', {name:'Edit Monday hours',exact:true}).click();
  const payload = JSON.parse(await page.locator('input[name="hours"]').inputValue());
  assert.equal(payload.staffId, 'alex');
  assert.equal(payload.resourceId, '');
  assert.deepEqual(payload.ranges, [{start:'09:00',end:'12:00'}]);
  await page.getByRole('button', {name:'Save hours',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.screenshot({path: captures + '/desktop.png', fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path: captures + '/mobile.png', fullPage:true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await roster.getByRole('button', {name:'Edit Tuesday hours',exact:true}).click();
  assert.equal(JSON.parse(await page.locator('input[name="hours"]').inputValue()).staffId, 'alex');
  await page.getByRole('button', {name:'Cancel',exact:true}).click();
  await page.locator('summary').filter({hasText:'Inactive Employee'}).click();
  const inactive = page.locator('details').filter({has:page.locator('input[value="inactive"]')});
  assert.equal(await inactive.getByRole('button', {name:'Edit Monday hours',exact:true}).isDisabled(), true);
  await page.locator('summary').filter({hasText:'Add staff'}).click();
  await page.locator('#staff-name').fill('New Employee');
  await page.locator('#staff-email').fill('new@example.test');
  assert.equal(await page.locator('#staff-name').inputValue(), 'New Employee');
  assert.deepEqual(errors, []);
  console.log('Passed: staff hours scope, saved ranges, save/cancel, inactive controls, permission-gated links, add form, Schedule separation and mobile overflow.');
} finally { await browser.close(); }
