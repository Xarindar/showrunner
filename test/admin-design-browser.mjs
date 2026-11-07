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
    import {Table} from './components/ui/table';
    import {Pencil} from 'lucide-react';
    import {Badge} from './components/ui/badge';
    import {Modal} from './components/ui/modal';
    import {Dialog} from './components/ui/dialog';
    import {OnboardingModal} from './components/ui/onboarding-modal';
    import {ServiceCatalogTable} from './modules/scheduling/components/service-catalog-table';
    import albumStyles from './modules/portfolio/albums.module.css';
    import mediaStyles from './modules/media/media-library.module.css';
    import uploadStyles from './components/ui/asset-upload-panel.module.css';
    import pickerStyles from './modules/content/studio/service-picker.module.css';
    import {Switch} from './components/ui/switch';
    import {Tooltip} from './components/ui/tooltip';
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
    import {SessionPackagesEditor} from './modules/scheduling/components/session-packages-editor';
    import {ServiceWorkspaceTabs} from './modules/scheduling/components/service-workspace-tabs';
    import {ServiceMediaFields} from './modules/scheduling/components/service-media-fields';
    import {SessionTypeForm} from './modules/scheduling/components/session-type-form';
    import './app/globals.css';
    import './app/admin/design-tokens.css';
    import './app/admin/design-system.css';
    import './app/admin/notifications.css';
    const modalCases = [
      {key:'shared'}, {key:'dashboard',className:'dashboard-quickcard-dialog',body:'dashboard-quickcard-dialog-body'},
      {key:'clients',className:'clients-modal',body:'clients-modal-body'},
      {key:'payments',className:'pay-dialog'}, {key:'appointments',className:'appointments-modal wide',body:'appointments-modal-body'},
      {key:'booking',className:'booking-rule-modal',body:'booking-rule-modal-body'},
      {key:'media',className:mediaStyles.detailsModal}, {key:'upload',className:uploadStyles.dialog,body:uploadStyles.body},
      {key:'service-picker',className:pickerStyles.dialog,body:pickerStyles.body},
      {key:'gallery',className:albumStyles.settingsPanel,body:albumStyles.settingsBody},
      {key:'viewer',className:albumStyles.viewer,body:albumStyles.viewerBody},
      {key:'long-title',title:'Choose images from the shared library for the current session'},
      {key:'onboarding'}, {key:'email'}, {key:'status'}
    ];
    function ModalAuditFixtures() {
      const [selected,setSelected]=useState(null);
      const current=modalCases.find(item=>item.key===selected);
      const close=()=>setSelected(null);
      const content=<><Field label="Audit field"><Input /></Field><div className="module-modal-actions"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={close}>Done</Button></div></>;
      return <section className="studio-panel" aria-label="Modal audit fixtures">
        {modalCases.map(item=><Button key={item.key} onClick={()=>setSelected(item.key)}>{'Audit '+item.key}</Button>)}
        {current && (selected==='onboarding' ? <OnboardingModal open onClose={close} title="Modal audit" activeStepIndex={0} steps={[{id:'details',label:'Details'},{id:'review',label:'Review'}]}>{content}</OnboardingModal>
          : selected==='email' ? <Dialog open onClose={close} aria-label="Modal audit" className="ui-dialog email-playground-dialog"><div className="email-playground-shell"><header className="email-playground-header ui-dialog-header"><div><h2 className="ui-dialog-title">Modal audit</h2></div><div className="email-playground-header-actions"><Button className="ui-dialog-close" variant="ghost" aria-label="Close playground" onClick={close}><span aria-hidden="true">×</span></Button></div></header><div className="email-playground-steps">Compose</div><div className="email-playground-body">Email preview</div><footer className="email-playground-footer">{content}</footer></div></Dialog>
          : selected==='status' ? <ServiceCatalogTable categoryOptions={[]} tagOptions={[]} initialCategory="all" initialTag="all" initialSearch="" services={[]} createAction={null} toggleServiceAction={()=>{}} statusActionService={{id:'test',name:'Session',isActive:true,tags:[],category:'',bookingPath:'',description:'',durationMinutes:60,location:'',pricing:'',packageCount:1}} />
          : <Modal open onClose={close} title={current.title || 'Modal audit'} className={current.className} bodyClassName={current.body}>
            {selected==='viewer' ? <><img className={albumStyles.fullPhoto} src="/photo.svg" alt="Photo"/><div className={albumStyles.viewerCaption}>Photo 1 of 2</div></>
              : selected==='gallery' ? <><div className={albumStyles.settingsScroll}><Field label="Audit field"><Input /></Field></div><div className={"ui-settings-footer "+albumStyles.settingsFooter}><Button onClick={close}>Done</Button></div></>
              : content}
          </Modal>)}
      </section>;
    }
    function WorkspaceFixture() {
      const [open,setOpen]=useState(false);
      return <div className="showrunner-admin"><div className="admin-root"><aside className="admin-sidebar">Navigation</aside><main className="admin-main" style={{minHeight:'calc(100dvh - 8px)'}}><Button onClick={()=>setOpen(true)}>Open workspace dialog</Button><ServiceWorkspaceTabs tabs={[{id:"details",label:"Session details",content:<div><p>Session panel</p><Button>Panel control</Button></div>}]} /><Modal title="Workspace modal" open={open} onClose={()=>setOpen(false)} className="module-action-modal"><Field label="Workspace field"><Input /></Field><div className="module-modal-actions"><Button onClick={()=>setOpen(false)}>Done</Button></div></Modal></main></div></div>;
    }
    const tableFamilies = [
      {key:'base',table:'',frame:''},
      {key:'catalog',table:'catalog-product-table',frame:'catalog-table-scroll',raw:true},
      {key:'variants',table:'catalog-product-table product-variant-table',frame:'product-variant-table-scroll',raw:true},
      {key:'records',table:'ui-data-table clients-records-table',frame:'clients-records-table-wrap'},
      {key:'clients',table:'ui-data-table clients-table',frame:'ui-data-table-scroll clients-table-wrap',shell:'clients-data-table'},
      {key:'payments',table:'ui-data-table payments-coupons-index-table',frame:'ui-data-table-scroll',shell:'payments-coupons-table'},
      {key:'legacy',table:'table',frame:'ui-table-wrap',raw:true},
      {key:'empty',table:'',frame:''}
    ];
    function TableStyleFixtures() {
      return <section aria-label="Table appearance fixtures" style={{display:'grid',gap:24}}>{tableFamilies.map(family=>{
        const cells=<><thead><tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col">Actions</th></tr></thead><tbody>{family.key==='empty'?<tr><td colSpan={3}>No records added</td></tr>:<><tr><td>Design session</td><td>$120.00</td><td><Button variant="secondary" aria-label="Edit fixture"><Pencil size={15}/></Button></td></tr><tr data-state="selected"><td>Selected session</td><td>$200.00</td><td>Selected</td></tr></>}</tbody></>;
        const table=family.raw?<div className={family.frame}><table className={family.table}>{cells}</table></div>:<Table className={family.frame} tableClassName={family.table}>{cells}</Table>;
        return <section key={family.key} aria-label={'Table family '+family.key} style={{minWidth:0,maxWidth:900}}>{family.shell?<section className={'ui-data-table-shell '+family.shell}><div className="ui-data-table-header"><div className="ui-data-table-titlebar"><div><h2>Records</h2><p>2 records</p></div><Button>Add record</Button></div><div className="ui-data-table-toolbar"><Input aria-label="Filter fixture" placeholder="Search"/></div></div>{table}<footer className="ui-data-table-footer">2 records</footer></section>:table}</section>;
      })}</section>;
    }
    const ruleLibraryFixture = [
      ...['Session goals','Accessibility needs','Anything else'].map((label,index)=>({id:'session-'+index,kind:'intake',category:'Session',label,type:'TEXT',required:false,options:[],placeholder:'',helpText:''})),
      {id:'legacy-email',kind:'intake',category:'Contact',label:'Email',type:'TEXT',required:true,options:[],placeholder:'',helpText:'',contactField:'customerEmail'}
    ];
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
          <section aria-label="Unequal field hints" className="ui-equal-grid">
            <Field label="With hint" hint="Extra guidance below this control"><Input /></Field>
            <Field label="Aligned select"><select aria-label="Aligned select"><option>A long option that must stay on one line inside a narrow field</option><option>Short option</option></select></Field>
          </section>
          <div className="ui-cluster ui-gap-2"><Button>Save</Button><Button variant="secondary">Cancel</Button><Button variant="danger">Delete</Button><Button disabled>Disabled action</Button></div>
          <div className="ui-cluster ui-gap-2"><Badge>Neutral</Badge><Badge tone="success">Active</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Error</Badge></div>
          <Switch label="Published" defaultChecked />
          <ImageFramingControl source="/slow-photo.svg" ratio={1} value={{}} onChange={value=>window.appliedCrop=value} />
          <section aria-label="Booking rules fixture" style={{maxWidth:560,width:'100%'}}><ServiceBookingRulesTable idPrefix="fixture" availableRules={ruleLibraryFixture} intakeOptions={["What should we prepare?"]} policyOptions={['Please review these booking conditions. '+ 'Policy details for clients. '.repeat(20)]} /></section>
        </Card></div>
        <HeaderFrameRatios.Provider value={{portrait: 9/16}}><section aria-label="Image inspector" className={studioStyles.fields} style={{width:240}}><Fields fields={{url:{kind:'text',label:'Image'},alt:{kind:'text',label:'Alt'}}} prefix="portrait" value={photo} onChange={setPhoto} /></section></HeaderFrameRatios.Provider>
        <section aria-label="Responsive inspector" className={studioStyles.fields} style={{width:240}}>
          <button onClick={()=>setMobile(false)}>Edit desktop</button><button onClick={()=>setMobile(true)}>Edit mobile</button>
          <MobileContentEditing.Provider value={mobile}><HeaderFrameRatios.Provider value={{responsive:9/16}}><ContentFields block={{id:'responsive',type:'about',editableFields:['heading','copy','imageUrl'],pageIds:['home']}} value={content} onChange={setContent} canUpload choices={[]} linkOptions={{pages:[],services:[]}} /></HeaderFrameRatios.Provider></MobileContentEditing.Provider>
        </section>
        <section aria-label="Button settings fixture" className={studioStyles.fields} style={{width:240}}><Fields fields={{buttonLabel:{kind:'text',label:'Title'},buttonHref:{kind:'url',label:'Link'}}} prefix="button" value={{buttonLabel:'Book The Hive',buttonHref:'/booking'}} onChange={()=>{}} linkOptions={{pages:[{path:'/booking',label:'Booking'}],services:[]}} /></section>
        <section aria-label="Plain fields fixture" style={{width:240,display:'grid',gap:16}}><label>Plain name<input /></label><label>Plain notes<textarea /></label><label><input type="checkbox" />Keep checked</label></section>
        <section aria-label="Tooltip fixture" style={{padding:40}}><Tooltip content="Edit session type" focusable={false}><Button variant="secondary">Tooltip target</Button></Tooltip></section>
        <section aria-label="Booking rules copy fixture" style={{maxWidth:560}}><ServiceBookingRulesTable idPrefix="copy" /></section>
        <section aria-label="New session fixture"><form onSubmit={event=>event.preventDefault()}><SessionPackagesEditor isNew initialRates={[{id:'package-rate',name:'Photo',amountCents:12000}]} /></form></section>
        <section aria-label="Session services fixture"><form onSubmit={event=>event.preventDefault()}><label>Session draft name<input defaultValue="Unsaved session" /></label><SessionPackagesEditor initialRates={[{id:"rate",name:"Photography",amountCents:10000}]} /></form></section>
        <section aria-label="Compact included services" style={{maxWidth:600}}><SessionPackagesEditor initialOffering={{coverageItems:Array.from({length:24},(_,index)=>({id:'compact-'+index,name:index===0?'Douglas':index===1?'A very long included service name that should stay within its row':'Service '+(index+1),description:'Full service details remain available when editing.',pricingType:'FLAT_RATE',priceCents:20000})),tiers:[{id:'compact-standard',name:'Standard',durationMinutes:60,priceCents:null,coverageIds:Array.from({length:24},(_,index)=>'compact-'+index)}],addOns:[]}} /></section>
        <section aria-label="Schedule fixture" className={scheduleStyles.page}>
          <h1>Schedule</h1>
          <AvailabilityPanel availability={[]} staff={[{id:'staff-1',name:'Staff member',isActive:true}]} resources={[]} timezone="America/Chicago" />
          <BlockoutsPanel blockouts={[]} resources={[]} timezone="America/Chicago" />
          <section className={scheduleStyles.settings}><details open><summary>Staff & resources <span>1 staff</span></summary><div className={scheduleStyles.section}><details><summary>Nested schedule settings</summary><p>Settings content</p></details></div></details></section>
          <Card bodyClassName="ui-stack" data-testid="stack-card"><p>First group</p><p>Second group</p></Card>
          <div className={serviceStyles.page}><div className={serviceStyles.createGrid}><section className="studio-panel"><div className={packageStyles.editor}><label>Package price<input aria-label="Package price" type="number" /></label></div></section></div></div>
        </section>
        <section aria-label="Session photo fixture"><ServiceMediaFields canUpload={false} /></section>
        <section className="studio-panel ui-section-card"><details><summary className="ui-section-header">Centered section heading</summary><p>Section body</p></details></section>
        <TableStyleFixtures />
        <ModalAuditFixtures />
        <Modal title="Shared dialog" open={open} onClose={()=>setOpen(false)}><Field label="Dialog field"><Input /></Field><div className="module-modal-actions"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel dialog</Button><Button>Confirm</Button></div></Modal>
        <section aria-label="New session builder fixture"><SessionTypeForm businessHours={["Monday"]} timezone="America/Chicago" canUpload={false} schedulingRules={null} rates={[]} tags={[]} /></section>
      </main></NotificationProvider></div>;
    }
    createRoot(document.getElementById('root')).render(location.pathname==='/workspace-fixture'?<WorkspaceFixture />:<Fixture />);
  ` },
  bundle: true, outfile: `${output}.js`,
  plugins: [{ name: "schedule-actions-fixture", setup(build) {
    build.onResolve({filter:/^\.\/service-media-fields$/},()=>({path:'media-fields',namespace:'builder-media-fixture'}));
    build.onLoad({filter:/.*/,namespace:'builder-media-fixture'},()=>({contents:"export function ServiceMediaFields(){return null}",loader:'js'}));
    build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'modal-router-fixture'}));
    build.onLoad({filter:/.*/,namespace:'modal-router-fixture'},()=>({contents:"export function useRouter(){return {push(path){window.location.assign(path)}}}",loader:'js'}));
    build.onResolve({filter:/^\.\.\/booking-rule-actions$/},()=>({path:'booking-rule-actions',namespace:'rule-actions-fixture'}));
    build.onLoad({filter:/.*/,namespace:'rule-actions-fixture'},()=>({contents:`const sets=[{"id": "old-contact", "name": "Old contact set", "rules": [{"id": "legacy-name", "kind": "intake", "category": "Contact", "label": "Name", "type": "TEXT", "required": true, "options": [], "placeholder": "", "helpText": "", "contactField": "customerName"}]}, {"id": "old-mixed", "name": "Legacy mixed set", "rules": [{"id": "legacy-name", "kind": "intake", "category": "Contact", "label": "Name", "type": "TEXT", "required": true, "options": [], "placeholder": "", "helpText": "", "contactField": "customerName"}, {"id": "legacy-notes", "kind": "intake", "category": "Session", "label": "Legacy shoot notes", "type": "TEXT", "required": false, "options": [], "placeholder": "", "helpText": ""}]}]; export async function listBookingRuleSets(){return structuredClone(sets)} export async function saveBookingRuleSet(input){if(input.name==='Fail')return {error:'Set save failed. Try again.'}; const set={...structuredClone(input),id:'saved-set'};sets.push(set);return {set}}`,loader:'js'}));
    build.onResolve({filter:/^\.\.\/(service-library-actions|rate-actions)$/},args=>({path:args.path,namespace:'service-actions-fixture'}));
    build.onLoad({filter:/.*/,namespace:'service-actions-fixture'},args=>({contents:args.path.endsWith('rate-actions')?'export async function saveHourlyRateAction(form) {return {rate:{id:"new-rate",name:form.name,amountCents:Math.round(Number(form.amount)*100)}}}':`export async function saveServiceLibraryItemAction(form) { if(form.name==='Fail once') return {error:'Please retry the service save.'}; return {item:{...form,id:'saved-service',tags:[],priceCents:form.availableAsAddOn && form.pricingType!=="HOURLY" ? Math.round(Number(form.price)*100) : null,hourlyRateId:form.availableAsAddOn ? form.hourlyRateId : null,pricingType:form.availableAsAddOn ? form.pricingType : "FLAT_RATE"}}; }`,loader:'js'}));
    build.onResolve({ filter: /asset-picker$/ }, args => (args.importer.endsWith("editor.tsx") || args.importer.endsWith("service-media-fields.tsx")) ? {path:"asset-picker",namespace:"image-fixture"} : undefined);
    build.onResolve({ filter: /^\.\/actions$/ }, args => args.importer.endsWith("editor.tsx") ? {path:"actions",namespace:"image-fixture"} : undefined);
    build.onLoad({filter: /.*/, namespace:"image-fixture"}, args => ({contents: args.path === "actions" ? "export async function uploadStudioAsset() {}" : `import React from 'react'; export function AssetPicker({children,triggerClassName,onSelectAsset,onUploadedAssets}) {return <><button className={triggerClassName} onClick={()=>onSelectAsset({id:'chosen-photo',filename:'Selected photo',url:'/replacement-photo.svg',thumbnailUrl:'/replacement-photo.svg',alt:'Selected photo'})}>{children}</button><button onClick={()=>onUploadedAssets([1,2,3,4,5].map(id=>({id:'photo-'+id,filename:'Photo '+id,url:'/uploaded-photo.svg',thumbnailUrl:'/uploaded-photo.svg',alt:'Uploaded photo'})))}>Complete upload</button></>}`,loader:"tsx",resolveDir:process.cwd()}));
    build.onResolve({ filter: /^\.\.\/actions$/ }, args => args.importer.includes("scheduling") ? { path: "schedule-actions", namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function saveWeeklyHoursAction() { return { error: '', success: 'Hours saved.' }; } export async function createBlockoutAction() {} export async function deleteBlockoutAction() {} export async function createServiceAction() {} export async function uploadServiceMediaAssetAction() {}", loader: "js" }));
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
  let libraryResponse = Promise.resolve();
  await page.route('**/api/scheduling/service-library?*', async route => {
    await libraryResponse;
    return route.fulfill({json:{items:[{id:'flat-extra',name:'Album service',description:'Printed album',category:'',tags:[],pricingType:'FLAT_RATE',priceCents:5000,hourlyRateId:null},{id:'free-extra',name:'Free service',description:'No charge',category:'',tags:[],pricingType:'FLAT_RATE',priceCents:0,hourlyRateId:null},{id:'unpriced-extra',name:'Unpriced service',description:'',category:'',tags:[],pricingType:'FLAT_RATE',priceCents:null,hourlyRateId:null},{id:'hourly-extra',name:'Hourly service',description:'',category:'',tags:[],pricingType:'HOURLY',priceCents:null,hourlyRateId:'rate'}],categories:[],tags:[],total:4,page:1,pageCount:1}});
  });
  await page.goto("https://design.example");
  await page.getByRole("heading", { name: "Shared controls" }).waitFor();
  async function clearNotifications() {
    const dismiss = page.getByRole('button',{name:'Dismiss notification',exact:true});
    while (await dismiss.count()) await dismiss.last().click();
  }
  async function checkTooltipContrast(view) {
    await page.getByRole('button',{name:'Tooltip target',exact:true}).focus();
    const tooltip=page.getByRole('tooltip',{name:'Edit session type',exact:true});
    await tooltip.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="tooltip"]')].some(element=>element.textContent.trim()==='Edit session type'&&getComputedStyle(element).opacity==='1'));
    const colors=await tooltip.evaluate(element=>{const style=getComputedStyle(element);return {text:style.color,background:style.backgroundColor,arrow:getComputedStyle(element,'::after').backgroundColor};});
    const luminance=color=>color.match(/\d+/g).slice(0,3).map(value=>{const channel=Number(value)/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;}).reduce((total,value,index)=>total+value*[0.2126,0.7152,0.0722][index],0);
    const values=[luminance(colors.text),luminance(colors.background)];
    assert((Math.max(...values)+0.05)/(Math.min(...values)+0.05)>=4.5,'Shared tooltips must have readable text contrast');
    assert.equal(colors.arrow,colors.background,'Tooltip arrows match the readable surface');
    await tooltip.screenshot({path:`${captures}/tooltip-${view}.png`});
  }
  await checkTooltipContrast('desktop');
  const newSession = page.getByRole('region', {name:'New session fixture'});
  const packageList = newSession.getByRole('region', {name:'Packages', exact:true});
  const readOffering = () => newSession.locator('input[name="sessionOffering"]').inputValue().then(JSON.parse);
  const addPackage = packageList.getByRole('button',{name:'Add package',exact:true});
  const emptyPackageHeight=(await packageList.getByRole('region',{name:'Packages table',exact:true}).boundingBox()).height;
  const suggestionsCard = newSession.getByRole('region',{name:'Suggested Add-Ons',exact:true});
  const addOnButton = suggestionsCard.getByRole('button',{name:'Add add-on',exact:true});
  const buttonStyle = button => button.evaluate(element=>{const style=getComputedStyle(element);return [style.backgroundColor,style.minHeight,style.padding,style.fontSize];});
  assert.deepEqual(await buttonStyle(addPackage),await buttonStyle(addOnButton),'Add package and add-on use matching white header actions');
  assert(await addPackage.evaluate(element=>element.parentElement.querySelector('h2')?.textContent==='Packages'),'Add package sits beside its section title');
  assert.equal(await packageList.getByRole('region',{name:'Suggested Add-Ons',exact:true}).count(),0,'Packages and Suggested Add-Ons are separate cards');
  for (const card of [packageList,suggestionsCard]) {
    assert.deepEqual(await card.locator('.ui-section-header').evaluate(element=>[getComputedStyle(element).backgroundColor,getComputedStyle(element.querySelector('h2')).color,getComputedStyle(element.querySelector('button')).backgroundColor,getComputedStyle(element.querySelector('h2')).fontSize]),['rgb(16, 16, 16)','rgb(255, 255, 255)','rgb(255, 255, 255)','15px'],'Cards share black headers with white titles and add buttons');
  }
  for (const card of [packageList,suggestionsCard]) {
    const edges=await card.evaluate(element=>{
      const outer=element.getBoundingClientRect(),header=element.querySelector('.ui-section-header').getBoundingClientRect(),table=element.querySelector('.catalog-table-scroll').getBoundingClientRect();
      return [table.left-outer.left,outer.right-table.right,table.top-header.bottom,outer.bottom-table.bottom];
    });
    assert(edges.every(edge=>Math.abs(edge)<=1),'Tables form the card with only a thin outer boundary');
  }
  for (const card of [packageList,suggestionsCard]) {
    const table=card.locator('.catalog-table-scroll');
    assert((await table.boundingBox()).height<130,'Embedded empty tables use a compact empty state');
    const header=await table.getByRole('columnheader').first().evaluate(element=>{const s=getComputedStyle(element);return [s.backgroundColor,s.color];});
    assert.notEqual(header[0],'rgb(16, 16, 16)','Builder column labels are lighter than the black title bar');
    assert.notEqual(header[1],'rgb(255, 255, 255)','Builder column labels use dark text');
    assert.equal(await card.evaluate(element=>getComputedStyle(element).boxShadow),'none','Table surfaces use the shared quiet border instead of elevation');
  }
  await newSession.screenshot({path:captures+'/separate-package-cards-desktop.png'});
  assert.deepEqual((await readOffering()).tiers, []);
  await packageList.getByRole('button', {name:'Add package', exact:true}).click();
  await page.getByRole('dialog', {name:'New package', exact:true}).getByRole('button', {name:'Cancel', exact:true}).click();
  assert.deepEqual((await readOffering()).tiers, []);
  await packageList.getByRole('button', {name:'Add package', exact:true}).click();
  const newPackage = page.getByRole('dialog', {name:'New package', exact:true});
  await newPackage.getByRole('combobox', {name:'Pricing type'}).selectOption('HOURLY');
  await newPackage.getByRole('combobox', {name:'Hourly rate'}).selectOption('package-rate');
  assert.equal((await readOffering()).tiers[0].price, '120.00');
  assert.equal(await newPackage.getByRole('spinbutton', {name:/price/i}).count(),0,'Hourly packages replace the price input with a saved-rate selector');
  const pricingTops=await newPackage.getByRole('combobox',{name:/^(Pricing type|Hourly rate)$/}).evaluateAll(elements=>elements.map(element=>Math.round(element.getBoundingClientRect().top)));
  assert.equal(pricingTops[0],pricingTops[1],'Pricing type and hourly rate share one row');
  assert.equal(await newPackage.getByRole('button',{name:'Add rate',exact:true}).count(),0);
  const packageRate = newPackage.getByRole('combobox',{name:'Hourly rate'});
  await packageRate.selectOption({label:'Create New Rate'});
  const rateEditor = page.getByRole('dialog',{name:'New hourly rate',exact:true});
  await rateEditor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await packageRate.inputValue(),'package-rate','Cancel retains the prior hourly-rate selection');
  await packageRate.selectOption({label:'Create New Rate'});
  await rateEditor.getByRole('textbox',{name:'Rate name'}).fill('Alternate photography');
  await rateEditor.getByRole('spinbutton',{name:'Rate per hour (USD)'}).fill('120');
  await rateEditor.getByRole('button',{name:'Save rate',exact:true}).click();
  assert.equal(await packageRate.inputValue(),'new-rate','Saving creates and selects a reusable hourly rate');
  await newPackage.getByRole('textbox', {name:'Package 1 name'}).fill('Photo package');
  const packageDuration = newPackage.getByRole('group', {name:'Duration', exact:true});
  const hours = packageDuration.getByRole('combobox', {name:'Hours', exact:true});
  const minutes = packageDuration.getByRole('combobox', {name:'Minutes', exact:true});
  assert.equal(await hours.inputValue(), '1');
  assert.equal(await minutes.inputValue(), '0');
  await hours.selectOption('0');
  await newPackage.getByRole('button', {name:'Done', exact:true}).click();
  assert(await packageDuration.isVisible(), 'Zero duration keeps the package editor open');
  await hours.selectOption('1');
  await minutes.selectOption('30');
  await hours.selectOption('24');
  assert(await minutes.isDisabled(), 'A 24-hour package cannot have additional minutes');
  assert.equal((await readOffering()).tiers[0].durationMinutes, '1440');
  await hours.selectOption('1');
  await minutes.selectOption('30');
  await newPackage.getByRole('spinbutton', {name:'Locations'}).fill('2');
  await newPackage.getByRole('spinbutton', {name:'Outfit changes'}).fill('0');
  await newPackage.getByRole('spinbutton', {name:'Final photos'}).fill('35');
  const durationViewport=page.viewportSize();
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    await minutes.click();
    if (await page.evaluate(()=>CSS.supports('appearance','base-select'))) {
      const optionFit=await minutes.locator('option').filter({hasText:/^59 M$/}).evaluate(element=>{
        const bounds=element.getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(element);
        const text=range.getBoundingClientRect();
        return text.left>=bounds.left&&text.right<=bounds.right;
      });
      assert(optionFit,'Compact duration options fit beside the picker scrollbar at '+width+'px');
      await newPackage.screenshot({path:captures+'/duration-picker-'+width+'.png'});
    }
    await page.keyboard.press('Escape');
    assert(await newPackage.isVisible(),'Closing a duration dropdown keeps the package modal open');
  }
  await page.setViewportSize(durationViewport);
  const controlTops = await newPackage.locator('select[aria-label="Hours"], input[type="number"]').evaluateAll(elements => elements.slice(-4).map(element => Math.round(element.getBoundingClientRect().top)));
  assert(new Set(controlTops).size === 1, 'Duration and deliverable counts share one desktop row');
  const servicesTable = newPackage.getByRole('region', {name:'Package services table'});
  async function assertModalInsets(modal, content) {
    const modalBounds = await modal.boundingBox();
    const contentBounds = await content.boundingBox();
    const action = modal.getByRole('button', {name:/^(Done|Apply to package)$/});
    const actionBounds = await action.boundingBox();
    const left = contentBounds.x - modalBounds.x;
    const right = modalBounds.x + modalBounds.width - contentBounds.x - contentBounds.width;
    assert(Math.abs(left - right) < 2, 'Modal content has equal left and right insets');
    assert(Math.abs(actionBounds.x + actionBounds.width - contentBounds.x - contentBounds.width) < 2, 'Modal content aligns with the action buttons');
    const closeBounds = await modal.getByRole('button',{name:'Close dialog',exact:true}).boundingBox();
    assert(Math.abs(closeBounds.x + closeBounds.width - actionBounds.x - actionBounds.width) < 2, 'Header close and footer action align on the same right edge');
  }
  await assertModalInsets(newPackage, servicesTable);
  const packageLayout = () => servicesTable.evaluate(table => {
    const card = table.closest('dialog');
    const actions = card.querySelector('.ui-inline-actions');
    return [card.offsetHeight, table.offsetHeight, actions.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom];
  });
  const servicesEmpty = servicesTable.getByText('No services added', {exact:true});
  assert(await servicesEmpty.isVisible());
  assert.deepEqual(await servicesTable.getByRole('columnheader', {name:'Service', exact:true}).evaluate(element => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color];
  }), ['rgb(247, 247, 247)', 'rgb(74, 74, 74)'], 'Modal services use the shared light column headers');
  assert.equal(await servicesTable.getByRole('row').count(), 1, 'Empty services have only a header, with no placeholder row');
  const emptyAlignment = await servicesEmpty.evaluate(element => {
    const table = element.parentElement;
    const header = table.querySelector('thead').getBoundingClientRect();
    const bounds = table.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    return [Math.abs(text.x + text.width / 2 - bounds.x - bounds.width / 2), Math.abs(text.y + text.height / 2 - (header.bottom + bounds.bottom) / 2)];
  });
  assert(emptyAlignment.every(offset => offset < 3), 'Empty services message is centered in the table body');
  await newPackage.screenshot({path:`${captures}/new-package-empty.png`});
  const emptyPackageLayout = await packageLayout();
  assert(emptyPackageLayout[1] > 160, 'Services table grows into the available desktop modal space');
  const tableToActionsGap = await servicesTable.evaluate(table => {
    const actions = table.closest('dialog').querySelector('.ui-inline-actions');
    return actions.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
  });
  assert(tableToActionsGap > 0 && tableToActionsGap < 40, 'Services table ends just above the modal actions');
  let releaseLibrary;
  libraryResponse = new Promise(resolve => { releaseLibrary = resolve; });
  const addServicesButton = newPackage.getByRole('button', {name:'Add Services', exact:true});
  await addServicesButton.focus();
  const focusRing = await addServicesButton.evaluate(element=>{const style=getComputedStyle(element);return {width:parseFloat(style.outlineWidth),offset:parseFloat(style.outlineOffset),style:style.outlineStyle};});
  assert(focusRing.width>=2&&focusRing.style==='solid'&&focusRing.width+focusRing.offset<=0,'Keyboard focus rings stay inside the button edge and cannot be clipped by a scroller');
  await newPackage.screenshot({path:captures+'/package-button-focus.png'});
  await newPackage.getByRole('button', {name:'Add Services', exact:true}).click();
  const packageServices = page.getByRole('dialog', {name:'Add Services', exact:true});
  await packageServices.getByText('Loading services…', {exact:true}).waitFor();
  const libraryBounds = async modal => [
    await modal.boundingBox(),
    await modal.locator('footer').boundingBox()
  ];
  const loadingBounds = await libraryBounds(packageServices);
  releaseLibrary();
  await packageServices.getByRole('checkbox', {name:'Select Album service', exact:true}).waitFor();
  assert.deepEqual(await libraryBounds(packageServices), loadingBounds, 'Add Services and its footer stay put as results load');

  await assertModalInsets(packageServices, packageServices.getByRole('searchbox', {name:'Search services'}).locator('..').locator('..'));
  assert.equal(await packageServices.getByRole('spinbutton').count(), 0, 'The library only configures services');
  await packageServices.screenshot({path:`${captures}/package-services-desktop.png`});
  const servicesViewport = page.viewportSize();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await packageServices.evaluate(element => element.scrollWidth > element.clientWidth), false, 'Embedded service picker fits mobile');
  await packageServices.screenshot({path:`${captures}/package-services-mobile.png`});
  await page.setViewportSize(servicesViewport);
  await packageServices.getByRole('checkbox', {name:'Select Album service', exact:true}).check();
  await packageServices.getByRole('button', {name:'Apply to package'}).click();
  assert.equal(await page.getByRole('dialog').count(), 1, 'Applying services returns to the package in the same dialog');
  assert(await servicesTable.getByRole('cell', {name:'Album service', exact:true}).isVisible());
  assert.deepEqual(await packageLayout(), emptyPackageLayout, 'Adding services keeps the package and footer the same size');
  const configured = await readOffering();
  assert.equal(configured.tiers[0].durationMinutes, '90');
  assert.equal(configured.tiers[0].price, '180.00');
  assert.deepEqual(configured.tiers[0].deliverables, {locations:2,outfitChanges:0,finalPhotos:35});
  assert.equal(configured.coverageItems[0].libraryItemId, 'flat-extra');
  assert.deepEqual(configured.tiers[0].coverageIds, [configured.coverageItems[0].id]);
  await newPackage.getByRole('button', {name:'Add Services', exact:true}).click();
  assert(await packageServices.getByRole('group', {name:'Services in this session'}).getByRole('checkbox', {name:'Album service'}).isChecked());
  await packageServices.getByRole('group', {name:'Services in this session'}).getByRole('checkbox', {name:'Album service'}).uncheck();
  await packageServices.getByRole('button', {name:'Cancel', exact:true}).click();
  assert.deepEqual(await readOffering(), configured);

  await newPackage.screenshot({path:`${captures}/new-package-desktop.png`});
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await newPackage.evaluate(element => element.scrollWidth > element.clientWidth), false, 'New package modal fits mobile');
  assert.equal(await newPackage.locator('.ui-dialog-body').evaluate(element => element.scrollWidth > element.clientWidth), false, 'Package fields fit mobile');
  await newPackage.screenshot({path:`${captures}/new-package-mobile.png`});
  await page.setViewportSize(desktopViewport);
  await newPackage.getByRole('button', {name:'Done', exact:true}).click();
  assert.equal(await newPackage.count(), 0, 'Done closes the new package modal');
  assert(await packageList.getByText('Photo package', {exact:true}).isVisible());
  assert((await packageList.getByRole('region',{name:'Packages table',exact:true}).boundingBox()).height<130,'A populated package table fits its rows without filler');
  assert((await packageList.getByRole('region',{name:'Packages table',exact:true}).boundingBox()).height>=emptyPackageHeight,'Adding the first package never shrinks its table card');

  const packageEditor = page.getByRole('region', {name:'Session services fixture'}).getByRole('region', {name:'Packages', exact:true});
  await packageEditor.getByRole('button', {name:'Add package', exact:true}).click();
  const pendingPackage = page.getByRole('dialog', {name:'New package', exact:true});
  assert(await pendingPackage.isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await pendingPackage.count(), 0, 'Escape discards a new package');
  assert.equal(await packageEditor.locator('details > summary').filter({hasText:/^Package 2/}).count(), 0);
  await packageEditor.getByText('Standard', {exact:true}).click();
  assert(await packageEditor.getByRole('heading', {name:'Edit Standard', exact:true}).isVisible());
  const editPackage = page.getByRole('dialog', {name:'Edit Standard', exact:true});
  assert(await editPackage.isVisible(), 'Existing packages open in the shared modal');
  await editPackage.getByRole('button', {name:'Add Services', exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(), 1, 'Existing package services reuse the same modal');
  await page.getByRole('dialog', {name:'Add Services', exact:true}).getByRole('button', {name:'Cancel', exact:true}).click();
  await editPackage.getByRole('button', {name:'Duplicate', exact:true}).click();
  assert.equal(await pendingPackage.getByRole('textbox', {name:'Package 2 name'}).inputValue(), 'Standard copy');
  await pendingPackage.getByRole('button', {name:'Cancel', exact:true}).click();
  await packageEditor.getByText('Standard', {exact:true}).click();
  assert(await editPackage.isVisible());
  assert(await editPackage.getByRole('button', {name:'Remove', exact:true}).isDisabled(), 'The last saved package cannot be removed');
  await editPackage.getByRole('textbox', {name:'Package 1 name'}).fill('Updated Standard');
  await page.getByRole('dialog', {name:'Edit Updated Standard', exact:true}).getByRole('button', {name:'Done', exact:true}).click();
  assert(await packageEditor.getByText('Updated Standard', {exact:true}).isVisible());
  assert.equal(await page.getByRole('dialog').count(), 0, 'Done returns to the package list');
  const input = page.getByPlaceholder("Name", { exact: true });
  const bookingRules=page.getByRole('region',{name:'Booking rules fixture'});
  async function checkBookingRulesOverflow() {
    assert.equal(await bookingRules.evaluate(element=>element.scrollWidth>element.clientWidth),false,'Booking rules fit the panel width');
    assert.equal(await bookingRules.locator('.booking-rules-table').evaluate(element=>element.scrollWidth>element.clientWidth),false,'Rules never need horizontal scrolling');
    const headers=await bookingRules.getByRole('columnheader').all();
    assert((await headers[0].boundingBox()).width>(await headers[1].boundingBox()).width,'Rule content gets the flexible column, not the action buttons');
    for(const remove of await bookingRules.getByRole('button',{name:/^Remove /}).all()) {
      const bounds=await remove.boundingBox();
      const panel=await bookingRules.boundingBox();
      assert(bounds.x>=panel.x&&bounds.x+bounds.width<=panel.x+panel.width+1,'Remove controls stay within the panel');
    }
  }
  await checkBookingRulesOverflow();
  assert.equal(await bookingRules.getByRole('button',{name:'Save as set',exact:true}).count(),0,'The rules table has no separate Save control');
  assert.equal(await bookingRules.locator('tbody tr').count(),0,'Empty rules tables do not render a record');
  const emptyRule=bookingRules.getByText('No intake question or Booking Terms & Conditions added',{exact:true});
  const emptyBg=await emptyRule.evaluate(element=>getComputedStyle(element).backgroundColor);
  await emptyRule.hover();
  assert.equal(await emptyRule.evaluate(element=>getComputedStyle(element).backgroundColor),emptyBg,'An empty rules table never highlights on hover');
  await bookingRules.screenshot({path:`${captures}/booking-rules-empty-desktop.png`});
  const geometry = () => input.evaluate(element => { const style = getComputedStyle(element); return [style.borderRadius, style.minHeight, style.fontSize, style.backgroundColor, style.fontFamily]; });
  const baseline = await geometry();
  assert.match(baseline[4], /sans-serif/, "Admin font must have a working fallback without Next font injection");
  assert.deepEqual(baseline.slice(0, 3), ["12px", "30px", "13px"]);
  async function checkFieldAlignment(height) {
    const pair = page.getByRole("region", { name: "Unequal field hints" });
    const controls = await pair.locator("input, select").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { top: rect.top, height: rect.height, align: style.alignItems, display: style.display, direction: style.flexDirection, justify: style.justifyContent };
    }));
    assert(controls.every(control => Math.abs(control.height - height) < 1), "Hints must not stretch neighbouring controls");
    if (height === 30) assert(Math.abs(controls[0].top - controls[1].top) < 1, "Neighbouring input and select must align");
    if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
      assert.equal(controls[1].align, "center", "Select text and arrow stay vertically centered");
      assert.equal(controls[1].display, "flex", "Select values and picker arrows share a horizontal layout");
      assert.equal(controls[1].direction, "row");
      assert.equal(controls[1].justify, "space-between", "Picker arrows stay at the trailing edge");
    }
  }
  await checkFieldAlignment(30);
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
  const packageInput = page.getByRole("spinbutton", { name: "Package price", exact: true });
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
  const headerStyles = await dialog.locator('.ui-modal-head').evaluate(element => {
    const title = getComputedStyle(element.querySelector('h2'));
    const close = getComputedStyle(element.querySelector('button'));
    return [getComputedStyle(element).backgroundColor, title.fontSize, title.lineHeight, title.color, close.color, element.offsetHeight];
  });
  assert.deepEqual(headerStyles, ['rgb(16, 16, 16)', '22px', '28px', 'rgb(255, 255, 255)', 'rgb(16, 16, 16)', 46]);
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
  await checkTooltipContrast('mobile');
  assert.deepEqual((await geometry()).slice(0, 3), ["12px", "44px", "16px"]);
  await checkFieldAlignment(44);
  await checkBookingRulesOverflow();
  await checkLabelSpacing();
  await buttonSettings.screenshot({path: `${captures}/button-spacing-mobile.png`});
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).evaluate(element => getComputedStyle(element).minHeight), "44px");
  assert.deepEqual(await packageInput.evaluate(element => { const style = getComputedStyle(element); return [style.minHeight, style.fontSize]; }), ["44px", "16px"], "Service editors reuse shared mobile controls");
  assert.deepEqual(await summaryGeometry(closureSummary), await summaryGeometry(scopeSummary));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("region", { name: "Schedule fixture" }).screenshot({ path: `${captures}/schedule-mobile.png` });
  await page.screenshot({ path: `${captures}/controls-mobile.png` });
  await bookingRules.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByRole("button", { name: /What should we prepare/ }).click();
  assert.equal(await bookingRules.locator('input[name="intakePrompt"]').inputValue(), "What should we prepare?");
  assert.equal(await page.locator(".booking-rule-type-cell").evaluate(element => getComputedStyle(element).display), "grid");
  await bookingRules.getByRole('button',{name:'Add rule',exact:true}).click();
  await page.getByRole('button',{name:/Please review these booking conditions/}).click();
  assert.equal(await bookingRules.locator('tbody tr').count(),2);
  assert.equal(await bookingRules.getByText('Booking Terms & Conditions',{exact:true}).count(),1);
  await checkBookingRulesOverflow();
  await bookingRules.screenshot({path:`${captures}/booking-rules-mobile.png`});
  await page.setViewportSize({width:1440,height:1000});
  await checkBookingRulesOverflow();
  await bookingRules.screenshot({path:`${captures}/booking-rules-desktop.png`});
  await bookingRules.getByRole('switch',{name:'Require T&C Acceptance',exact:true}).check();
  await bookingRules.getByRole('button',{name:/^Remove Booking T&C:/}).click();
  assert.equal(await bookingRules.locator('input[name="policyText"]').inputValue(),'');
  assert.equal(await bookingRules.getByRole('switch',{name:'Require T&C Acceptance',exact:true}).isDisabled(),true);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "Adjust framing", exact: true }).first().click();
  await frame.waitFor();
  assert.equal(await cropDialog.locator('.ui-dialog-body').evaluate(element => element.scrollWidth > element.clientWidth), false, "Mobile crop dialog must not scroll horizontally");
  await cropDialog.screenshot({ path: `${captures}/crop-mobile.png` });
  await page.keyboard.press("Escape");
  const sessionServices = page.getByRole('region',{name:'Session services fixture'});
  await bookingRules.getByRole('button',{name:'Add rule',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Add all Contact',exact:true}).count(),0,'Contact information is not assigned per session');
  assert.equal(await page.getByRole('button',{name:'Apply Old contact set',exact:true}).count(),0,'Contact-only legacy sets are not offered');
  await page.getByRole('searchbox',{name:'Search rules',exact:true}).fill('Accessibility');
  await page.getByRole('button',{name:'Add all Session',exact:true}).click();
  assert.equal(await bookingRules.locator('tbody tr').count(),4);
  await bookingRules.getByRole('button',{name:'Add rule',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Add all Session',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Create rule',exact:true}).click();
  const ruleEditor=page.getByRole('dialog',{name:'Configure booking rule',exact:true});
  await ruleEditor.getByRole('textbox',{name:'Category',exact:true}).fill('Session preferences');
  await ruleEditor.getByRole('textbox',{name:'Question',exact:true}).fill('Preferred style');
  await ruleEditor.getByRole('combobox',{name:'Answer type',exact:true}).selectOption('RADIO');
  await ruleEditor.getByRole('textbox',{name:/^Choices/}).fill('Candid');
  await ruleEditor.getByRole('button',{name:'Apply rule',exact:true}).click();
  await ruleEditor.getByText('Add at least two different choices.',{exact:true}).waitFor();
  await ruleEditor.getByRole('textbox',{name:/^Choices/}).fill('Candid\nPosed');
  await ruleEditor.screenshot({path:`${captures}/booking-rule-configure-mobile.png`});
  await ruleEditor.getByRole('switch',{name:'Required answer',exact:true}).check();
  await ruleEditor.getByRole('button',{name:'Apply rule',exact:true}).click();
  assert.equal(JSON.parse(await bookingRules.locator('input[name="bookingRules"]').inputValue()).at(-1).type,'RADIO');
  await bookingRules.getByRole('button',{name:'Edit Preferred style',exact:true}).click();
  await ruleEditor.getByRole('combobox',{name:'Answer type',exact:true}).selectOption('SELECT');
  await ruleEditor.getByRole('button',{name:'Apply rule',exact:true}).click();
  await bookingRules.getByRole('button',{name:'Add rule',exact:true}).click();
  await page.getByRole('dialog',{name:'Add booking rule',exact:true}).getByRole('button',{name:'Save as set',exact:true}).click();
  const saveRules=page.getByRole('dialog',{name:'Save rule set',exact:true});
  await saveRules.getByRole('textbox',{name:'Set name',exact:true}).fill('Fail');
  await saveRules.getByRole('button',{name:'Save set',exact:true}).click();
  await saveRules.getByText('Set save failed. Try again.',{exact:true}).waitFor();
  await saveRules.getByRole('textbox',{name:'Set name',exact:true}).fill('Session questions');
  await saveRules.getByRole('button',{name:'Save set',exact:true}).click();
  await saveRules.waitFor({state:'hidden'});
  const sourceRules=await bookingRules.locator('input[name="bookingRules"]').inputValue();
  const copyRules=page.getByRole('region',{name:'Booking rules copy fixture',exact:true});
  await copyRules.getByRole('button',{name:'Add rule',exact:true}).click();
  await page.getByRole('button',{name:'Apply Session questions',exact:true}).click();
  const copied=JSON.parse(await copyRules.locator('input[name="bookingRules"]').inputValue());
  assert.equal(copied.length,5);
  assert.equal(copied.at(-1).type,'SELECT');
  await copyRules.getByRole('button',{name:'Edit Preferred style',exact:true}).click();
  await ruleEditor.getByRole('textbox',{name:'Question',exact:true}).fill('Copy-only question');
  await ruleEditor.getByRole('button',{name:'Apply rule',exact:true}).click();
  assert.equal(await bookingRules.locator('input[name="bookingRules"]').inputValue(),sourceRules,'Applying a set creates independent service drafts');
  await copyRules.getByRole('button',{name:'Add rule',exact:true}).click();
  await page.getByRole('button',{name:'Apply Legacy mixed set',exact:true}).click();
  const importedLegacy=JSON.parse(await copyRules.locator('input[name="bookingRules"]').inputValue());
  assert(importedLegacy.some(rule=>rule.label==='Legacy shoot notes'));
  assert(importedLegacy.every(rule=>!rule.contactField),'Legacy sets import only session questions, not shared contact fields');

  await checkBookingRulesOverflow();
  await bookingRules.screenshot({path:`${captures}/configured-rules-mobile.png`});
  async function checkModalInsets(modal) {
    const layout = await modal.evaluate(element=>{
      const bounds=element.getBoundingClientRect();
      const head=element.querySelector('.ui-modal-head').getBoundingClientRect();
      const footer=element.querySelector('footer').getBoundingClientRect();
      return {padding:getComputedStyle(element).padding,bodyDisplay:getComputedStyle(element.querySelector('.ui-dialog-body')).display,headLeft:head.left-bounds.left,headTop:head.top-bounds.top,footerLeft:footer.left-bounds.left,footerRight:bounds.right-footer.right,footerBottom:bounds.bottom-footer.bottom};
    });
    assert.equal(layout.padding,'16px','Every modal keeps its shared shell inset');
    assert.equal(layout.bodyDisplay,'flex','Module body layout must override the shared default');
    for(const edge of ['headLeft','headTop']) assert(Math.abs(layout[edge]) < 1, `${edge} header band fills the shell`);
    for(const edge of ['footerLeft','footerRight','footerBottom']) assert(layout[edge]>=15,`${edge} must stay inside the rounded shell`);
  }
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    const draftBefore = await sessionServices.locator('input[name="sessionOffering"]').inputValue();
    const compactServices=page.getByRole('region',{name:'Compact included services'});
    assert.equal(await compactServices.getByRole('heading',{name:/included/}).count(),0,'The separate included-services card is removed');
    await compactServices.getByRole('button',{name:'Standard',exact:true}).click();
    const compactPackage=page.getByRole('dialog',{name:'Edit Standard',exact:true});
    const serviceRows=compactPackage.getByRole('region',{name:'Package services table'}).locator('tbody tr');
    assert.equal(await serviceRows.count(),24,'Existing service assignments remain in the package');
    assert.equal(await compactPackage.evaluate(element=>element.scrollWidth>element.clientWidth),false,'Package services fit on desktop and mobile');
    await compactPackage.getByRole('button',{name:'Edit Douglas',exact:true}).click();
    const editService=page.getByRole('dialog',{name:'Edit service',exact:true});
    assert.equal(await editService.getByRole('textbox',{name:'Service name',exact:true}).inputValue(),'Douglas');
    assert.equal(await editService.getByRole('textbox',{name:/^Description/}).inputValue(),'Full service details remain available when editing.');
    await editService.getByRole('button',{name:'Cancel',exact:true}).click();
    await compactPackage.getByRole('button',{name:'Done',exact:true}).click();
    await sessionServices.getByRole('button',{name:'Updated Standard',exact:true}).click();
    const sessionPackage=page.getByRole('dialog',{name:'Edit Updated Standard',exact:true});
    await sessionPackage.getByRole('button',{name:'Add Services',exact:true}).click();
    libraryResponse = new Promise(resolve => { releaseLibrary = resolve; });
    const serviceLibrary=page.getByRole('dialog',{name:'Add Services',exact:true});
    await serviceLibrary.waitFor();
    assert.equal(await serviceLibrary.evaluate(element=>element.matches(':modal')),true,'Package services use the existing modal');
    await checkModalInsets(serviceLibrary);
    const pendingBounds = await libraryBounds(serviceLibrary);
    releaseLibrary();
    await serviceLibrary.getByRole('checkbox', {name:'Select Album service', exact:true}).waitFor();
    assert.deepEqual(await libraryBounds(serviceLibrary), pendingBounds, `Service library and footer stay put at ${width}px`);
    await serviceLibrary.screenshot({path:`${captures}/service-library-${width}.png`});
    await clearNotifications();
    await serviceLibrary.getByRole('button',{name:'New service',exact:true}).click();
    const newService = page.getByRole('dialog',{name:'Add Services',exact:true});
    await newService.waitFor();
    assert.equal(await newService.evaluate(element=>element.matches(':modal')),true,'Service creation uses the shared modal');
    await newService.getByRole('button',{name:'Create and add',exact:true}).click();
    await newService.getByText('Enter a service name.',{exact:true}).waitFor();
    await newService.getByRole('textbox',{name:'Service name',exact:true}).fill('Fail once');
    await newService.getByRole('button',{name:'Create and add',exact:true}).click();
    await page.getByText('Please retry the service save.',{exact:true}).waitFor();
    await clearNotifications();
    assert.equal(await newService.getByRole('textbox',{name:'Service name',exact:true}).inputValue(),'Fail once');
    assert.equal(await newService.getByRole('combobox',{name:'Pricing type',exact:true}).count(),0);
    await newService.getByRole('switch',{name:/Available as an add-on/}).check();
    await newService.getByRole('spinbutton',{name:'Add-on price (USD)'}).fill('50');
    await newService.getByRole('combobox',{name:'Pricing type',exact:true}).selectOption('HOURLY');
    const switchLayout=await newService.getByRole('switch',{name:/Available as an add-on/}).evaluate(element=>{const label=element.closest('label'),copy=label.querySelector('.ui-switch-copy'),next=label.nextElementSibling;return [copy.getBoundingClientRect().bottom,label.getBoundingClientRect().bottom,next.getBoundingClientRect().top]});
    assert(switchLayout[0]<=switchLayout[1]+1&&switchLayout[1]<switchLayout[2],'Add-on switch descriptions never overlap pricing fields');
    assert((await newService.getByRole('combobox',{name:'Hourly rate'}).locator('option').allTextContents()).includes('Create New Rate'),'The rate selector includes creation');
    assert.equal(await newService.getByRole('button',{name:'Add rate',exact:true}).count(),0);
    await checkModalInsets(newService);
    await newService.screenshot({path:`${captures}/new-service-${width}.png`});
    await newService.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await newService.count(),0);
    await sessionPackage.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(await sessionServices.locator('input[name="sessionOffering"]').inputValue(),draftBefore,'Cancel preserves the session offering');
    assert.equal(await sessionServices.getByLabel('Session draft name').inputValue(),'Unsaved session');
    const extras=sessionServices.getByRole('region',{name:'Suggested Add-Ons',exact:true});
    const extrasBefore=await sessionServices.locator('input[name="sessionOffering"]').inputValue();
    const emptyAddOnHeight=(await extras.getByRole('region',{name:'Suggested add-ons table',exact:true}).boundingBox()).height;
    await extras.getByRole('button',{name:'Add add-on',exact:true}).click();
    const optionalLibrary=page.getByRole('dialog',{name:'Service library',exact:true});
    await optionalLibrary.getByRole('checkbox',{name:'Select Album service',exact:true}).waitFor();
    assert.equal(await optionalLibrary.getByRole('checkbox',{name:'Select Hourly service',exact:true}).isDisabled(),false);
    assert.equal(await optionalLibrary.getByRole('checkbox',{name:'Select Unpriced service',exact:true}).isDisabled(),true);
    await optionalLibrary.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await sessionServices.locator('input[name="sessionOffering"]').inputValue(),extrasBefore);
    await extras.getByRole('button',{name:'Add add-on',exact:true}).click();
    const extraName=width===1440?'Album service':'Hourly service';
    await optionalLibrary.getByRole('checkbox',{name:`Select ${extraName}`,exact:true}).check();
    await optionalLibrary.getByRole('button',{name:'Add 1 service',exact:true}).click();
    await optionalLibrary.waitFor({state:'detached'});
    assert((await extras.getByRole('region',{name:'Suggested add-ons table',exact:true}).boundingBox()).height>=emptyAddOnHeight,'Adding an add-on never shrinks its table card');
    const optionalOffering=JSON.parse(await sessionServices.locator('input[name="sessionOffering"]').inputValue());
    assert(optionalOffering.addOns.some(item=>item.libraryItemId===(width===1440?'flat-extra':'hourly-extra')&&item.price===(width===1440?'50.00':'0.00')));
    assert.equal(await extras.getByRole('textbox').count(),0,'Optional services are selected rather than typed');
    await extras.screenshot({path:`${captures}/optional-services-${width}.png`});
  }
  await clearNotifications();
  await sessionServices.getByRole('button',{name:'Updated Standard',exact:true}).click();
  const creationPackage=page.getByRole('dialog',{name:'Edit Updated Standard',exact:true});
  await creationPackage.getByRole('button',{name:'Add Services',exact:true}).click();
  await page.getByRole('dialog',{name:'Add Services',exact:true}).getByRole('button',{name:'New service',exact:true}).click();
  const createService = page.getByRole('dialog',{name:'Add Services',exact:true});
  await createService.getByRole('textbox',{name:'Service name',exact:true}).fill('Portrait coverage');
  assert.equal(await createService.getByRole('spinbutton',{name:'Add-on price (USD)'}).count(),0);
  await createService.getByRole('switch',{name:/Available as an add-on/}).check();
  await createService.getByRole('spinbutton',{name:'Add-on price (USD)'}).fill('75');
  await createService.getByRole('button',{name:'Create and add',exact:true}).click();
  await createService.getByRole('button',{name:'Apply to package',exact:true}).click();
  await creationPackage.getByRole('button',{name:'Done',exact:true}).click();
  const savedOffering = JSON.parse(await sessionServices.locator('input[name="sessionOffering"]').inputValue());
  assert.equal(savedOffering.coverageItems[0].libraryItemId,'saved-service');
  assert.equal(savedOffering.coverageItems[0].name,'Portrait coverage');
  assert.equal(savedOffering.coverageItems[0].priceCents,7500);
  assert.equal(await sessionServices.getByLabel('Session draft name').inputValue(),'Unsaved session');
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
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    for (const key of ['base','catalog','variants','records','clients','payments','legacy','empty']) {
      await page.mouse.move(0,0);
      const family=page.getByRole('region',{name:'Table family '+key,exact:true});
      if (key==='clients'&&width===390) {
        assert.equal(await family.locator('.clients-table-wrap').isVisible(),false,'Clients retain their mobile card layout');
        continue;
      }
      const header=family.getByRole('columnheader').first();
      assert.deepEqual(await header.evaluate(element=>{const s=getComputedStyle(element);return [s.backgroundColor,s.color,s.fontSize,Math.round(element.getBoundingClientRect().height),s.textTransform];}),['rgb(247, 247, 247)','rgb(74, 74, 74)','12px',32,'none'],key+' shares the table header tokens at '+width+'px');
      const frame=family.locator('.ui-table-wrap,.catalog-table-scroll,.product-variant-table-scroll').first();
      assert.equal(await frame.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 255, 255)',key+' has a white table surface');
      assert.equal(await frame.evaluate(element=>getComputedStyle(element).boxShadow),'none',key+' uses no table elevation');
      assert.equal(await family.evaluate(element=>element.scrollWidth>element.clientWidth),false,key+' scrolls inside its frame on mobile');
      if (key==='empty') {
        assert.equal(Math.round((await family.getByRole('cell').boundingBox()).height),80,'Empty tables use the compact empty-state token');
      } else {
        const rows=family.locator('tbody tr');
        for (const row of await rows.all()) assert.deepEqual(await row.locator('td').first().evaluate(element=>{const style=getComputedStyle(element);return [style.borderBottomWidth,style.borderBottomColor];}),['1px','rgb(221, 221, 221)'],key+' keeps a visible boundary below every record, including the final row');
        assert.equal(await rows.first().evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 255, 255)',key+' rows are white');
        assert.notEqual(await rows.last().evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 255, 255)',key+' retains its selected state');
        const action=family.getByRole('button',{name:'Edit fixture',exact:true});
        assert.equal(await action.evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(0, 0, 0, 0)',key+' row icon actions stay quiet');
      }
      if (key==='clients'||key==='payments') {
        assert.deepEqual(await family.locator('.ui-data-table-titlebar').evaluate(element=>[getComputedStyle(element).backgroundColor,getComputedStyle(element.querySelector('h2')).color,getComputedStyle(element.querySelector('button')).backgroundColor]),['rgb(16, 16, 16)','rgb(255, 255, 255)','rgb(255, 255, 255)'],key+' uses a black title bar with white actions');
      }
      if (key==='base'||key==='catalog'||key==='clients'||key==='payments'||key==='empty') await family.screenshot({path:captures+'/table-family-'+key+'-'+width+'.png'});
    }
  }
  for (const width of [1440,1183,678,390]) {
    await page.setViewportSize({width,height:844});
    for (const name of ['Packages table','Suggested add-ons table']) {
      const table=newSession.getByRole('region',{name,exact:true});
      const header=table.getByRole('columnheader',{name:'Actions',exact:true});
      if (name==='Packages table') assert(await table.getByRole('columnheader',{name:'Duration',exact:true}).evaluate(element=>element.scrollWidth<=element.clientWidth),'Duration header fits at '+width+'px');
      assert(await header.evaluate(element=>element.scrollWidth<=element.clientWidth),'Actions header fits without clipping at '+width+'px');
      assert.equal(await header.evaluate(element=>getComputedStyle(element).whiteSpace),'nowrap');
      assert.equal(Math.round((await header.boundingBox()).height),32,'Column labels never create a second line');
      const records=table.locator('tbody tr');
      if (await records.count()) {
        const bodySpace=(await table.boundingBox()).height-(await table.locator('thead').boundingBox()).height;
        assert(bodySpace>=(await records.first().boundingBox()).height*2-1,'Table cards reserve room for a second row at '+width+'px');
      }

    }
    await packageList.screenshot({path:captures+'/package-columns-'+width+'.png'});
  }
  const photos=page.getByRole('region',{name:'Session photo fixture',exact:true});
  assert.equal(await photos.locator('details').count(),0,'Photos are always visible');
  assert.equal(await photos.getByRole('listitem').count(),0);
  await photos.getByRole('button',{name:'Complete upload',exact:true}).click();
  assert.equal(await photos.getByRole('listitem').count(),5);
  assert.equal(JSON.parse(await photos.locator('input[name="serviceMedia"]').inputValue()).square.assetId,'photo-1');
  await photos.getByRole('button',{name:'Use Photo 3 as main',exact:true}).click();
  let photoValue=JSON.parse(await photos.locator('input[name="serviceMedia"]').inputValue());
  assert.equal(photoValue.square.assetId,'photo-3');
  assert(photoValue.gallery.includes('photo-1'),'Switching main keeps the previous photo');
  await photos.getByRole('button',{name:'Remove Photo 2',exact:true}).click();
  assert.equal(await photos.getByRole('listitem').count(),4);
  for (const width of [1440,517,390]) {
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(200);
    const add=newSession.getByRole('button',{name:'Add package',exact:true});
    const action=await add.evaluate(element=>{const s=getComputedStyle(element),p=getComputedStyle(element,'::before');return {height:element.getBoundingClientRect().height,visual:element.getBoundingClientRect().height-(parseFloat(p.top)||0)-(parseFloat(p.bottom)||0),bg:s.backgroundColor};});
    assert.equal(action.height,width===1440?28:44,'Compact header actions retain a 44px mobile target');
    if (width!==1440) {assert.equal(action.visual,28,'Mobile white pill stays desktop-sized');assert.equal(action.bg,'rgba(0, 0, 0, 0)');}
    const summary=page.locator('summary').filter({hasText:/^Centered section heading$/});
    assert(await summary.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);const text=range.getBoundingClientRect(),box=element.getBoundingClientRect();return Math.abs(text.y+text.height/2-box.y-box.height/2)<2;}),'Collapsible section title is vertically centered');
    const positions=await photos.getByRole('listitem').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().top));
    assert.equal(new Set(positions).size,2,'Thumbnails use two rows beside the hero');
    const photoBoxes=await photos.getByRole('listitem').evaluateAll(items=>items.map(item=>{const b=item.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
    assert(photoBoxes[0].height>photoBoxes[1].height*2,'Hero spans both thumbnail rows');
    assert(photoBoxes.slice(1).every(box=>box.x>photoBoxes[0].x+photoBoxes[0].width),'Thumbnails stay beside the hero');
    assert.equal(await photos.evaluate(element=>element.scrollWidth>element.clientWidth),false);
    const photoAction=photos.getByRole('button',{name:'Remove main photo',exact:true});
    assert.deepEqual(await photoAction.evaluate(element=>{const b=element.getBoundingClientRect();return [b.width,b.height,getComputedStyle(element).backgroundColor];}),[28,28,'rgb(255, 255, 255)'],'Photo controls use compact visible white circles');
    await photos.screenshot({path:captures+'/session-photos-'+width+'.png'});
    await newSession.screenshot({path:captures+'/session-mobile-refinement-'+width+'.png'});
  }
  const builder=page.getByRole('region',{name:'New session builder fixture',exact:true});
  const active=builder.getByRole('switch',{name:'Active',exact:true});
  assert(await active.evaluate(element=>!!element.closest('[aria-labelledby="new-session-details-title"]')),'Active lives in Session details');
  await active.check();
  assert.deepEqual(await active.evaluate(element=>new FormData(element.form).getAll('isActive')),['on'],'Active submits exactly once');
  const details=builder.locator('[aria-labelledby="new-session-details-title"]');
  const tagLabel=details.getByLabel('Tags',{exact:true}).locator('..');
  assert.deepEqual(await tagLabel.evaluate(element=>{const label=element.querySelector('.ui-field-label'),style=getComputedStyle(label);return [style.fontSize,getComputedStyle(element).rowGap];}),['13px','8px'],'Tags use the same label size and field spacing as other form fields');

  assert.equal(await details.locator('input[name="tags"]').count(),1,'Tags live in Session details');
  assert.equal(await builder.getByRole('heading',{name:'Organization',exact:true}).count(),0,'No separate Organization card remains');
  await active.uncheck();
  assert.deepEqual(await active.evaluate(element=>new FormData(element.form).getAll('isActive')),[],'Draft omits the active flag');
  const builderCards=await builder.locator('.studio-panel').evaluateAll(elements=>elements.map(element=>({card:element.classList.contains('ui-section-card'),header:!!element.querySelector('.ui-section-header')})));
  assert(builderCards.length>=6&&builderCards.every(card=>card.card&&card.header),'Every builder card uses the shared black header');
  await builder.getByPlaceholder('Find or add tags').focus();
  const newTag=builder.getByRole('button',{name:'New Tag',exact:true});
  assert(await newTag.evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),'Card headers do not clip the organization tag popup');
  await newTag.click();
  await page.getByRole('dialog',{name:'New tag',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    const switches=bookingRules.locator('.booking-rules-toggle-strip .ui-switch-track');
    const tracks=await switches.evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().top));
    assert.equal(new Set(tracks).size,1,'All three booking toggles stay on one row');
    if (width===390) assert(await bookingRules.locator('.booking-rules-toggle-strip .ui-switch').evaluateAll(elements=>elements.every(element=>{const group=element.getBoundingClientRect(),track=element.querySelector('.ui-switch-track').getBoundingClientRect();return Math.abs(group.x+group.width/2-track.x-track.width/2)<1;})),'Each switch is centered in its column');
    if (width===1440) assert(await bookingRules.locator('.booking-rules-toggle-strip .ui-switch').evaluateAll(elements=>elements.every(element=>{const label=element.querySelector('.ui-switch-copy').getBoundingClientRect(),track=element.querySelector('.ui-switch-track').getBoundingClientRect();return Math.abs(track.x-label.right-8)<1&&Math.abs(track.y+track.height/2-label.y-label.height/2)<1;})),'Desktop switches sit beside their labels');
    if (width===390) {
      const label=bookingRules.getByRole('switch',{name:'Require T&C Acceptance',exact:true}).locator('..').locator('strong');
      assert(await label.evaluate(element=>element.getBoundingClientRect().height<=parseFloat(getComputedStyle(element).lineHeight)+1),'Require T&C stays on one line on mobile');
      assert.equal(await label.locator('.booking-rules-desktop-label').isVisible(),false);
    }

    assert.equal(await bookingRules.locator('.booking-rules-settings').evaluate(element=>getComputedStyle(element).borderTopWidth),'1px','A divider separates booking options from rules');
    await bookingRules.screenshot({path:captures+'/booking-options-'+width+'.png'});
    await builder.screenshot({path:captures+'/session-builder-cards-'+width+'.png'});
  }
  await clearNotifications();
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:844});
    for (const key of ['shared','dashboard','clients','payments','appointments','booking','media','upload','service-picker','gallery','viewer','long-title','onboarding','email','status']) {
      await page.getByRole('button',{name:'Audit '+key,exact:true}).click();
      const modal=page.getByRole('dialog');
      await modal.waitFor();
      const metrics=await modal.evaluate(element=>{
        const title=element.querySelector('.ui-dialog-title');
        const header=element.querySelector('.ui-dialog-header');
        const close=element.querySelector('.ui-dialog-close');
        const ts=getComputedStyle(title),hs=getComputedStyle(header),cs=getComputedStyle(close);
        const b=element.getBoundingClientRect(),hb=header.getBoundingClientRect(),tb=title.getBoundingClientRect(),cb=close.getBoundingClientRect();
        return {type:[ts.fontSize,ts.fontWeight,ts.lineHeight],colors:[hs.backgroundColor,ts.color,getComputedStyle(close,"::before").backgroundColor,cs.color],disc:parseFloat(getComputedStyle(close,"::before").width),overflow:element.scrollWidth>element.clientWidth,inView:b.x>=-1&&b.right<=innerWidth+1&&b.y>=-1&&b.bottom<=innerHeight+1,overlap:tb.right>cb.x+1,close:[cb.width,cb.height],closeInset:b.right-cb.right,headerHeight:hb.height};
      });
      assert.deepEqual(metrics.type,['22px','500','28px'],key+' uses shared modal title typography');
      assert.deepEqual(metrics.colors,['rgb(16, 16, 16)','rgb(255, 255, 255)','rgb(255, 255, 255)','rgb(16, 16, 16)'],key+' uses a black band and white circular close');
      assert.equal(metrics.disc,28,key+' close circle stays compact');
      assert(!metrics.overflow&&metrics.inView&&!metrics.overlap,key+' fits the viewport with readable title and close: '+JSON.stringify(metrics));
      if (width===390) assert(metrics.close.every(size=>size>=44),key+' preserves a full touch target');
      if (!['onboarding','email','long-title'].includes(key)) {
        assert.equal(Math.round(metrics.closeInset),16,key+' close aligns with the body inset');
        assert(metrics.headerHeight<=(width===390?60:46),key+' header remains compact');
      }
      if (key==='shared'||key==='gallery'||key==='viewer'||key==='long-title'||key==='onboarding'||key==='email') await modal.screenshot({path:captures+'/modal-'+key+'-'+width+'.png'});
      await page.keyboard.press('Escape');
      await modal.waitFor({state:'detached'});
    }
  }
  await page.setViewportSize({width:1440,height:844});
  await page.goto('https://design.example/workspace-fixture');
  const workspacePanel=page.getByRole('region',{name:'Session details',exact:true});
  await workspacePanel.focus();
  assert.equal(await workspacePanel.evaluate(element=>getComputedStyle(element).outlineStyle),'none','The noninteractive module wrapper has no giant focus outline');
  await workspacePanel.getByRole('button',{name:'Panel control'}).focus();
  assert.equal(await workspacePanel.getByRole('button',{name:'Panel control'}).evaluate(element=>getComputedStyle(element).outlineStyle),'solid','Controls retain keyboard focus indicators');
  await page.getByRole('button',{name:'Open workspace dialog'}).click();
  const workspaceDialog=page.getByRole('dialog',{name:'Workspace modal'});
  for (const state of ['expanded','collapsed','hidden','mobile']) {
    if(state==='collapsed') await page.locator('.admin-sidebar').evaluate(element=>element.classList.add('is-collapsed'));
    if(state==='hidden') await page.locator('.admin-root').evaluate(element=>{element.style.gridTemplateColumns='1fr';element.querySelector('aside').style.display='none';});
    if(state==='mobile') await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>{
      const w=document.querySelector('.admin-main').getBoundingClientRect(), d=document.querySelector('dialog[open]').getBoundingClientRect();
      return Math.abs(d.x+d.width/2-w.x-w.width/2)<2;
    });
    const geometry=await workspaceDialog.evaluate(element=>{
      const w=document.querySelector('.admin-main').getBoundingClientRect(),d=element.getBoundingClientRect();
      return {fits:d.x>=w.x&&d.right<=w.right,centered:Math.abs(d.x+d.width/2-w.x-w.width/2)<2};
    });
    assert(geometry.fits&&geometry.centered,'Modal aligns to the actual '+state+' workspace');
    await page.screenshot({path:captures+'/workspace-modal-'+state+'.png'});
  }
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log("Passed: hero and two thumbnail rows, compact photo/header controls, centered summaries, booking rules table, eight table families, single-line package columns at four widths, shared controls, package/rate editing, compact duration pickers, and 15 modal families on desktop/mobile (title, black header, compact close circle, alignment, overflow, Escape and focus).");
} finally { await browser.close(); }
