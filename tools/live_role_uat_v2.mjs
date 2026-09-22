import { chromium } from 'playwright';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const jobs=['50001','50002','50003','50004','50005'];
const specs=[
  {role:'GLOBAL_ADMIN',email:'test.admin@ancline.invalid',path:'/',must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'CONTROL_TOWER',email:'test.control@ancline.invalid',path:'/',must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'BRANCH_OPS',email:'test.ops@ancline.invalid',path:'/nvocc-portal',must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'FINANCE',email:'test.finance@ancline.invalid',path:'/',must:['50001','50002','50003','50004','50005'],internal:true},
  {role:'AGENT',email:'test.agent.sg@ancline.invalid',path:'/agent-portal',must:['50005'],internal:false,agent:true},
  {role:'CUSTOMER',email:'test.customer.nl@ancline.invalid',path:'/customer-portal',must:['50001','50002'],internal:false},
  {role:'SHIPPER',email:'test.shipper.nl@ancline.invalid',path:'/customer-portal',must:['50001','50002'],internal:false},
  {role:'CONSIGNEE',email:'test.consignee.ae@ancline.invalid',path:'/customer-portal',must:['50004'],internal:false}
];
const assert=(x,m)=>{if(!x)throw new Error(m)};

async function establish(page,email,requestedRole){
  await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  const auth=await page.evaluate(async ({email,requestedRole})=>{
    const r=await fetch('/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role:requestedRole})});
    let body; try{body=await r.json()}catch{body=await r.text()}
    if(r.ok&&body?.accessToken){
      localStorage.setItem('ancline_token',body.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(body.user));
    }
    return {status:r.status,ok:r.ok,user:body?.user||null,hasToken:!!body?.accessToken,body:body?.accessToken?{...body,accessToken:'[redacted]'}:body};
  },{email,requestedRole});
  assert(auth.ok&&auth.hasToken&&auth.user,`${email}: auth failed ${auth.status} ${JSON.stringify(auth.body)}`);
  return auth.user;
}
async function goRolePage(page,user){
  const target=['CUSTOMER','SHIPPER','CONSIGNEE'].includes(user.role)?'/customer-portal':user.role==='AGENT'?'/agent-portal':user.role==='BRANCH_OPS'?'/nvocc-portal':'/';
  const runtimeErrors=[];
  page.on('pageerror',e=>runtimeErrors.push('pageerror:'+String(e?.stack||e)));
  page.on('console',m=>{ if(['error','warning'].includes(m.type())) runtimeErrors.push('console:'+m.type()+':'+m.text()); });
  const response=await page.goto(WEB_URL+target,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1200);
  page.__anclineDiag={target,httpStatus:response?.status?.()??null,runtimeErrors};
  return target;
}
async function api(page,path){
  return page.evaluate(async path=>{
    const token=localStorage.getItem('ancline_token');
    const r=await fetch('/api-proxy'+path,{headers:{Authorization:`Bearer ${token}`}});
    let body; try{body=await r.json()}catch{body=await r.text()}
    return {status:r.status,body};
  },path);
}
async function diagnose(page){
  const text=await page.locator('body').innerText().catch(()=>'');
  const html=await page.locator('body').innerHTML().catch(()=>'');
  return {
    url:page.url(),
    title:await page.title().catch(()=>null),
    text:text.slice(0,1200),
    htmlLength:html.length,
    html:html.slice(0,1600),
    token:await page.evaluate(()=>!!localStorage.getItem('ancline_token')).catch(()=>false),
    user:await page.evaluate(()=>JSON.parse(localStorage.getItem('ancline_user')||'null')).catch(()=>null),
    navigation:page.__anclineDiag||null
  };
}

const browser=await chromium.launch({headless:true});
const report={schema:'ANCLINE_LIVE_ROLE_UAT_V2',startedAt:new Date().toISOString(),webUrl:WEB_URL,roles:[],jobs:[],exceptions:[],status:'RUNNING'};
try{
  for(const spec of specs){
    const context=await browser.newContext();
    const page=await context.newPage();
    const user=await establish(page,spec.email,spec.role);
    assert(user.role===spec.role,`${spec.email}: stored role ${user.role} != ${spec.role}`);
    const target=await goRolePage(page,user);
    assert(new URL(page.url()).pathname===target,`${spec.role}: unexpected route ${page.url()} diag=${JSON.stringify(await diagnose(page))}`);

    const bookings=await api(page,'/bookings');
    assert(bookings.status===200,`${spec.role}: bookings HTTP ${bookings.status}`);
    const rows=Array.isArray(bookings.body)?bookings.body:(bookings.body?.items||bookings.body?.data||[]);
    const visible=rows.map(x=>String(x.bookingNo||'')).filter(x=>jobs.includes(x)).sort();
    for(const n of spec.must) assert(visible.includes(n),`${spec.role}: missing ${n}; visible=${visible.join(',')}`);

    if(spec.internal){
      const ok=await page.waitForFunction(()=>document.querySelectorAll('.menu-section').length>0,{timeout:15000}).then(()=>true).catch(()=>false);
      assert(ok,`${spec.role}: internal menu missing diag=${JSON.stringify(await diagnose(page))}`);
    }else{
      await page.waitForTimeout(500);
      assert(await page.locator('.menu-section').count()===0,`${spec.role}: external role exposed internal menu`);
    }
    if(spec.agent){
      assert(await page.locator('a[href="/customer-portal"]').count()>0,'AGENT: authorized Forwarding portal link missing');
    }
    const adminOnly=await api(page,'/test-data/summary');
    if(spec.role==='GLOBAL_ADMIN') assert(adminOnly.status===200,'GLOBAL_ADMIN: test-data summary unavailable');
    else assert(adminOnly.status===403,`${spec.role}: admin-only summary status ${adminOnly.status}, expected 403`);

    report.roles.push({role:spec.role,email:spec.email,target,visibleJobs:visible,status:'PASS'});
    await context.close();
  }

  // Managed identity must override a deliberately escalated requested role.
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    const user=await establish(page,'test.shipper.nl@ancline.invalid','GLOBAL_ADMIN');
    assert(user.role==='SHIPPER','Managed SHIPPER accepted requested GLOBAL_ADMIN escalation');
    const target=await goRolePage(page,user);
    assert(target==='/customer-portal','Managed SHIPPER escalation escaped customer portal');
    report.exceptions.push({case:'managed-role-overrides-requested-role',status:'PASS'});
    await ctx.close();
  }

  // Unmanaged external role without mandatory party scope must fail closed.
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded'});
    const r=await page.evaluate(async ()=>{
      const x=await fetch('/api-proxy/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'unmanaged.shipper@invalid.example',role:'SHIPPER'})});
      return {status:x.status};
    });
    assert(r.status>=400,'Unmanaged SHIPPER without party scope did not fail closed');
    report.exceptions.push({case:'unmanaged-scoped-role-fails-closed',httpStatus:r.status,status:'PASS'});
    await ctx.close();
  }

  // Persistent seeded job chain: all linked business artifacts must exist.
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    const user=await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN'); await goRolePage(page,user);
    const s=await api(page,'/test-data/summary');
    assert(s.status===200,'Synthetic summary HTTP '+s.status);
    assert(s.body?.summary?.bookings===5,`Expected exactly 5 seeded jobs, got ${s.body?.summary?.bookings}`);
    const map=new Map((s.body.bookings||[]).map(b=>[String(b.bookingNo),b]));
    const special={50002:'DG',50003:'REEFER',50004:'OOG'};
    for(const n of jobs){
      const b=map.get(n); assert(b,`Missing job ${n}`);
      for(const k of ['routingLegs','milestones','documents','financeLines','tasks','approvals','closeoutItems']) assert(Number(b[k])>0,`${n}: ${k} missing`);
      if(n==='50005') assert(b.businessModel==='NVOCC','50005 not NVOCC');
      if(special[n]) assert(b.specialCargo===special[n],`${n}: expected ${special[n]}, got ${b.specialCargo}`);
      await page.goto(WEB_URL+'/bookings/'+encodeURIComponent(b.id),{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(500);
      const body=await page.locator('body').innerText();
      assert(body.includes(n),`${n}: booking detail did not render reference; url=${page.url()}`);
      report.jobs.push({bookingNo:n,businessModel:b.businessModel,specialCargo:b.specialCargo||null,artifacts:{routingLegs:b.routingLegs,milestones:b.milestones,documents:b.documents,financeLines:b.financeLines,tasks:b.tasks,approvals:b.approvals,closeoutItems:b.closeoutItems},status:'PASS'});
    }
    await ctx.close();
  }

  report.status='PASS'; report.finishedAt=new Date().toISOString();
  console.log(JSON.stringify(report,null,2));
}catch(e){
  report.status='FAIL'; report.finishedAt=new Date().toISOString(); report.error=String(e?.stack||e);
  console.error(JSON.stringify(report,null,2)); process.exitCode=1;
}finally{await browser.close()}
