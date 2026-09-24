import {chromium} from 'playwright';

const WEB=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const JOBS=['50001','50002','50003','50004','50005'];
const assert=(v,m)=>{if(!v)throw new Error(m);};

async function loginApi(email,role){
  const r=await fetch(WEB+'/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role})});
  const b=await r.json();assert(r.ok&&b.accessToken, email+' login failed');
  return b;
}
async function api(path,token,opt={}){
  const r=await fetch(WEB+'/api-proxy'+path,{method:opt.method||'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token,...(opt.body?{'Content-Type':'application/json'}:{})},body:opt.body?JSON.stringify(opt.body):undefined});
  const raw=await r.text();let b;try{b=raw?JSON.parse(raw):null}catch{b=raw}
  assert(r.ok,path+' failed HTTP '+r.status+' '+raw);return b;
}
async function establish(page,email,role){
  const auth=await loginApi(email,role);
  await page.goto(WEB+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(({token,user})=>{localStorage.setItem('ancline_token',token);localStorage.setItem('ancline_user',JSON.stringify(user));},{token:auth.accessToken,user:auth.user});
  return auth;
}

const admin=await loginApi('test.admin@ancline.invalid','GLOBAL_ADMIN');
const seed=await api('/test-data/seed',admin.accessToken,{method:'POST',body:{}});
assert(Number(seed?.summary?.bookings)===5,'expected five synthetic jobs');
const bookings=await api('/bookings',admin.accessToken);
const byNo=new Map(bookings.map(b=>[String(b.bookingNo),b]));
for(const n of JOBS)assert(byNo.has(n),'job '+n+' missing from canonical /bookings data');

const browser=await chromium.launch({headless:true});
try{
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN');

  await page.goto(WEB+'/jobs',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(900);
  let text=await page.locator('body').innerText();
  assert(text.includes('Jobs Register'),'Jobs Register heading missing');
  assert(text.includes('Single operational register across NVOCC + Global Forwarding'),'single-model statement missing');
  for(const n of JOBS)assert(text.includes(n),'/jobs missing '+n);
  assert(await page.locator('a[href="/jobs"]').count()>0,'Jobs sidebar navigation missing');
  assert(await page.getByRole('button',{name:'Quick View'}).count()>=5,'Jobs Quick View actions missing');
  assert(await page.getByRole('link',{name:'Open Job'}).count()>=5,'Jobs Open Job actions missing');

  const fwd=byNo.get('50001');
  await page.goto(WEB+'/bookings/'+encodeURIComponent(fwd.id),{waitUntil:'domcontentloaded',timeout:60000});
  const qv=page.locator('button[title="Quick View Carrier Payment / Payer"]');
  await qv.waitFor({state:'visible',timeout:15000});
  text=await page.locator('body').innerText();
  assert(text.includes('Carrier Payment / Payer'),'JobContextRail Carrier Payment / Payer missing after workspace load');
  assert(await qv.count()===1,'Carrier Payment quick-view button missing');
  await qv.click();
  const paymentFrame=page.locator('iframe.job-quick-frame');
  assert(await paymentFrame.count()===1,'Carrier Payment quick-view frame missing');
  const src=await paymentFrame.getAttribute('src');
  assert(String(src).includes('/carrier-payment?bookingId='+encodeURIComponent(fwd.id)),'Carrier Payment quick-view route mismatch: '+src);
  await page.getByRole('button',{name:'Close quick view'}).click();

  await page.goto(WEB+'/nvocc-portal',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(900);
  text=await page.locator('body').innerText();
  assert(text.includes('50005'),'NVOCC register missing job 50005');
  assert(await page.getByRole('link',{name:'Open Job'}).count()>0,'NVOCC Open Job action missing');
  assert(await page.getByRole('button',{name:'Quick View'}).count()>0,'NVOCC Quick View action missing');
  await page.getByRole('button',{name:'Quick View'}).last().click();
  const nvFrame=page.locator('iframe.job-quick-frame');
  assert(await nvFrame.count()===1,'NVOCC quick-view frame missing');
  const nvSrc=await nvFrame.getAttribute('src');
  assert(String(nvSrc).includes('/bookings/')&&String(nvSrc).includes('embed=1'),'NVOCC Quick View does not reuse job workspace: '+nvSrc);
  await ctx.close();

  const actx=await browser.newContext({viewport:{width:1280,height:900}});
  const ap=await actx.newPage();
  await establish(ap,'test.agent.sg@ancline.invalid','AGENT');
  await ap.goto(WEB+'/nvocc-portal',{waitUntil:'domcontentloaded',timeout:60000});
  const agentRow=ap.locator('table.table tbody tr').filter({hasText:'50005'}).first();
  await agentRow.waitFor({state:'visible',timeout:15000});
  const agentText=await ap.locator('body').innerText();
  assert(agentText.includes('NVOCC Booking Register'),'Agent NVOCC register missing');
  assert(await agentRow.getByRole('link',{name:'Open Job'}).count()===1,'Agent scoped 50005 Open Job missing');
  assert(await agentRow.getByRole('button',{name:'Quick View'}).count()===1,'Agent scoped 50005 Quick View missing');
  await ap.goto(WEB+'/jobs',{waitUntil:'domcontentloaded',timeout:60000});
  await ap.waitForTimeout(900);
  assert(new URL(ap.url()).pathname!='/jobs','Agent gained internal Jobs Register');
  await actx.close();

  console.log(JSON.stringify({
    schema:'ANCLINE_CR009_JOB_NAVIGATION_ACCEPTANCE_V1',
    status:'PASS',
    jobs:JOBS,
    canonicalSource:'/bookings',
    jobsRegister:'/jobs',
    jobDetail:'/bookings/{id}',
    carrierPaymentQuickView:'PASS',
    nvoccOpenAndQuickView:'PASS',
    agentScope:'PASS'
  },null,2));
}finally{
  await browser.close();
}
