import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const { build } = createRequire(import.meta.url)("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "showrunner-dialog-")), "fixture.js");
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {Dialog} from './components/ui/dialog';
    import {Modal} from './components/ui/modal';
    import {OnboardingModal} from './components/ui/onboarding-modal';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    function Fixture() {
      const [kind,setKind]=useState('');
      const [nested,setNested]=useState(false);
      const [busy,setBusy]=useState(false);
      const [closed,setClosed]=useState(0);
      const close=()=>{if(!busy){setKind('');setClosed(n=>n+1);}};
      const body=<><input aria-label="Draft" defaultValue="Keep this draft"/>
        <label><input type="checkbox" checked={busy} onChange={e=>setBusy(e.target.checked)}/>Busy</label>
        <button onClick={()=>setNested(true)}>Open nested</button>
        <form method="dialog"><button>Native close</button></form>
        <Modal open={nested && kind!==''} onClose={()=>setNested(false)} title="Nested dialog"><button onClick={()=>setNested(false)}>Done</button></Modal></>;
      return <div className="showrunner-admin"><main className="admin-main">
        {['standard','onboarding','custom','long'].map(name=><button key={name} onClick={()=>setKind(name)}>Open {name}</button>)}
        <output aria-label="Close count">{closed}</output>
        <Modal open={kind==='standard'} onClose={close} title="Standard dialog">{body}</Modal>
        <Modal open={kind==='long'} onClose={close} title="Long dialog"><div>{Array.from({length:40},(_,i)=><p key={i}>Scrollable row {i}</p>)}<button>Last action</button></div></Modal>
        <OnboardingModal open={kind==='onboarding'} onClose={close} title="Onboarding dialog" steps={[{id:'one',label:'Connect'}]} activeStepIndex={0}>{body}</OnboardingModal>
        <Dialog open={kind==='custom'} onClose={close} className="ui-dialog" aria-label="Custom dialog">{kind==='custom'?body:null}</Dialog>
      </main></div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` }, bundle: true, outfile: output, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent"
});
const js = readFileSync(output, "utf8");
const css = readFileSync(output.replace(/\.js$/, ".css"), "utf8");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<html><head><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>` }));
  await page.goto("http://dialog.example");
  let closed = 0;
  for (const kind of ["standard", "onboarding", "custom"]) {
    const trigger = page.getByRole("button", { name: `Open ${kind}`, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: `${kind[0].toUpperCase()}${kind.slice(1)} dialog` });
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
    await dialog.getByLabel("Draft", { exact: true }).fill("Unsaved draft");
    const box = await dialog.boundingBox();
    await page.mouse.click(box.x + 2, box.y + 2);
    assert.equal(await dialog.isVisible(), true, "Dialog padding must not count as backdrop");
    await dialog.getByLabel("Busy", { exact: true }).check();
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true, "A guarded close must leave the native modal open");
    assert.equal(await dialog.getByLabel("Draft", { exact: true }).inputValue(), "Unsaved draft");
    await dialog.getByLabel("Busy", { exact: true }).uncheck();
    await dialog.getByRole("button", { name: "Open nested" }).click();
    await page.getByRole("dialog", { name: "Nested dialog" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await dialog.getByRole("button", { name: "Open nested" }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.getByLabel("Close count").textContent(), String(++closed), "Close callback runs once");
    await trigger.click();
    await dialog.waitFor();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(1, 1);
    await page.mouse.up();
    assert.equal(await dialog.isVisible(), true, "Dragging from inside to backdrop must not dismiss");
    await page.mouse.click(1, 1);
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Close count").textContent(), String(++closed));
    await trigger.click();
    await dialog.getByRole("button", { name: "Native close" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(expected => document.querySelector('output').textContent === String(expected), closed + 1);
    assert.equal(await page.getByLabel("Close count").textContent(), String(++closed), "Native close synchronizes controlled state");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const kind of ["standard", "onboarding"]) {
    await page.getByRole("button", { name: `Open ${kind}`, exact: true }).click();
    const close = page.getByRole("dialog").getByRole("button", { name: /Close dialog|Close onboarding/ });
    const bounds = await close.boundingBox();
    assert(bounds.width >= 44 && bounds.height >= 44, "Dialog close controls share the mobile touch target");
    await close.click();
  }
  assert.deepEqual(errors, []);
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button',{name:'Open long',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Long dialog',exact:true});
    const body=dialog.locator(':scope > .ui-dialog-body');
    const shell=await dialog.boundingBox(),inside=await body.boundingBox();
    assert(inside.x>shell.x && inside.x+inside.width<shell.x+shell.width, 'Scrollbar stays inset from the rounded shell');
    assert(inside.y>shell.y && inside.y+inside.height<shell.y+shell.height);
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).overflow),'hidden');
    assert(await body.evaluate(el=>el.scrollHeight>el.clientHeight),'The body must scroll');
    const head=await dialog.getByRole('heading').boundingBox();
    await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    assert.deepEqual(await dialog.getByRole('heading').boundingBox(),head,'The header stays visible while the body scrolls');
    await dialog.getByRole('button',{name:'Last action',exact:true}).click();
    assert.equal(await dialog.evaluate(el=>el.scrollTop),0);
    await page.keyboard.press('Escape');
  }
  console.log("Passed: all dialog layouts share focus, guarded Escape, nested focus return, padding/backdrop and drag dismissal, native close synchronization.");
} finally { await browser.close(); }
