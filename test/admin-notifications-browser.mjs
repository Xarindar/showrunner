import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "showrunner-notifications-")), "fixture");
const captures = resolve(".impeccable/review/notifications");
mkdirSync(captures, { recursive: true });

// Real shared components and action state; no server, account changes or external requests.
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React, {useActionState, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {Notification, NotificationProvider, useNotify} from './components/ui/notifications';
    import {Button} from './components/ui/button';
    import {Modal} from './components/ui/modal';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    import './app/admin/notifications.css';
    function Fixture() {
      const notify = useNotify();
      const [open, setOpen] = useState(false);
      const [revision, setRevision] = useState(0);
      const [state, action] = useActionState(async () => ({error: 'Save failed. Try again.'}), {error: ''});
      return <main id="admin-main" tabIndex={-1} className="admin-main">
        <h1>Notification checks</h1>
        <Notification queryKey="saved">Changes saved.</Notification>
        <form action={action}><Button type="submit">Try save</Button></form>
        {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
        <Button onClick={() => setRevision(revision + 1)}>Unrelated render {revision}</Button>
        <Button onClick={() => notify('Saved.')}>Show success</Button>
        <Button onClick={() => notify('Connection failed. Try again.', 'danger')}>Show error</Button>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Editing">
          <Button onClick={() => notify('Dialog save failed. Try again.', 'danger')}>Save in dialog</Button>
        </Modal>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><NotificationProvider><Fixture /></NotificationProvider></div>);
  ` },
  bundle: true, outfile: `${output}.js`,
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent"
});

const js = readFileSync(`${output}.js`, "utf8");
const css = readFileSync(`${output}.css`, "utf8");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>` }));
  await page.clock.install();
  await page.goto("http://notifications.example/admin?saved=updated&tab=hours#weekday");
  await page.getByText("Changes saved.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).search, "?tab=hours");
  assert.equal(new URL(page.url()).hash, "#weekday");
  const notices = page.locator(".admin-notification");
  const dismiss = () => page.getByRole("button", { name: "Dismiss notification" }).click();
  await dismiss();

  await page.getByRole("button", { name: "Try save", exact: true }).click();
  await page.getByRole("alert").getByText("Save failed. Try again.", { exact: true }).waitFor();
  await dismiss();
  await page.getByRole("button", { name: /Unrelated render/ }).click();
  assert.equal(await notices.count(), 0, "Unrelated renders must not replay a dismissed result");
  await page.getByRole("button", { name: "Try save", exact: true }).click();
  await page.getByRole("alert").getByText("Save failed. Try again.", { exact: true }).waitFor();
  assert.equal(await notices.count(), 1, "Identical responses from another attempt must be announced again");
  await page.clock.runFor(30000);
  assert.equal(await notices.count(), 1, "Errors stay until dismissed");
  await dismiss();

  await page.getByRole("button", { name: "Show success", exact: true }).click();
  await page.getByText("Saved.", { exact: true }).waitFor();
  await notices.hover();
  await page.clock.runFor(6000);
  assert.equal(await notices.count(), 1, "Pointer hover pauses dismissal");
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "Dismiss notification" }).focus();
  await page.clock.runFor(6000);
  assert.equal(await notices.count(), 1, "Keyboard focus pauses dismissal");
  await page.getByRole("button", { name: "Show success", exact: true }).focus();
  await page.clock.runFor(5100);
  assert.equal(await notices.count(), 0, "Successes expire after focus leaves");

  await page.getByRole("button", { name: "Open dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save in dialog", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editing" });
  await dialog.locator(".admin-notification").waitFor();
  const colors = await notices.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, text: style.color };
  });
  const luminance = value => {
    const channels = value.match(/\d+/g).slice(0, 3).map(Number).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const light = Math.max(luminance(colors.text), luminance(colors.background));
  const dark = Math.min(luminance(colors.text), luminance(colors.background));
  assert((light + .05) / (dark + .05) >= 4.5, "Toast text must have readable contrast");
  await page.screenshot({ path: `${captures}/dialog-desktop.png`, animations: "disabled" });
  await dismiss();
  assert.equal(await dialog.evaluate(element => element === document.activeElement), true, "Dismissing a focused toast returns focus to its dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show error", exact: true }).click();
  await page.locator("main + .admin-notifications .admin-notification").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await notices.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390, "Mobile notifications stay inside the viewport");
  const dismissSize = await page.getByRole("button", { name: "Dismiss notification" }).boundingBox();
  assert(dismissSize.width >= 44 && dismissSize.height >= 44, "Mobile dismissal keeps a touch target");
  await page.screenshot({ path: `${captures}/error-mobile.png`, animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log("Passed: repeat action errors, deduplication, redirect consumption, persistent errors, hover/focus pause, dialog hosting/focus, contrast and mobile targets.");
} finally { await browser.close(); }
