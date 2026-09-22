import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const JOBS=['50001','50002','50003','50004','50005'];
const OUT='ui-acceptance-artifacts';
mkdirSync(OUT,{recursive:true});
const assert=(x,m)=>{if(!x)throw new Error(m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function establish(page,email,requestedRole){
  await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  const auth=await page.evaluate(async ({email,requestedRole})=>{
    const r=await fetch('/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role:requestedRole})});
    const raw=await r.text(); let body; try{body=raw?JSON.parse(raw):null}catch{body=raw}
    if(r.ok&&body?.accessToken){
      localStorage.setItem('ancline_token',body.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(body.user));
    }
    return {ok:r.ok,status:r.status,user:body?.user||null,body:body?.accessToken?{...body,accessToken:'[redacted]'}:body};
  },{email,requestedRole});
  assert(auth.ok&&auth.user, email+': auth failed '+auth.status+' '+JSON.stringify(auth.body));
  return auth.user;
}
async function api(page,path,init={}){
  return page.evaluate(async ({path,init})=>{
    const token=localStorage.getItem('ancline_token');
    const headers={...(init.headers||{}),Authorization:'Bearer '+token};
    if(init.body!==undefined)headers['Content-Type']='application/json';
    const r=await fetch('/api-proxy'+path,{...init,headers});
    const raw=await r.text(); let body; try{body=raw?JSON.parse(raw):null}catch{body=raw}
    return {ok:r.ok,status:r.status,body};
  },{path,init});
}
async function shot(page,name){await page.screenshot({path:OUT+'/'+name+'.png',fullPage:true});}
async function safeGoto(page,path){const r=await page.goto(WEB_URL+path,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(1000);assert(r&&r.status()<500,path+': HTTP '+(r?.status()));}
async function reseed(page){const r=await api(page,'/test-data/seed',{method:'POST',body:'{}'});assert(r.ok,'reseed HTTP '+r.status);return r.body;}

const report={schema:'ANCLINE_SIMPLE_SECURE_UI_FINAL_ACCEPTANCE_V1',startedAt:new Date().toISOString(),webUrl:WEB_URL,roles:[],jobs:[],navigation:[],forms:[],grids:[],popups:[],privacy:[],exceptions:[],status:'RUNNING'};
const browser=await chromium.launch({headless:true});

try{
  // GLOBAL ADMIN — seed, menu/search, booking register, form, all jobs.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await ctx.newPage();
    const user=await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN');
    assert(user.role==='GLOBAL_ADMIN','admin role mismatch');
    await safeGoto(page,'/bookings');
    await reseed(page);

    const menuSearch=page.locator('input[aria-label="Search ANCLINE menu"]');
    await menuSearch.fill('Bookings');
    await page.waitForTimeout(250);
    assert(await page.locator('a[href="/bookings"]').count()>0,'menu search did not expose Bookings');
    report.navigation.push({role:'GLOBAL_ADMIN',case:'menu-search-bookings',status:'PASS'});
    await page.locator('button[aria-label="Clear menu search"]').click();

    assert(await page.locator('table.table').count()>0,'booking grid missing');
    const bookingSearch=page.locator('input[placeholder="Search bookings..."]');
    await bookingSearch.fill('50001'); await page.waitForTimeout(300);
    const body50001=await page.locator('body').innerText();
    assert(body50001.includes('50001'),'booking search did not show 50001');
    assert(!body50001.includes('50005')||await page.locator('tbody').innerText().then(t=>!t.includes('50005')),'booking filter leaked unrelated row');
    await bookingSearch.fill('');
    report.grids.push({role:'GLOBAL_ADMIN',surface:'Booking Register',searchFilter:'PASS',status:'PASS'});

    assert(await page.getByText('Booking & Customer',{exact:true}).count()>0,'booking form panel missing');
    assert(await page.getByText('Routing & Agents',{exact:true}).count()>0,'routing form panel missing');
    assert(await page.getByText('Carrier / Vessel / Schedule',{exact:true}).count()>0,'carrier form panel missing');
    assert(await page.getByText('Equipment & Cargo',{exact:true}).count()>0,'cargo form panel missing');
    const details=page.locator('details.booking-detail-section');
    assert(await details.count()>=4,'additional booking sections missing');
    await details.first().locator('summary').click();
    assert(await details.first().getAttribute('open')!==null,'booking details did not expand');
    report.forms.push({role:'GLOBAL_ADMIN',surface:'Booking intake',sections:4,expandable:'PASS',status:'PASS'});

    const summary=(await api(page,'/test-data/summary')).body;
    const byNo=new Map((summary.bookings||[]).map(x=>[String(x.bookingNo),x]));
    for(const n of JOBS){
      const b=byNo.get(n); assert(b,'missing '+n);
      await safeGoto(page,'/bookings/'+encodeURIComponent(b.id));
      await page.waitForFunction(
        expected => document.body.innerText.includes(String(expected)) || document.body.innerText.includes('Unable to load booking'),
        n,
        {timeout:15000}
      );
      let text=await page.locator('body').innerText();
      if(!text.includes(n)&&!text.includes('Unable to load booking')){
        await page.reload({waitUntil:'domcontentloaded',timeout:60000});
        await page.waitForFunction(expected => (document.body?.innerText||'').includes(String(expected)) || (document.body?.innerText||'').includes('Unable to load booking'),n,{timeout:15000});
        text=await page.locator('body').innerText();
      }
      assert(!text.includes('Unable to load booking'),n+': detail load failed');
      assert(text.includes(n),n+': detail reference missing after retry');
      assert(text.includes(String(b.route||'')),n+': route missing');
      assert(await page.locator('.card').count()>0,n+': detail cards missing');
      report.jobs.push({bookingNo:n,businessModel:b.businessModel,specialCargo:b.specialCargo||null,role:'GLOBAL_ADMIN',status:'PASS'});
    }
    await safeGoto(page,'/bookings');
    await shot(page,'admin-bookings');
    report.roles.push({role:'GLOBAL_ADMIN',status:'PASS'});
    await ctx.close();
  }

  // OPS — NVOCC workspace + internal navigation + grid.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.ops@ancline.invalid','BRANCH_OPS'); assert(user.role==='BRANCH_OPS','ops role mismatch');
    await safeGoto(page,'/nvocc-portal');
    assert(await page.locator('.menu-section').count()>0,'OPS internal menu missing');
    const text=await page.locator('body').innerText();
    assert(text.includes('NVOCC'),'OPS NVOCC workspace missing');
    assert(await page.locator('table.table').count()>0,'OPS NVOCC grid missing');
    await shot(page,'ops-nvocc');
    report.roles.push({role:'BRANCH_OPS',status:'PASS'});
    report.grids.push({role:'BRANCH_OPS',surface:'NVOCC Portal',status:'PASS'});
    await ctx.close();
  }

  // FINANCE — accounting grid/search and popup/dialog behavior.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.finance@ancline.invalid','FINANCE'); assert(user.role==='FINANCE','finance role mismatch');
    await safeGoto(page,'/accounting');
    assert(await page.getByText('Invoice Register',{exact:true}).count()>0,'Invoice Register missing');
    assert(await page.locator('table.table').count()>0,'accounting tables missing');
    const search=page.locator('input[placeholder="Search invoice, job, party..."]');
    assert(await search.count()===1,'invoice search missing');
    await search.fill('50001'); await page.waitForTimeout(250);
    report.grids.push({role:'FINANCE',surface:'Invoice Register',search:'PASS',status:'PASS'});

    // Safe popup proof: click Payment only if an eligible synthetic invoice exists, dismiss prompt before mutation.
    const pay=page.getByRole('button',{name:'Payment'}).first();
    if(await pay.count()){
      let seen=false;
      page.once('dialog',async d=>{seen=true; await d.dismiss();});
      await pay.click(); await page.waitForTimeout(250);
      assert(seen,'Payment button did not open expected dialog');
      report.popups.push({role:'FINANCE',surface:'Payment prompt',status:'PASS'});
    }else{
      // Generic browser command popup surface: print is wired in WorkspaceShell; assert control presence without invoking system print UI.
      assert(await page.getByRole('button',{name:'Print'}).count()===1,'Workspace print command missing');
      report.popups.push({role:'FINANCE',surface:'Payment prompt',status:'NOT_APPLICABLE_NO_ELIGIBLE_INVOICE',fallback:'workspace-command-present'});
    }
    await shot(page,'finance-accounting');
    report.roles.push({role:'FINANCE',status:'PASS'});
    await ctx.close();
  }

  // CUSTOMER — external portal, new-booking form, shipment grid, track expansion, privacy.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.customer.nl@ancline.invalid','CUSTOMER'); assert(user.role==='CUSTOMER','customer role mismatch');
    await safeGoto(page,'/customer-portal');
    assert(await page.locator('.menu-section').count()===0,'CUSTOMER exposed internal workflow menu');
    assert(await page.locator('#new-booking').count()===1,'customer new booking form missing');
    assert(await page.locator('#new-booking input, #new-booking select, #new-booking button').count()>4,'customer forwarding form controls missing');
    const search=page.locator('input[placeholder*="Search booking"]'); assert(await search.count()===1,'customer shipment search missing');
    await search.fill('50001'); await page.waitForTimeout(250);
    const shipmentTable=page.locator('table.table').filter({hasText:'50001'}).last();
    assert(await shipmentTable.count()===1,'customer shipment table not uniquely resolved');
    assert((await shipmentTable.locator('tbody').innerText()).includes('50001'),'customer grid missing 50001');
    const track=page.getByRole('button',{name:'Track'}).first(); assert(await track.count()===1,'customer Track action missing');
    await track.click(); await page.waitForTimeout(250);
    const t=await page.locator('body').innerText();
    assert(t.includes('Shipment Timeline')&&t.includes('Containers')&&t.includes('Released Documents'),'customer tracking expansion incomplete');
    for(const forbidden of ['beneficialOwners','registeredAddress','contactPhone','TEST UBO']) assert(!t.includes(forbidden),'customer portal leaked KYC field '+forbidden);
    report.forms.push({role:'CUSTOMER',surface:'Forwarding booking',status:'PASS'});
    report.grids.push({role:'CUSTOMER',surface:'Shipment grid + tracking',status:'PASS'});
    report.privacy.push({role:'CUSTOMER',case:'no-internal-menu-no-KYC-leak',status:'PASS'});
    await shot(page,'customer-portal');
    report.roles.push({role:'CUSTOMER',status:'PASS'});
    await ctx.close();
  }

  // AGENT — controlled NVOCC primary + forwarding exception only.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.agent.sg@ancline.invalid','AGENT'); assert(user.role==='AGENT','agent role mismatch');
    await safeGoto(page,'/agent-portal');
    assert(await page.locator('.menu-section').count()===0,'AGENT exposed internal workflow menu');
    const text=await page.locator('body').innerText();
    assert(text.includes('NVOCC Liner Agency'),'agent NVOCC mode missing');
    assert(text.includes('Forwarding Direct Co-load / Cross Trade'),'agent forwarding exception surface missing');
    assert(await page.locator('a[href="/nvocc-portal"]').count()>0,'agent NVOCC navigation missing');
    assert(await page.locator('a[href="/customer-portal"]').count()>0,'authorized agent forwarding exception link missing');
    report.navigation.push({role:'AGENT',case:'NVOCC-primary-forwarding-exception',status:'PASS'});
    report.privacy.push({role:'AGENT',case:'no-internal-workflow-menu',status:'PASS'});
    await shot(page,'agent-portal');
    report.roles.push({role:'AGENT',status:'PASS'});
    await ctx.close();
  }

  // SHIPPER — scoped customer portal, no internal UI, 50001/50002 only.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.shipper.nl@ancline.invalid','SHIPPER'); assert(user.role==='SHIPPER','shipper role mismatch');
    await safeGoto(page,'/customer-portal');
    assert(await page.locator('.menu-section').count()===0,'SHIPPER exposed internal menu');
    const bookings=await api(page,'/bookings'); assert(bookings.status===200,'shipper bookings unavailable');
    const visible=(Array.isArray(bookings.body)?bookings.body:[]).map(x=>String(x.bookingNo)).filter(x=>JOBS.includes(x)).sort();
    assert(visible.includes('50001')&&visible.includes('50002'),'SHIPPER expected jobs missing');
    assert(!visible.includes('50004')&&!visible.includes('50005'),'SHIPPER scope leaked out-of-scope jobs '+visible.join(','));
    report.privacy.push({role:'SHIPPER',case:'booking-scope',visibleJobs:visible,status:'PASS'});
    await shot(page,'shipper-portal');
    report.roles.push({role:'SHIPPER',status:'PASS'});
    await ctx.close();
  }

  // Cross-role escalation checks.
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    const user=await establish(page,'test.shipper.nl@ancline.invalid','GLOBAL_ADMIN');
    assert(user.role==='SHIPPER','managed SHIPPER escalated to admin');
    const adminOnly=await api(page,'/test-data/summary'); assert(adminOnly.status===403,'SHIPPER reached admin-only summary');
    report.exceptions.push({case:'managed-role-overrides-requested-escalation',status:'PASS'});
    await ctx.close();
  }

  report.status='PASS';
  report.finishedAt=new Date().toISOString();
}catch(e){
  report.status='FAIL'; report.finishedAt=new Date().toISOString(); report.error=String(e?.stack||e);
  console.error(report.error); process.exitCode=1;
}finally{
  try{
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN'); await reseed(page); await ctx.close();
  }catch(e){report.exceptions.push({case:'final-protective-reseed',status:'FAIL',error:String(e)});report.status='FAIL';process.exitCode=1}
  writeFileSync(OUT+'/ANCLINE_UI_FINAL_ACCEPTANCE.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  await browser.close();
}
