import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = mkdtempSync(resolve(tmpdir(), "showrunner-payments-hydration-"));
const fixture = `
  import React, {useEffect} from 'react';
  import {NotificationProvider} from './components/ui/notifications';
  import {PaymentsWorkspace} from './modules/payments/components/payments-workspace';
  const coupon = {amountCents: null, code: 'RANGE', createdAt: '2026-07-06T01:30:00.000Z',
    startsAt: '2026-07-07T00:30:00.000Z', endsAt: '2026-07-08T00:30:00.000Z',
    id: 'range', maxRedemptions: null, percentOff: 10, redemptionCount: 0, type: 'PERCENT'};
  function Fixture() {
    useEffect(() => { document.documentElement.dataset.hydrated = 'true'; }, []);
    return <NotificationProvider><PaymentsWorkspace
      timezone="America/Chicago" providers={[]} featuredConnected={false}
      methods={{connected: false, enabledKeys: [], options: []}}
      checkout={{anyConnected: false, disconnected: false, providers: []}}
      checkoutTotals={{freeShippingThresholdCents: null, shippingEnabled: false, shippingFlatCents: null,
        shippingLabel: 'Shipping', taxAppliesToShipping: false, taxEnabled: false, taxLabel: 'Tax', taxRateBps: null}}
      coupons={[coupon, {...coupon, id: 'start', code: 'START', endsAt: null},
        {...coupon, id: 'end', code: 'END', startsAt: null}, {...coupon, id: 'always', code: 'ALWAYS', startsAt: null, endsAt: null}]}
      webhooks={{stripe: '', square: '', paypal: ''}} /></NotificationProvider>;
  }
`;

// The first render has no open payment modal. Keep live payment actions and their server
// dependencies out of this fixture while exercising the real workspace, table and provider.
const plugins = [{
  name: "closed-payment-modals",
  setup(build) {
    build.onResolve({ filter: /^\.\/(connect-wizard|manage-modals)$/ }, args => ({ path: args.path, namespace: "closed-payment-modals" }));
    build.onLoad({ filter: /.*/, namespace: "closed-payment-modals" }, args => ({
      contents: args.path.endsWith("connect-wizard")
        ? "export const buildConnectWizards = () => ({}); export const ConnectWizard = () => null;"
        : "export const CheckoutModal = () => null, CheckoutTotalsModal = () => null, CouponModal = () => null, ManageProviderModal = () => null, MethodsModal = () => null;",
      loader: "js"
    }));
  }
}];
const options = { bundle: true, plugins, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" };
await build({ ...options, platform: "node", format: "cjs", outfile: resolve(output, "server.cjs"),
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `${fixture}
    import {renderToString} from 'react-dom/server';
    export const render = () => renderToString(<Fixture />);` }
});
await build({ ...options, platform: "browser", outfile: resolve(output, "client.js"),
  define: { ...options.define, "process.env": "{}" },
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `${fixture}
    import {hydrateRoot} from 'react-dom/client';
    window.hydrationErrors = [];
    hydrateRoot(document.getElementById('root'), <Fixture />, {
      onRecoverableError: error => window.hydrationErrors.push(error.message)
    });` }
});

const previousTimezone = process.env.TZ;
let html;
try {
  process.env.TZ = "UTC";
  html = require(resolve(output, "server.cjs")).render();
} finally {
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
}
const script = readFileSync(resolve(output, "client.js"), "utf8");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  for (const timezoneId of ["America/Chicago", "Asia/Tokyo"]) {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<html><head><meta charset="utf-8"></head><body><div id="root">${html}</div><script>${script}</script></body></html>` }));
    await page.goto("http://payments.example/admin/modules/payments");
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    assert.deepEqual(await page.evaluate(() => window.hydrationErrors), [], `${timezoneId}: hydration must preserve server text`);
    assert.deepEqual(errors, [], `${timezoneId}: no browser errors`);
    const rows = await page.locator("tbody tr").evaluateAll(rows => rows.map(row => [row.cells[3].textContent, row.cells[4].textContent]));
    assert.deepEqual(rows, [
      ["Jul 6, 2026 to Jul 7, 2026", "Jul 5, 2026"],
      ["Starts Jul 6, 2026", "Jul 5, 2026"],
      ["Ends Jul 7, 2026", "Jul 5, 2026"],
      ["Always available", "Jul 5, 2026"]
    ], `${timezoneId}: all coupon dates use the site's timezone`);
    await context.close();
  }
  console.log("Passed: UTC server render hydrates in Chicago and Tokyo without errors; coupon creation and availability use the site's timezone.");
} finally { await browser.close(); }
