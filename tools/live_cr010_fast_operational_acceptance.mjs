import {chromium} from 'playwright';

const WEB=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const JOBS=['50001','50002','50003','50004','50005'];
const assert=(v,m)=>{if(!v)throw new Error(m);};

async function login(email,role){
  const r=await fetch(WEB+'/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role})});
  const b=await r.json();assert(r.ok&&b.accessToken,email+' login failed');return b;
}
async function api(path,token,opt={}){
  const r=await fetch(WEB+'/api-proxy'+path,{method:opt.method||'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token,...(opt.body?{'Content-Type':'application/json'}:{})},body:opt.body?JSON.stringify(opt.body):undefined});
  const raw=await r.text();let b;try{b=raw?JSON.parse(raw):null}catch{b=raw}
  assert(r.ok,path+' HTTP '+r.status+' '+raw);return b;
}
async function session(page,email,role){
  const a=await login(email,role);
  await page.goto(WEB+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(({token,user})=>{localStorage.setItem('ancline_token',token);localStorage.setItem('ancline_user',JSON.stringify(user));},{token:a.accessToken,user:a.user});
  return a;
}

const admin=await login('test.admin@ancline.invalid','GLOBAL_ADMIN');
await api('/test-data/seed',admin.accessToken,{method:'POST',body:{}});
const bookings=await api('/bookings',admin.accessToken);
const byNo=new Map(bookings.map(b=>[String(b.bookingNo),b]));
for(const n of JOBS)assert(byNo.has(n),'missing test job '+n);
const forwarding=byNo.get('50001');
const nvocc=byNo.get('50005');
assert(String(forwarding.businessModel).toUpperCase()==='FORWARDING','50001 must be Forwarding');
assert(String(nvocc.businessModel).toUpperCase()==='NVOCC','50005 must be NVOCC');

const browser=await chromium.launch({headless:true});
try{
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  await session(page,'test.admin@ancline.invalid','GLOBAL_ADMIN');

  // Dedicated Jobs filters + canonical records.
  await page.goto(WEB+'/jobs',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('text=Jobs Register',{timeout:15000});
  await page.getByText('50001',{exact:true}).first().waitFor({state:'visible',timeout:15000});
  for(const label of ['Business Model','Status','Customer / Party','Origin','Destination','Carrier','Attention']){
    assert(await page.getByLabel(label).count()===1,'missing dedicated filter '+label);
  }
  let body=await page.locator('body').innerText();
  for(const n of JOBS)assert(body.includes(n),'/jobs missing '+n);

  // Forwarding job: payment visible and Quick View works.
  await page.goto(WEB+'/bookings/'+forwarding.id,{waitUntil:'domcontentloaded',timeout:60000});
  const payQuick=page.locator('button[title="Quick View Carrier Payment / Payer"]');
  await payQuick.waitFor({state:'visible',timeout:15000});
  assert(await payQuick.count()===1,'Forwarding Carrier Payment rail action missing');
  await payQuick.click();
  const frame=page.locator('iframe.job-quick-frame');
  await frame.waitFor({state:'visible',timeout:10000});
  assert(String(await frame.getAttribute('src')).includes('/carrier-payment?bookingId='+forwarding.id),'Carrier Payment Quick View route mismatch');
  await page.getByRole('button',{name:'Close quick view'}).click();

  // NVOCC job: payment must not be exposed.
  await page.goto(WEB+'/bookings/'+nvocc.id,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1200);
  assert(await page.locator('button[title="Quick View Carrier Payment / Payer"]').count()===0,'NVOCC incorrectly exposes Carrier Payment rail action');

  // Full Carrier Payment page has rail; embed mode remains non-recursive.
  await page.goto(WEB+'/carrier-payment?bookingId='+forwarding.id,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.job-context-rail',{timeout:15000});
  body=await page.locator('body').innerText();
  assert(body.includes('JOB SUMMARY'),'Carrier Payment full page missing JobContextRail');
  await page.goto(WEB+'/carrier-payment?bookingId='+forwarding.id+'&embed=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(900);
  assert(await page.locator('.job-context-rail').count()===0,'Carrier Payment embed recursively renders JobContextRail');

  // Global Admin forwarding portal gets internal job actions.
  await page.goto(WEB+'/customer-portal',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('text=TOTAL SHIPMENTS',{timeout:15000});
  await page.getByRole('link',{name:'Open Job'}).first().waitFor({state:'visible',timeout:15000});
  assert(await page.getByRole('link',{name:'Open Job'}).count()>0,'Global Admin Forwarding Open Job missing');
  assert(await page.getByRole('button',{name:'Quick View'}).count()>0,'Global Admin Forwarding Quick View missing');
  await page.getByRole('button',{name:'Quick View'}).first().click();
  const fwdFrame=page.locator('iframe.job-quick-frame');
  await fwdFrame.waitFor({state:'visible',timeout:10000});
  assert(String(await fwdFrame.getAttribute('src')).includes('/bookings/'),'Forwarding Quick View not using existing Job Workspace');
  await ctx.close();

  // External customer must not get internal job actions.
  const cctx=await browser.newContext({viewport:{width:1280,height:900}});
  const cp=await cctx.newPage();
  await session(cp,'test.customer@ancline.invalid','CUSTOMER');
  await cp.goto(WEB+'/customer-portal',{waitUntil:'domcontentloaded',timeout:60000});
  await cp.waitForSelector('text=TOTAL SHIPMENTS',{timeout:15000});
  assert(await cp.getByRole('link',{name:'Open Job'}).count()===0,'Customer exposed internal Open Job');
  assert(await cp.getByRole('button',{name:'Quick View'}).count()===0,'Customer exposed internal Job Quick View');
  await cctx.close();

  console.log(JSON.stringify({
    schema:'ANCLINE_CR010_FAST_OPERATIONAL_ACCEPTANCE_V1',
    status:'PASS',
    jobs:JOBS,
    jobsDedicatedFilters:'PASS',
    forwardingPaymentRail:'PASS',
    nvoccPaymentHidden:'PASS',
    carrierPaymentFullRail:'PASS',
    carrierPaymentEmbedNonRecursive:'PASS',
    forwardingAdminInternalActions:'PASS',
    externalRoleIsolation:'PASS'
  },null,2));
}finally{await browser.close();}
