const fs = require('node:fs');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { createServer } = require('node:http');
const path = require('node:path');
const output = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'showrunner-media-')), 'fixture.js');
fs.mkdirSync('.tmp', {recursive:true});
(async () => {
  await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {MediaLibraryWorkspace} from './modules/media/media-library-workspace';
    import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css';
    const root=createRoot(document.getElementById('root'));
    const asset={id:'test-file',filename:'Garden.jpg',folder:'',mimeType:'image/jpeg',displayUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="200"%3E%3Crect width="300" height="200" fill="%2354755b"/%3E%3C/svg%3E',tags:[],width:300,height:200,sizeBytes:1024,alt:'Garden',usageCount:0};
    Object.assign(asset,{fullUrl:asset.displayUrl,heroUrl:asset.displayUrl,createdAt:'2026-10-26',focalPointX:0.5,focalPointY:0.5,caption:'',credit:'',usageContext:'',isPrivate:false});
    window.folders=[{name:'empty folder',count:0}]; window.assets=[asset,{...asset,id:'second',filename:'Second.jpg'},{...asset,id:'third',filename:'Third.jpg'}];
    window.filters={scope:'all',folder:'',kind:'all',tag:'',q:'',page:1,sort:'newest'};
    window.render=()=>root.render(<MediaLibraryWorkspace key={window.filters.folder} assets={window.assets.filter(a=>a.folder===window.filters.folder)} folders={window.folders} filters={window.filters} activeCount={3} archivedCount={0} builtInCount={0} canUpload={true} errorMessage="" needsAltCount={0} pageCount={1} privateCount={0} recentCount={3} resultCount={window.assets.filter(a=>a.folder===window.filters.folder).length} savedMessage="" tags={[]}/>);
    window.render();`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle:true, outfile:output, jsx:'automatic', plugins:[{name:'fixture',setup(b){
      b.onResolve({filter:/^(next\/navigation|next\/image|next\/link|.*notifications|\.\/actions|\.\/upload-assets-modal)$/}, a=>({path:a.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'jsx',resolveDir:process.cwd(),contents:
        path==='next/navigation'?`export const useRouter=()=>({push(url){window.filters={...window.filters,folder:new URL(url,'http://localhost').searchParams.get('folder')||''};window.render()},refresh(){window.render()}});`:
        path==='next/image'?`import React from 'react';export default function Image({fill,priority,unoptimized,...props}){return <img {...props} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}`:
        path==='next/link'?`import React from 'react';export default function Link(props){return <a {...props}/>}`:
        path.includes('notifications')?`export const useNotify=()=>message=>{window.lastNotice=message};export const Notification=()=>null;`:
        path.includes('upload-assets')?`export const UploadAssetsModal=()=>null;`:
        `export async function createMediaFolder(data){const name=[data.get('parent'),data.get('name')].filter(Boolean).join('/');window.folders.push({name,count:0});return {name}};export async function moveMediaAssetToFolder(data){window.moves=(window.moves||0)+1;if(window.failMove)return {error:'The file could not be moved. Please try again.'};window.assets.filter(a=>data.getAll('id').includes(a.id)).forEach(a=>a.folder=data.get('folder'));window.folders.forEach(f=>f.count=window.assets.filter(a=>a.folder===f.name).length);return {success:true}};export async function renameMediaAsset(data){window.assets.find(a=>a.id===data.get('id')).filename=data.get('name');return {success:true}};export async function changeMediaFolder(data){const folder=data.get('folder');const operation=data.get('operation');const value=data.get('value');if(operation==='delete'){if(window.assets.some(a=>a.folder===folder)||window.folders.some(f=>f.name.startsWith(folder+'/')))return {error:'This folder is not empty.'};window.folders=window.folders.filter(f=>f.name!==folder)}else{const parent=folder.split('/').slice(0,-1).join('/');const destination=operation==='rename'?[parent,value].filter(Boolean).join('/'):[value,folder.split('/').at(-1)].filter(Boolean).join('/');window.folders.forEach(f=>{if(f.name===folder||f.name.startsWith(folder+'/'))f.name=destination+f.name.slice(folder.length)});window.assets.forEach(a=>{if(a.folder===folder||a.folder.startsWith(folder+'/'))a.folder=destination+a.folder.slice(folder.length)})}return {success:true}};export async function deleteMediaAsset(data){window.assets=window.assets.filter(a=>a.id!==data.get('id'));return {success:true}};export const archiveMediaAssetAction=()=>{};export const restoreMediaAssetAction=()=>{};export const setHeroImageAction=()=>{};export const updateMediaAssetAction=()=>{};`
      }));
    }}] });
  const server=createServer((req,res)=>{if(req.url.endsWith('.js')||req.url.endsWith('.css')){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(output.replace(/\.js$/,req.url.endsWith('.js')?'.js':'.css')))}else res.end('<html><head><link rel="stylesheet" href="/fixture.css"></head><body class="showrunner-admin" style="padding:24px"><main id="root"></main><script src="/fixture.js"></script></body></html>')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    assert(await page.getByRole('button',{name:'Back to parent folder',exact:true}).isDisabled());
    const crumbs=await page.getByRole('navigation',{name:'Folder path',exact:true}).boundingBox();
    const search=await page.getByRole('search').boundingBox();
    assert(crumbs.y>=search.y+search.height);
    await page.getByRole('button',{name:'New folder',exact:true}).click();
    assert((await page.getByRole('dialog',{name:'New folder',exact:true}).boundingBox()).width<=440);
    await page.getByLabel('Folder name').fill('Family Photos');
    await page.getByLabel('Folder name').press('Enter');
    const folder=page.getByRole('navigation',{name:'Media folders'}).getByRole('button',{name:'Family Photos 0 files',exact:true});
    await folder.waitFor();
    const first=page.locator('[data-media-id="test-file"]'),second=page.locator('[data-media-id="second"]');
    const a=await first.boundingBox(),b=await second.boundingBox(),f=await folder.boundingBox();
    assert(Math.abs(a.width-f.width)<2);
    await page.mouse.move(a.x-3,a.y+a.height+3);await page.mouse.down();
    await page.mouse.move(b.x+b.width-2,b.y+8,{steps:8});await page.mouse.up();
    assert.equal(await page.getByRole('checkbox',{checked:true}).count(),2);
    await page.mouse.move(a.x+50,a.y+50);await page.mouse.down();await page.mouse.move(a.x+65,a.y+65,{steps:3});
    await page.getByRole('status').filter({hasText:'2 files'}).waitFor();
    assert.equal(await page.locator('[data-media-id]').count(),1);
    await page.waitForTimeout(220);
    assert(Math.abs((await page.locator('[data-media-id="third"]').boundingBox()).x-a.x)<2);
    await page.screenshot({path:'.tmp/media-folder-picked-up.png',fullPage:true});
    await page.mouse.move(f.x+f.width/2,f.y+f.height/2,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>window.assets[0].folder==='Family Photos' && window.assets[1].folder==='Family Photos');
    assert.equal(await page.evaluate(()=>window.moves),1);
    await page.getByRole('navigation',{name:'Media folders'}).getByRole('button',{name:'Family Photos 2 files',exact:true}).click();
    await page.getByRole('button',{name:'View details for Garden.jpg'}).waitFor();
    await page.getByRole('button',{name:'New folder',exact:true}).click();
    await page.getByLabel('Folder name').fill('Summer Memories');await page.getByLabel('Folder name').press('Enter');
    assert.equal(await page.evaluate(()=>window.filters.folder),'Family Photos');
    await page.getByRole('button',{name:'Summer Memories 0 files',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'empty folder 0 files',exact:true}).count(),0);
    await page.screenshot({path:'.tmp/media-folder-fixed-desktop.png',fullPage:true});
    await page.evaluate(()=>window.failMove=true);
    async function dragFile(){
      const from=await page.getByRole('button',{name:'View details for Garden.jpg'}).boundingBox();
      const to=await page.getByRole('button',{name:'Summer Memories 0 files',exact:true}).boundingBox();
      await page.mouse.move(from.x+50,from.y+50);await page.mouse.down();await page.mouse.move(from.x+65,from.y+65,{steps:3});
      await page.mouse.move(to.x+50,to.y+50,{steps:8});
    }
    await dragFile();await page.mouse.up();
    await page.waitForFunction(()=>window.lastNotice.includes('could not be moved'));
    await page.getByRole('button',{name:'View details for Garden.jpg'}).waitFor();
    assert.equal(await page.evaluate(()=>window.assets[0].folder),'Family Photos');
    await dragFile();await page.keyboard.press('Escape');await page.mouse.up();
    await page.getByRole('button',{name:'View details for Garden.jpg'}).waitFor();
    assert.equal(await page.evaluate(()=>window.moves),2);
    await page.getByRole('button',{name:'View details for Garden.jpg'}).focus();await page.keyboard.press('Enter');
    const details=page.getByRole('dialog',{name:'Garden.jpg',exact:true});await details.waitFor();
    const body=details.locator(':scope > .ui-dialog-body');
    assert(await body.evaluate(el=>el.scrollHeight>el.clientHeight));
    const bounds=await details.boundingBox(),inner=await body.boundingBox();
    assert(inner.x>bounds.x && inner.x+inner.width<bounds.x+bounds.width);
    await body.evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'List view',exact:true}).click();
    if(await page.getByRole('button',{name:'Clear selection',exact:true}).count()) await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    await page.getByRole('checkbox',{name:'Select Second.jpg',exact:true}).focus();await page.keyboard.press('Space');
    assert(await page.getByRole('checkbox',{name:'Select Second.jpg',exact:true}).isChecked());
    await page.getByLabel('Move selected files to folder').selectOption('folder:Family Photos/Summer Memories');
    await page.waitForFunction(()=>window.moves===3);
    await page.getByRole('button',{name:'View details for Second.jpg'}).waitFor();
    await page.getByRole('button',{name:'Grid view',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Summer Memories 0 files',exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:'This folder is empty'}).waitFor();
    await page.getByRole('button',{name:'Back to parent folder',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.filters.folder),'Family Photos');
    await page.getByRole('button',{name:'Summer Memories 0 files',exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:'.tmp/media-folder-fixed-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'New folder',exact:true}).click();
    assert((await page.getByRole('dialog',{name:'New folder',exact:true}).boundingBox()).width<=358);
    await page.screenshot({path:'.tmp/media-folder-modal-mobile.png',fullPage:true});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Media home',exact:true}).click();
    await page.setViewportSize({width:1280,height:900});
    async function menu(name,action){
      await page.getByLabel('More actions for '+name,{exact:true}).click();
      assert.equal(await page.getByRole('dialog').count(),0);
      await page.getByRole('group',{name:'Actions for '+name,exact:true}).getByRole('button',{name:action,exact:true}).click();
    }
    await menu('Third.jpg','Rename');
    await page.getByRole('dialog',{name:'Rename file'}).getByLabel('Name',{exact:true}).fill('Third Photo.jpg');
    await page.getByRole('dialog',{name:'Rename file'}).getByLabel('Name',{exact:true}).press('Enter');
    await page.getByRole('button',{name:'View details for Third Photo.jpg'}).waitFor();
    await menu('Third Photo.jpg','Move');
    await page.getByLabel('Destination folder').selectOption('empty folder');
    await page.getByRole('dialog',{name:'Move file'}).getByRole('button',{name:'Move',exact:true}).click();
    await page.getByRole('alert').waitFor();
    await page.evaluate(()=>window.failMove=false);
    await page.getByRole('dialog',{name:'Move file'}).getByRole('button',{name:'Move',exact:true}).click();
    await page.getByRole('button',{name:'empty folder 1 file',exact:true}).waitFor();
    await menu('empty folder','Rename');
    await page.getByRole('dialog',{name:'Rename folder'}).getByLabel('Name',{exact:true}).fill('Other Photos');
    await page.getByRole('button',{name:'Save name',exact:true}).click();
    await page.getByRole('button',{name:'Other Photos 1 file',exact:true}).waitFor();
    await menu('Other Photos','Delete');
    await page.getByRole('dialog',{name:'Delete folder'}).getByRole('button',{name:'Delete',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'not empty'}).waitFor();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await menu('Other Photos','Move');
    assert.equal(await page.getByLabel('Destination folder').locator('option[value="Other Photos"]').count(),0);
    await page.getByLabel('Destination folder').selectOption('Family Photos');
    await page.getByRole('dialog',{name:'Move folder'}).getByRole('button',{name:'Move',exact:true}).click();
    await page.waitForFunction(()=>window.assets.find(a=>a.id==='third').folder==='Family Photos/Other Photos');
    await page.getByRole('button',{name:'Family Photos 3 files',exact:true}).click();
    await page.getByRole('button',{name:'Other Photos 1 file',exact:true}).click();
    await menu('Third Photo.jpg','Delete');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'View details for Third Photo.jpg'}).waitFor();
    await menu('Third Photo.jpg','Delete');
    await page.getByRole('dialog',{name:'Delete file'}).getByRole('button',{name:'Delete',exact:true}).click();
    await page.waitForFunction(()=>!window.assets.some(a=>a.id==='third'));
    await page.getByRole('button',{name:'Back to parent folder',exact:true}).click();
    await menu('Summer Memories','Delete');
    await page.getByRole('dialog',{name:'Delete folder'}).getByRole('button',{name:'Delete',exact:true}).click();
    await page.waitForFunction(()=>!window.folders.some(f=>f.name.endsWith('/Summer Memories')));
    await page.setViewportSize({width:390,height:844});
    await page.getByLabel('More actions for Garden.jpg',{exact:true}).focus();await page.keyboard.press('Enter');
    const menuBounds=await page.getByRole('group',{name:'Actions for Garden.jpg'}).boundingBox();assert(menuBounds.x>=0 && menuBounds.x+menuBounds.width<=390);
    await page.screenshot({path:'.tmp/media-card-menu-mobile.png',fullPage:true});
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('group',{name:'Actions for Garden.jpg'}).count(),0);
    assert.deepEqual(errors,[]); console.log('PASS: compact modal, Enter confirms, names preserved, same-size folder/file grid, marquee multi-selection, styled pickup, immediate removal/reflow, batch drop, nested folders, failed move rollback, Escape cancellation, mobile keyboard navigation and overflow.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
