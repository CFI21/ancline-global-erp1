import { chromium } from 'playwright';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const jobs=['50001','50002','50003','50004','50005'];
const roles=[
  {role:'GLOBAL_ADMIN',email:'test.admin@ancline.invalid',redirect:'/',min:5,must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'CONTROL_TOWER',email:'test.control@ancline.invalid',redirect:'/',min:5,must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'BRANCH_OPS',email:'test.ops@ancline.invalid',redirect:'/nvocc-portal',min:5,must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'FINANCE',email:'test.finance@ancline.invalid',redirect:'/',min:5,must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'AGENT',email:'test.agent.sg@ancline.invalid',redirect:'/agent-portal',min:1,must:['50005'],internal:false,agent:true},
  {role:'CUSTOMER',email:'test.customer.nl@ancline.invalid',redirect:'/customer-portal',min:2,must:['50001','50002'],internal:false},
  {role:'SHIPPER',email:'test.shipper.nl@ancline.invalid',redirect:'/customer-portal',min:2,must:['50001','50002'],internal:false},
  {role:'CONSIGNEE',email:'test.consignee.ae@ancline.invalid',redirect:'/customer-portal',min:1,must:['50004'],internal:false}
];

function assert(cond,msg){if(!cond)throw new Error(msg);}
async function api(page,path,init={}){
  return page.evaluate(async ({path,init})=>{
    const token=localStorage.getItem('ancline_token');
    const headers={...(init.headers||{}),Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    const r=await fetch('/api-proxy'+path,{...init,headers});
    let body=null; try{body=await r.json();}catch{body=await r.text();}
    return {status:r.status,body};
  },{path,init});
}
async function login(page,{email,role}){
  await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async ({email,role})=>{
    const r=await fetch('/api-proxy/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,role})
    });
    let body; try{body=await r.json();}catch{body=await r.text();}
    if(!r.ok||!body?.accessToken)return {status:r.status,body};
    localStorage.setItem('ancline_token',body.accessToken);
    localStorage.setItem('ancline_user',JSON.stringify(body.user));
    return {status:r.status,user:body.user};
  },{email,role});
  assert(result.status>=200&&result.status<300&&result.user,`${email}: live auth failed HTTP ${result.status} ${JSON.stringify(result.body||{})}`);
  const user=result.user;
  const target=['CUSTOMER','SHIPPER','CONSIGNEE'].includes(user.role)?'/customer-portal':user.role==='AGENT'?'/agent-portal':user.role==='BRANCH_OPS'?'/nvocc-portal':'/';
  await page.goto(WEB_URL+target,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('input[aria-label="Search ANCLINE menu"]',{timeout:30000});
  return user;
}
const browser=await chromium.launch({headless:true});
const report={startedAt:new Date().toISOString(),webUrl:WEB_URL,roles:[],jobs:[],exceptions:[]};
try{
  for(const spec of roles){
    const context=await browser.newContext();
    const page=await context.newPage();
    const user=await login(page,spec);
    assert(user.role===spec.role,`${spec.email}: managed role mismatch ${user.role}`);
    assert(new URL(page.url()).pathname===spec.redirect,`${spec.role}: unexpected redirect ${page.url()}`);

    const bookingsResp=await api(page,'/bookings');
    assert(bookingsResp.status===200,`${spec.role}: /bookings HTTP ${bookingsResp.status}`);
    const rows=Array.isArray(bookingsResp.body)?bookingsResp.body:(bookingsResp.body?.items||bookingsResp.body?.data||[]);
    const visible=rows.map(x=>String(x.bookingNo||'')).filter(x=>jobs.includes(x)).sort();
    assert(visible.length>=spec.min,`${spec.role}: expected >=${spec.min} seeded jobs, saw ${visible.join(',')}`);
    for(const j of spec.must)assert(visible.includes(j),`${spec.role}: missing required job ${j}`);

    if(spec.internal){
      await page.waitForFunction(()=>document.querySelectorAll('.menu-section').length>0,{timeout:15000});
      const internalLinks=await page.locator('.menu-section').count();
      assert(internalLinks>0,`${spec.role}: internal workflow menu missing`);
    }else{
      await page.waitForTimeout(700);
      const internalLinks=await page.locator('.menu-section').count();
      assert(internalLinks===0,`${spec.role}: external role exposed internal workflow groups`);
    }
    if(spec.agent){
      const body=await page.locator('body').innerText();
      assert(body.includes('NVOCC')||body.includes('Agent'), 'AGENT portal content missing');
      const forwardingLink=page.locator('a[href="/customer-portal"]');
      assert(await forwardingLink.count()>=1,'AGENT authorized Forwarding portal link missing');
    }

    const adminOnly=await api(page,'/test-data/summary');
    if(spec.role==='GLOBAL_ADMIN')assert(adminOnly.status===200,'GLOBAL_ADMIN cannot read test-data summary');
    else assert(adminOnly.status===403,`${spec.role}: admin-only test-data summary was not forbidden (${adminOnly.status})`);

    report.roles.push({role:spec.role,email:spec.email,redirect:spec.redirect,visibleJobs:visible,status:'PASS'});
    await context.close();
  }

  // Managed account must override a deliberately conflicting role selected in the UI.
  {
    const context=await browser.newContext(); const page=await context.newPage();
    const user=await login(page,{email:'test.shipper.nl@ancline.invalid',role:'GLOBAL_ADMIN'});
    assert(user.role==='SHIPPER','Managed SHIPPER account accepted conflicting GLOBAL_ADMIN role');
    assert(new URL(page.url()).pathname==='/customer-portal','Managed SHIPPER conflicting-role login escaped portal');
    report.exceptions.push({case:'managed-role-overrides-conflicting-ui-role',status:'PASS'});
    await context.close();
  }

  // Unmanaged scoped role without its mandatory scope must fail closed.
  {
    const context=await browser.newContext(); const page=await context.newPage();
    await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async ()=>{
      const r=await fetch('/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'unmanaged.shipper@invalid.example',role:'SHIPPER'})});
      let body; try{body=await r.json();}catch{body=await r.text();}
      return {status:r.status,body};
    });
    assert(result.status>=400,'Unmanaged SHIPPER without scope did not fail closed');
    report.exceptions.push({case:'unmanaged-scoped-role-fails-closed',httpStatus:result.status,status:'PASS'});
    await context.close();
  }

  // Admin-level full synthetic chain validation for jobs 50001-50005.
  {
    const context=await browser.newContext(); const page=await context.newPage();
    await login(page,{email:'test.admin@ancline.invalid',role:'GLOBAL_ADMIN'});
    const summaryResp=await api(page,'/test-data/summary');
    assert(summaryResp.status===200,'Unable to load live synthetic summary');
    const summary=summaryResp.body;
    assert(summary.summary?.bookings===5,`Expected 5 seeded jobs, got ${summary.summary?.bookings}`);
    const byNo=new Map((summary.bookings||[]).map(x=>[String(x.bookingNo),x]));
    const expectedSpecial={'50002':'DG','50003':'REEFER','50004':'OOG'};
    for(const jobNo of jobs){
      const b=byNo.get(jobNo); assert(b,`Missing live seeded job ${jobNo}`);
      assert((b.routingLegs||0)>0,`${jobNo}: routing legs missing`);
      assert((b.milestones||0)>0,`${jobNo}: milestones missing`);
      assert((b.documents||0)>0,`${jobNo}: documents missing`);
      assert((b.financeLines||0)>0,`${jobNo}: finance lines missing`);
      assert((b.tasks||0)>0,`${jobNo}: tasks missing`);
      assert((b.approvals||0)>0,`${jobNo}: approvals missing`);
      assert((b.closeoutItems||0)>0,`${jobNo}: closeout checklist missing`);
      if(jobNo==='50005')assert(b.businessModel==='NVOCC','50005 must be NVOCC');
      if(expectedSpecial[jobNo])assert(b.specialCargo===expectedSpecial[jobNo],`${jobNo}: expected ${expectedSpecial[jobNo]} special cargo, got ${b.specialCargo}`);
      await page.goto(WEB_URL+'/bookings/'+encodeURIComponent(b.id),{waitUntil:'domcontentloaded'});
      assert(await page.locator('body').innerText().then(t=>t.includes(jobNo)),`${jobNo}: booking detail UI did not render job reference`);
      report.jobs.push({bookingNo:jobNo,id:b.id,businessModel:b.businessModel,specialCargo:b.specialCargo||null,status:'PASS'});
    }
    await context.close();
  }

  report.finishedAt=new Date().toISOString();
  report.status='PASS';
  console.log(JSON.stringify(report,null,2));
}catch(err){
  report.finishedAt=new Date().toISOString();
  report.status='FAIL';
  report.error=String(err?.stack||err);
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
}finally{
  await browser.close();
}
