import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({
  stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {FormsTerms} from './modules/appointments/forms-terms';
    import {NotificationProvider} from './components/ui/notifications';
    import './app/globals.css';import './app/admin/design-tokens.css';import './app/admin/design-system.css';
    createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main" style={{height:'auto'}}><NotificationProvider><FormsTerms initialDocuments={[]}/></NotificationProvider></main></div>);
  `},bundle:true,write:false,outdir:'.tmp/intake-builder-test',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent',
  plugins:[{name:'local-documents',setup(build){
    build.onResolve({filter:/^\.\/forms-terms-actions$/},()=>({path:'documents',namespace:'local-documents'}));
    build.onLoad({filter:/.*/,namespace:'local-documents'},()=>({contents:'export async function saveBookingDocument(input){return {document:{...structuredClone(input),id:input.id||crypto.randomUUID(),version:(input.version||0)+1}}}',loader:'js'}));
  }}]
});
const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const captures=resolve('.impeccable/review/token-system');mkdirSync(captures,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.route('https://forms.test/**',route=>route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div>`}));
  await page.goto('https://forms.test/');await page.addScriptTag({content:js});
  await page.getByRole('button',{name:'New form',exact:true}).click();
  const builder=page.getByRole('region',{name:'Intake form builder'});
  await builder.getByRole('textbox',{name:'Form name',exact:true}).fill('Session preparation');
  const widths=builder.getByRole('combobox',{name:/^Field width/});
  async function add(type,label){await builder.getByRole('button',{name:type,exact:true}).click();await builder.getByRole('textbox',{name:'Question',exact:true}).fill(label);}
  await add('Text answer','Your goals');
  const field=builder.locator('[data-form-field]').first();
  const handle=await builder.getByRole('button',{name:'Resize Your goals',exact:true}).boundingBox();
  const bounds=await field.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2-bounds.width/2,handle.y+handle.height/2,{steps:12});await page.mouse.up();
  assert.equal(await field.getAttribute('data-width'),'HALF','Dragging resizes a field');
  await add('Text answer','Location notes');await widths.selectOption('HALF');
  const left=await field.boundingBox(),right=await builder.locator('[data-form-field]').nth(1).boundingBox();
  assert(Math.abs(left.y-right.y)<2&&right.x>left.x,'Half-width questions sit side by side');
  await builder.getByRole('button',{name:'Resize Location notes',exact:true}).press('ArrowLeft');
  assert.equal(await builder.locator('[data-form-field]').nth(1).getAttribute('data-width'),'THIRD');
  await builder.getByRole('button',{name:'Resize Location notes',exact:true}).press('ArrowRight');
  await add('Checkboxes','Who is joining?');await widths.selectOption('HALF');
  await builder.getByRole('textbox',{name:'Choice 1',exact:true}).fill('Adults');
  await builder.getByRole('textbox',{name:'Choice 2',exact:true}).fill('Children');
  await builder.getByRole('switch',{name:'Required answer',exact:true}).check();
  await add('Date','Preferred date');await widths.selectOption('HALF');
  assert.equal(await builder.getByRole('textbox',{name:'Choice 1',exact:true}).count(),0,'Dates have no choice editor');
  await builder.getByRole('button',{name:'Move Preferred date',exact:true}).press('ArrowUp');
  const order=()=>builder.locator('[data-form-field]').evaluateAll(els=>els.map(el=>el.querySelector('[class*="question"]').textContent.replace(/\s*\*$/,'')));
  assert.deepEqual(await order(),['Your goals','Location notes','Preferred date','Who is joining?']);
  await builder.getByRole('button',{name:'Save form',exact:true}).click();
  await page.getByRole('button',{name:'Edit Session preparation',exact:true}).click();
  assert.deepEqual(await order(),['Your goals','Location notes','Preferred date','Who is joining?']);
  assert.deepEqual(await builder.locator('[data-form-field]').evaluateAll(els=>els.map(el=>el.dataset.width)),['HALF','HALF','HALF','HALF'],'Widths survive saving and reopening');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    assert(await builder.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Builder fits its viewport');
    const boxes=await builder.locator('[data-form-field]').evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width})));
    if(width===390)assert(boxes.every(box=>Math.abs(box.x-boxes[0].x)<1),'Saved columns stack on phones');
    await builder.screenshot({path:resolve(captures,`intake-fields-layout-${width}.png`)});
  }
  await builder.getByRole('button',{name:'Forms & Terms',exact:true}).click();
  await page.getByRole('button',{name:'New terms',exact:true}).click();
  await page.getByRole('textbox',{name:'Terms name',exact:true}).fill('Studio terms');
  await page.getByRole('textbox',{name:'Booking terms',exact:true}).fill('Please review before booking.');
  await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-responsive-table-frame]')).every(el=>el.dataset.tableLayout==='cards'));
  await page.screenshot({path:resolve(captures,'forms-mobile-rows.png')});
  assert.deepEqual(errors,[]);
  console.log('Passed: new field types, pointer and keyboard resizing, side-by-side layout, order and width persistence, phone stacking and mobile form rows.');
}finally{await browser.close();}
