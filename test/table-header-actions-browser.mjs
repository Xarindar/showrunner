import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const built=await build({stdin:{contents:'@import "./app/globals.css"; @import "./app/admin/design-tokens.css"; @import "./app/admin/design-system.css";',resolveDir:process.cwd(),loader:'css'},bundle:true,write:false});
const css=new TextDecoder().decode(built.outputFiles[0].contents);
const button=(label,secondary=true)=>`<button class="ui-button${secondary?' ui-button-secondary':''}">${label}</button>`;
const header=(title,actions,section=false)=>`<section class="${section?'ui-table-card':'ui-data-table-shell'}"><header class="${section?'ui-section-header':'ui-data-table-titlebar'}"><h2>${title}</h2>${actions}</header></section>`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
mkdirSync('.tmp/header-actions',{recursive:true});
try {
  const page=await browser.newPage();
  for(const width of [1239,860,760,520,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="showrunner-admin"><main style="padding:16px;display:grid;gap:16px;max-width:520px">${header('Sessions',button('New Session'))}${header('Packages',button('Add package'),true)}${header('Records',button('Add record',false))}${header('Documents & notes',`<div class="ui-inline-actions">${button('Add note')}${button('Add document')}</div>`)}${header('Intake and Booking Terms & Conditions',`<div class="ui-inline-actions">${button('Manage forms & terms')}${button('Add rule')}</div>`,true)}<section aria-label="Standard buttons" class="ui-inline-actions">${button('Upload',false)}${button('New folder')}<button class="ui-button ui-button-ghost">Clear all</button><button class="ui-button ui-button-danger">Delete</button><button class="ui-button" disabled>Disabled</button><a class="ui-button ui-button-secondary" href="#">Back</a></section><form class="form-grid"><label>Reason<input value=""/></label><button class="ui-button">Save cancellation reason</button></form></main></body></html>`);
    await page.getByRole('button',{name:'New Session',exact:true}).hover();
    await page.getByRole('button',{name:'New Session',exact:true}).evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
    const rows=await page.locator('header').evaluateAll(headers=>headers.map(header=>{
      const title=header.querySelector('h2').getBoundingClientRect();
      const buttons=[...header.querySelectorAll('button')].map(button=>{
        const rect=button.getBoundingClientRect(),style=getComputedStyle(button);
        return {width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,background:style.backgroundColor,color:style.color,clip:style.backgroundClip,radius:style.borderTopLeftRadius,pillHeight:rect.height-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth)};
      });
      return {direction:getComputedStyle(header).flexDirection,width:header.clientWidth,title:{top:title.top,bottom:title.bottom},buttons};
    }));
    for(const row of rows) {
      assert.equal(row.direction,'row','Headers retain a wrapping row at every viewport');
      for(const button of row.buttons) {
        assert(button.width<row.width-32,'Actions stay content-sized');
        if(width<=860) {
          assert(button.height>=44,'Compact pills retain accessible touch targets');
          assert.equal(button.clip,'padding-box');
          assert(['rgb(255, 255, 255)','rgb(221, 221, 221)'].includes(button.background),'Pill retains the shared resting or hover fill');
          assert.equal(button.pillHeight,28,'Pill uses the shared visual-height token');
          assert.equal(button.radius,'14px 22px','Visible pill ends stay circular inside the taller touch target');
          assert.equal(button.color,'rgb(16, 16, 16)');
        }
      }
    }
    assert(await page.getByRole('button',{name:'Save cancellation reason',exact:true}).evaluate(element=>element.getBoundingClientRect().width<element.parentElement.getBoundingClientRect().width),'Form actions remain content-sized instead of stretching into flat pills');
    const standard=page.getByRole('region',{name:'Standard buttons',exact:true});
    for(const button of await standard.locator('.ui-button').all()) {
      const geometry=await button.evaluate(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {height:rect.height,visible:rect.height-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth),clip:style.backgroundClip}});
      if(width<=860) { assert.equal(geometry.height,44);assert.equal(geometry.visible,28);assert.equal(geometry.clip,'padding-box'); }
    }
    await standard.getByRole('button',{name:'Upload',exact:true}).focus();
    if(width<=860) assert.equal(await standard.getByRole('button',{name:'Upload',exact:true}).evaluate(element=>getComputedStyle(element).outlineOffset),'-8px');
    for(const row of rows.slice(0,3)) assert(row.buttons[0].top<=row.title.bottom&&row.buttons[0].bottom>=row.title.top,'Short titles and actions share a line');
    if(width===320) assert(rows[4].buttons[0].top>=rows[4].title.bottom,'Long title wraps actions when needed');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`.tmp/header-actions/${width}.png`,fullPage:true});
  }
  console.log('PASS: shared section/table headers keep compact token-sized pills, 44px touch targets, natural wrapping, and no overflow across six widths.');
} finally {await browser.close();}
