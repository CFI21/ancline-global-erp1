import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const OUT='ui-hardening-artifacts';
// Freeze-candidate rerun after responsive/accessibility fixes.
mkdirSync(OUT,{recursive:true});
const assert=(x,m)=>{if(!x)throw new Error(m)};
const profiles=[
  {name:'desktop',viewport:{width:1440,height:1000}},
  {name:'tablet',viewport:{width:820,height:1180}},
  {name:'mobile',viewport:{width:390,height:844}}
];
async function establish(page,email='test.admin@ancline.invalid',role='GLOBAL_ADMIN'){
  await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  const r=await page.evaluate(async ({email,role})=>{
    const x=await fetch('/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role})});
    const b=await x.json().catch(()=>null);
    if(x.ok&&b?.accessToken){localStorage.setItem('ancline_token',b.accessToken);localStorage.setItem('ancline_user',JSON.stringify(b.user));}
    return {status:x.status,user:b?.user||null};
  },{email,role});
  assert(r.status>=200&&r.status<300&&r.user,'auth failed '+r.status); return r.user;
}
async function api(page,path){return page.evaluate(async path=>{const t=localStorage.getItem('ancline_token');const r=await fetch('/api-proxy'+path,{headers:{Authorization:'Bearer '+t}});return {status:r.status,body:await r.json().catch(()=>null)}},path)}
async function goto(page,path){const r=await page.goto(WEB_URL+path,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(900);assert(r&&r.status()<500,path+' HTTP '+r?.status());}
async function snap(page,name){await page.screenshot({path:OUT+'/'+name+'.png',fullPage:true});}
async function layout(page,label){
  const m=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
    clipped:Array.from(document.querySelectorAll('input,select,button,a')).filter(el=>{
      const r=el.getBoundingClientRect();
      if(!(r.width>0&&(r.right>window.innerWidth+2||r.left<-2)))return false;
      let p=el.parentElement;
      while(p){
        const s=getComputedStyle(p);
        const canScrollX=(['auto','scroll'].includes(s.overflowX)||['auto','scroll'].includes(s.overflow))&&p.scrollWidth>p.clientWidth+2;
        if(canScrollX)return false;
        p=p.parentElement;
      }
      return true;
    }).slice(0,20).map(el=>({tag:el.tagName,text:(el.textContent||'').trim().slice(0,40),left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))
  }));
  assert(Math.max(m.scrollWidth,m.bodyScrollWidth)<=m.innerWidth+4,label+' horizontal page overflow '+JSON.stringify(m));
  assert(m.clipped.length===0,label+' unscrollable clipped interactive controls '+JSON.stringify(m.clipped));
  return m;
}
async function a11y(page,label){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  const serious=result.violations.filter(v=>['serious','critical'].includes(v.impact||''));
  if(serious.length){console.error('A11Y_DETAIL '+label+' '+JSON.stringify(serious.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,25).map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))}))));}
  assert(serious.length===0,label+' accessibility serious/critical '+JSON.stringify(serious.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,help:v.help}))));
  return {violations:result.violations.length,serious:0};
}
const browser=await chromium.launch({headless:true});
const report={schema:'ANCLINE_SIMPLE_SECURE_UI_HARDENING_V1',startedAt:new Date().toISOString(),responsive:[],failureStates:[],validation:[],session:[],accessibility:[],status:'RUNNING'};
try{
  for(const p of profiles){
    const ctx=await browser.newContext({viewport:p.viewport}); const page=await ctx.newPage();
    await establish(page); await goto(page,'/bookings');
    const l=await layout(page,p.name+' bookings');
    const menuSearch=page.locator('input[aria-label="Search ANCLINE menu"]');
    const mobileToggle=page.locator('[aria-label="Open navigation"], [aria-label="Close navigation"]');
    if(p.name==='desktop') assert(await menuSearch.isVisible(),'desktop sidebar menu search hidden');
    else assert(await menuSearch.isVisible()||await mobileToggle.count()>0,p.name+' has no usable navigation control');
    const search=page.locator('input[placeholder="Search bookings..."]'); assert(await search.isVisible(),p.name+' booking search hidden');
    await search.fill('50004'); await page.waitForTimeout(200); assert((await page.locator('body').innerText()).includes('50004'),p.name+' filtered booking not visible');
    const ax=await a11y(page,p.name+' bookings');
    await snap(page,p.name+'-bookings');
    report.responsive.push({profile:p.name,viewport:p.viewport,layout:l,navigation:'PASS',bookingGrid:'PASS'});
    report.accessibility.push({profile:p.name,page:'bookings',...ax,status:'PASS'});
    await ctx.close();
  }

  // Empty state.
  {
    const ctx=await browser.newContext({viewport:{width:820,height:1180}});const page=await ctx.newPage();await establish(page);await goto(page,'/bookings');
    const s=page.locator('input[placeholder="Search bookings..."]');await s.fill('__NO_SUCH_BOOKING__');await page.waitForTimeout(200);
    assert((await page.locator('body').innerText()).includes('No bookings found.'),'empty booking state missing');
    report.failureStates.push({case:'empty-booking-search',status:'PASS'});await ctx.close();
  }

  // Validation state, no mutation.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();await establish(page);await goto(page,'/bookings');
    const origin=page.getByText('Origin *',{exact:true}).locator('..').locator('input');
    const destination=page.getByText('Destination *',{exact:true}).locator('..').locator('input');
    if(await origin.count())await origin.fill('');
    if(await destination.count())await destination.fill('');
    await page.getByRole('button',{name:'Save Booking'}).click();await page.waitForTimeout(150);
    assert((await page.locator('body').innerText()).includes('Origin and Destination are required.'),'required-field validation message missing');
    report.validation.push({case:'booking-required-fields',status:'PASS'});await ctx.close();
  }

  // Session expiry / token loss must fail closed.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();await establish(page);await goto(page,'/bookings');
    await page.evaluate(()=>{localStorage.removeItem('ancline_token');localStorage.removeItem('ancline_user')});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(700);
    assert(new URL(page.url()).pathname==='/login','expired/missing session did not return to login: '+page.url());
    report.session.push({case:'missing-token-redirect-login',status:'PASS'});await ctx.close();
  }

  // API failure: intercept bookings request and ensure recoverable notice, not blank/crash.
  {
    const ctx=await browser.newContext({viewport:{width:820,height:1180}});const page=await ctx.newPage();await establish(page);
    await page.route('**/api-proxy/bookings',async route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic UAT outage'})}));
    await goto(page,'/bookings');
    const text=await page.locator('body').innerText();
    assert(/unable|error|503|outage/i.test(text),'API failure did not render a visible recoverable notice');
    assert(await page.locator('body').count()===1,'API failure crashed page');
    report.failureStates.push({case:'bookings-api-503',status:'PASS'});await snap(page,'tablet-api-failure');await ctx.close();
  }

  // Slow API: delayed response should preserve usable page and eventually settle.
  {
    const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();await establish(page);
    await page.route('**/api-proxy/bookings',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue()});
    const t=Date.now();await goto(page,'/bookings');const elapsed=Date.now()-t;
    assert(elapsed>=1600,'slow API delay was not exercised');
    assert(await page.locator('input[placeholder="Search bookings..."]').isVisible(),'slow API left booking UI unusable');
    report.failureStates.push({case:'slow-bookings-api',elapsedMs:elapsed,status:'PASS'});await ctx.close();
  }

  report.status='PASS';report.finishedAt=new Date().toISOString();
}catch(e){report.status='FAIL';report.finishedAt=new Date().toISOString();report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1}
finally{mkdirSync(OUT,{recursive:true});writeFileSync(OUT+'/ANCLINE_UI_HARDENING.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close()}

// live-hardening-rerun-after-responsive-accessibility-fixes: 2026-09-22T21:00Z
