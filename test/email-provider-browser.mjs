import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:http";

// Real UI and tokens, with provider actions replaced so this never sends mail or changes an account.
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(mkdtempSync(resolve(tmpdir(), "email-provider-")), "fixture");
const captures = resolve(".impeccable/review/email-provider");
mkdirSync(captures, { recursive: true });
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EmailConnectionPanel} from './modules/settings/email-connection-panel';
    import {SettingsNav} from './modules/settings/settings-nav';
    import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css';
    const state=new URLSearchParams(location.search).get('state'); window.actions=[];
    const connection=state==='empty'?null:{kind:'ionos',fromName:'Studio',fromEmail:'bookings@studio.example',replyToEmail:'owner@example.com',smtpHost:'smtp.ionos.com',smtpPort:465,smtpUser:'bookings@studio.example',revision:1,connectionError:state==='error'?'Check the API key and verify your sender domain.':''};
    createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main"><div className="stack"><header className="page-header"><h1>Email</h1></header><div className="admin-settings-layout"><SettingsNav active="email"/><div className="stack"><EmailConnectionPanel connection={connection} businessName="Studio" contactEmail="owner@example.com"/></div></div></div></main></div>);
  ` }, bundle: true, outfile: output + ".js", jsx: "automatic",
  plugins: [{ name: "fixture", setup(b) {
    b.onResolve({ filter: /email-actions$/ }, () => ({ path: "actions", namespace: "fixture" }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "tsx", resolveDir: process.cwd(), contents: args.path === "actions" ? `
      export async function saveEmailProviderAction(previous,form){const intent=form.get('intent');window.actions.push(intent);window.submitted=Object.fromEntries(form);await new Promise(resolve=>setTimeout(resolve,100));if(window.failTest)return {error:'Test failed. Check your sender verification.'};if(intent==='save')window.saved=true;return {error:'',testToken:'test-proof',testedVersion:String(form.get('detailsVersion'))}}
      export async function sendProviderTestEmailAction(){window.actions.push('test-existing')}
      export async function disconnectEmailProviderAction(){window.actions.push('disconnect')}
    ` : `import React from 'react';export default function Link({href,...props}){return <a href={href} {...props}/>} ` }));
  } }], define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent"
});
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (['/provider-logos/gmail.png','/provider-logos/ionos.png'].includes(path)) {res.setHeader('Content-Type','image/png');res.end(readFileSync(resolve('public'+path)));return;}
  if (path === "/fixture.js" || path === "/fixture.css") {
    res.setHeader("Content-Type", path.endsWith("js") ? "text/javascript" : "text/css");
    res.end(readFileSync(output + (path.endsWith("js") ? ".js" : ".css"))); return;
  }
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const errors = [];
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const [width,height] of [[1094,668],[390,844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width === 390, isMobile: width === 390 });
    page.on('pageerror', error => errors.push(error.message));
    for (const state of ['empty','connected','error']) {
      await page.goto(origin+'/?state='+state);
      await page.getByRole('region',{name:'Email connection'}).waitFor();
      assert.equal(await page.getByText('Changing your domain?',{exact:true}).count(),0);
      assert.equal(await page.getByRole('heading',{name:'Customer emails'}).count(),0);
      assert.equal(await page.getByRole('dialog').count(),0);
      if(state==='empty') {
        assert.equal(await page.locator('[name="secret"]').count(),0);
        await page.getByRole('button',{name:'Set up email',exact:true}).click();
        const dialog=page.getByRole('dialog'); await dialog.waitFor();
        const gmail=dialog.getByRole('button',{name:'Gmail / Google Workspace',exact:true});
        assert.equal(await gmail.getAttribute('aria-pressed'),null);
        const tiles=[gmail,dialog.getByRole('button',{name:'IONOS',exact:true}),dialog.getByRole('button',{name:'Other SMTP',exact:true})];
        for(const tile of tiles){const box=await tile.boundingBox();assert(Math.abs(box.width-box.height)<=1);assert(await tile.evaluate(el=>parseFloat(getComputedStyle(el).borderRadius)<el.clientWidth/4));}
        for(const logo of await dialog.locator('img').all()) {
          assert((await logo.getAttribute('src')).endsWith('.png'));
          assert(await logo.evaluate(async img=>{await img.decode();return img.naturalWidth>0&&getComputedStyle(img.parentElement).backgroundColor==='rgba(0, 0, 0, 0)'}));
        }
        await page.screenshot({path:resolve(captures,'provider-tiles-'+width+'.png'),fullPage:true});
        await gmail.click();
        await page.getByRole('heading',{name:'Check your Google account',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).count(),0);
        assert(await page.getByRole('button',{name:'Yes',exact:true}).evaluate(el=>el.parentElement.classList.contains('module-modal-actions')));
        assert(await page.getByRole('button',{name:'Back',exact:true}).evaluate(el=>el.parentElement.textContent.includes('Step')));
        await page.screenshot({path:resolve(captures,'gmail-question-'+width+'.png'),fullPage:true});
        await page.getByRole('button',{name:'Yes',exact:true}).click();
        await page.getByRole('heading',{name:'Create and copy your app password',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'Open app passwords',exact:true}).getAttribute('href'),'https://myaccount.google.com/apppasswords');
        assert((await dialog.innerText()).includes('Copy the entire 16-character app password'));
        assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
        await page.locator('[name="secret"]').fill('   ');
        assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
        assert.deepEqual(await page.evaluate(()=>window.actions),[]);
        await page.locator('[name="secret"]').fill('abcd efgh ijkl mnop');
        await page.screenshot({path:resolve(captures,'gmail-password-'+width+'.png'),fullPage:true});
        await page.getByRole('button',{name:'Next',exact:true}).click();
        await page.getByRole('heading',{name:'Add your sending details',exact:true}).waitFor();
        assert.equal(await page.locator('[name="fromName"]').inputValue(),'');
        assert.equal(await page.locator('[name="fromEmail"]').inputValue(),'');
        assert.equal(await page.locator('[name="fromName"]').getAttribute('placeholder'),'Studio');
        await page.locator('[name="fromName"]').fill('My studio');
        await page.locator('[name="fromEmail"]').fill('draft@studio.example');
        await page.getByRole('button',{name:'Back',exact:true}).click();
        assert.equal(await page.locator('[name="secret"]').inputValue(),'abcd efgh ijkl mnop');
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'No',exact:true}).click();
        await page.getByRole('heading',{name:'Enable 2-Step Verification',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'Set up 2-Step Verification',exact:true}).getAttribute('href'),'https://myaccount.google.com/signinoptions/two-step-verification');
        await page.screenshot({path:resolve(captures,'gmail-two-factor-'+width+'.png'),fullPage:true});
        await page.getByRole('button',{name:'I’ve enabled 2-Step Verification',exact:true}).click();
        await page.getByRole('heading',{name:'Create and copy your app password',exact:true}).waitFor();
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'IONOS',exact:true}).click();
        assert.equal(await page.getByRole('link',{name:'Check your login in IONOS Webmail',exact:true}).getAttribute('href'),'https://mail.ionos.com/');
        assert.equal(await page.locator('[name="smtpHost"]:not([type="hidden"])').count(),0);
        assert.equal(await page.locator('[name="secret"]').inputValue(),'');
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'Other SMTP',exact:true}).click();
        assert.equal(await page.locator('[name="fromEmail"]').inputValue(),'draft@studio.example');
        await page.locator('[name="smtpHost"]').fill('smtp.provider.example');
        await page.locator('[name="smtpUser"]').fill('owner');
        await page.locator('[name="secret"]').fill('test-secret');
        await page.getByRole('button',{name:'Next',exact:true}).click();
        await page.getByRole('heading',{name:'Check it works',exact:true}).waitFor();
        assert.deepEqual(await page.evaluate(()=>window.actions),[]);
        assert.equal(await page.locator('[name="testEmail"]').count(),0);
        assert.equal(await page.locator('[name="replyToEmail"]').count(),0);
        assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isDisabled(),true);
        await page.evaluate(()=>window.failTest=true);
        await page.getByRole('dialog').getByRole('button',{name:'Send test email',exact:true}).click();
        await page.getByRole('alert').waitFor();
        assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.submitted.kind),'smtp');
        assert.equal(await page.evaluate(()=>window.submitted.smtpHost),'smtp.provider.example');
        await page.getByRole('button',{name:'Back',exact:true}).click();
        assert.equal(await page.locator('[name="secret"]').inputValue(),'test-secret');
        await page.getByRole('button',{name:'Next',exact:true}).click();
        await page.evaluate(()=>window.failTest=false);
        await page.getByRole('dialog').getByRole('button',{name:'Send test email',exact:true}).click();
        await page.getByText('Test email sent. Check your inbox, then choose Done to save this connection.',{exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isEnabled(),true);
        assert.deepEqual(await page.evaluate(()=>window.actions),['test','test']);
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.locator('[name="fromEmail"]').fill('changed@studio.example');
        await page.getByRole('button',{name:'Next',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isDisabled(),true);
        await page.getByRole('dialog').getByRole('button',{name:'Send test email',exact:true}).click();
        await page.getByText('Test email sent. Check your inbox, then choose Done to save this connection.',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Done',exact:true}).click();
        await page.waitForFunction(()=>window.saved===true);
        assert.deepEqual(await page.evaluate(()=>window.actions),['test','test','test','save']);
        await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        assert.equal(await page.getByRole('dialog').count(),0);
        await page.getByRole('button',{name:'Set up email',exact:true}).click();
        await page.getByRole('heading',{name:'Choose your provider',exact:true}).waitFor();
        assert.equal(await page.locator('[name="secret"]').inputValue(),'');
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(),0);
      } else {
        if(state==='error')await page.getByText('Needs attention',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Change provider or email',exact:true}).click();
        assert.equal(await page.locator('[name="kind"]').inputValue(),'ionos');
        assert.equal(await page.locator('[name="fromName"]').inputValue(),'');
        assert.equal(await page.locator('[name="fromEmail"]').inputValue(),'');
        assert.equal(await page.locator('[name="secret"]').inputValue(),'');
        await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        await page.getByRole('button',{name:'Send test email',exact:true}).click();
        await page.waitForFunction(()=>window.actions.includes('test-existing'));
        await page.getByRole('button',{name:'Disconnect',exact:true}).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>window.actions),['test-existing']);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Modal email setup passed: square logo tiles, transparent local PNGs, Gmail Yes/No branches, 2FA and copy-password guidance, footer choices, Back by progress, validation, retained values, all providers, desktop/mobile, modal close and existing actions.');
} finally { await browser.close(); server.close(); }
