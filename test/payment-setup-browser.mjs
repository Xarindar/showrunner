import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, mkdtempSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
const require = createRequire(import.meta.url);
const {build} = require('esbuild');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(mkdtempSync(resolve(tmpdir(), 'payment-setup-')), 'fixture');
const captures = resolve('.impeccable/review/payment-setup'); mkdirSync(captures, {recursive:true});
await build({stdin:{resolveDir:process.cwd(), loader:'tsx', contents:`
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {PaymentsWorkspace} from './modules/payments/components/payments-workspace';
  import {NotificationProvider} from './components/ui/notifications';
  import './app/globals.css'; import './app/admin/design-tokens.css'; import './app/admin/design-system.css';
  window.actions=[];
  const providers=['STRIPE','SQUARE','PAYPAL'].map((provider,i)=>({provider,name:['Stripe','Square','PayPal'][i],connected:false,needsAttention:false,headline:'Connect an account you own.',manageDetail:'',recommended:i===0}));
  createRoot(document.getElementById('root')).render(<div className="showrunner-admin"><main className="admin-main"><NotificationProvider><PaymentsWorkspace
    timezone="America/Chicago" providers={providers} methods={{connected:false,enabledKeys:[],options:[]}} checkout={{anyConnected:false,disconnected:false,providers:[]}}
    checkoutTotals={{shippingEnabled:false,shippingLabel:'Shipping',taxEnabled:false,taxLabel:'Tax',taxAppliesToShipping:false}} coupons={[]} featuredConnected={false}
  /></NotificationProvider></main></div>);
`}, bundle:true, outfile:output+'.js',jsx:'automatic', plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^\.\.\/actions$/},()=>({path:'actions',namespace:'fixture'}));
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'tsx',contents:args.path==='navigation'?`export const useRouter=()=>({refresh(){}});`:`
    const action=async(previous,form)=>{await new Promise(r=>setTimeout(r,80));window.actions.push(Object.fromEntries(form));return window.fail?{status:'error',message:'Could not verify credentials.'}:{status:'success'}};
    export const connectStripeAction=action,connectSquareAction=action,connectPayPalAction=action;
    export async function inspectSquareLocationsAction(previous,form){return {status:'success',inspectionVersion:form.get('inspectionVersion'),locations:[{id:'one',name:'Studio'},{id:'two',name:'Shop'}]}}
    export const createCouponAction=action,disconnectProviderAction=action,reverifyProviderAction=action,savePaymentMethodsAction=action,saveSquareWebhookKeyAction=action,setCheckoutProviderAction=action,updateCheckoutTotalsAction=action;
  `}));
}}],define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
const server=createServer((req,res)=>{
  if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('Content-Type',req.url.endsWith('js')?'text/javascript':'text/css');res.end(readFileSync(output+(req.url.endsWith('js')?'.js':'.css')));return;}
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
  const errors=[];
  for(const width of [1094,390]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:668}});
    page.on('pageerror',error=>errors.push(error.message));
    const visit=()=>page.goto('http://127.0.0.1:'+server.address().port);
    const next=()=>page.getByRole('button',{name:'Next',exact:true}).click();
    const setup=async i=>{await visit();await page.getByRole('button',{name:'Set up',exact:true}).nth(i).click();};
    await setup(0);const dialog=page.getByRole('dialog');
    assert.equal(await dialog.getByRole('link',{name:'Open Stripe',exact:false}).getAttribute('target'),'_blank');
    await next();const key=page.getByLabel('Stripe secret key',{exact:true});
    assert.equal(await key.inputValue(),'');assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
    await key.fill('   ');assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
    await key.fill('invalid');assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
    await key.fill('sk_test_owned');
    await page.screenshot({path:resolve(captures,'stripe-key-'+width+'.png'),fullPage:true});
    await next();assert.equal(await dialog.locator('[name="stripeWebhookSecret"]').count(),0);
    assert(!(await dialog.innerText()).includes('sk_test_owned'));
    await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await key.inputValue(),'sk_test_owned');await next();
    await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:'Connect Stripe',exact:true}).click();
    await page.getByText('Could not verify credentials.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Done',exact:true}).count(),0);
    await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'Connect Stripe',exact:true}).click();
    await page.getByRole('heading',{name:'Stripe is connected',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.actions.at(-1).useForCheckout),'on');
    await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await dialog.count(),0);
    await setup(1);await next();await next();await page.getByLabel('Square access token',{exact:true}).fill('personal-owned');await next();
    assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Check token and load locations',exact:true}).click();
    await page.getByLabel('Square location',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
    await page.getByLabel('Square location',{exact:true}).selectOption('two');
    await page.screenshot({path:resolve(captures,'square-locations-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByLabel('Square access token',{exact:true}).fill('changed-token');await next();
    assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),'changed token must reload its locations');
    await page.getByRole('button',{name:'Check token and load locations',exact:true}).click();await page.getByLabel('Square location',{exact:true}).selectOption('one');await next();
    await page.getByRole('button',{name:'Connect Square',exact:true}).click();await page.getByRole('heading',{name:'Square is connected',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.actions.at(-1).squareLocationId),'one');
    await setup(2);await next();await next();const id=page.getByLabel('PayPal client ID',{exact:true});assert.equal(await id.inputValue(),'');await id.fill('owned-app');await next();
    const secret=page.getByLabel('PayPal secret',{exact:true});assert.equal(await secret.inputValue(),'');await secret.fill('owned-secret');await next();
    assert.equal(await dialog.locator('[name="paypalWebhookId"]').count(),0);
    await page.getByLabel('Use this account for new checkouts').uncheck();
    await page.screenshot({path:resolve(captures,'paypal-review-'+width+'.png'),fullPage:true});
    assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
    await page.getByRole('button',{name:'Connect PayPal',exact:true}).click();await page.getByRole('heading',{name:'PayPal is connected',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.actions.at(-1).useForCheckout),undefined);
    assert.equal(await page.locator('a[href*="/api/payments/connect/"]').count(),0);
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('Payment setup passed on desktop and mobile: required fields, back, failures, independent setup, Square locations, success and checkout choice.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
