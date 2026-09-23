import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const EXPECTED_API_COMMIT=(process.env.EXPECTED_API_COMMIT||'').trim();
const OUT='cr005-notification-acceptance-artifacts';
mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(x,m)=>{if(!x)throw new Error(m)};
const stamp=()=>Date.now().toString(36).toUpperCase();

async function call(path,opt={}){
  const headers={Accept:'application/json',...(opt.headers||{})};
  if(opt.token)headers.Authorization='Bearer '+opt.token;
  if(opt.body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(WEB_URL+'/api-proxy'+path,{method:opt.method||'GET',headers,body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
  const raw=await r.text();let body;try{body=raw?JSON.parse(raw):null}catch{body=raw}
  return {status:r.status,ok:r.ok,body,raw};
}
function ok(r,label){assert(r.ok,label+': HTTP '+r.status+' '+(typeof r.body==='string'?r.body:JSON.stringify(r.body)));return r.body}
async function login(email,role){const b=ok(await call('/auth/login',{method:'POST',body:{email,role}}),'login '+email);return {token:b.accessToken,user:b.user};}
async function waitForApi(){
  if(!EXPECTED_API_COMMIT)return;
  for(let i=0;i<80;i++){
    const r=await call('/health');
    if(r.ok&&String(r.body?.buildCommit||'')===EXPECTED_API_COMMIT)return;
    await sleep(5000);
  }
  throw new Error('API did not converge to '+EXPECTED_API_COMMIT);
}

const report={schema:'ANCLINE_CR005_NOTIFICATION_CENTER_ACCEPTANCE_V1',startedAt:new Date().toISOString(),expectedApiCommit:EXPECTED_API_COMMIT,cases:[],roles:[],status:'RUNNING'};
const pass=(name,detail={})=>report.cases.push({name,status:'PASS',...detail});
let admin;
try{
  await waitForApi();
  admin=await login('test.admin@ancline.invalid','GLOBAL_ADMIN');
  ok(await call('/test-data/seed',{token:admin.token,method:'POST',body:{}}),'reseed');

  const summary=ok(await call('/test-data/summary',{token:admin.token}),'summary');
  const booking=(summary.bookings||[]).find(x=>String(x.bookingNo)==='50001');
  assert(booking?.id,'booking 50001 missing');
  const bookingId=String(booking.id);

  // Create deterministic SLA sources for LEVEL 1/2/3.
  const makeTask=async(title,dueAt)=>ok(await call('/tasks',{token:admin.token,method:'POST',body:{bookingId,title,ownerId:'test.ops@ancline.invalid',dueAt,status:'In Progress'}}),'create '+title);
  const l1=await makeTask('CR005 UAT L1 '+stamp(),new Date(Date.now()+10*60000).toISOString());
  const l2=await makeTask('CR005 UAT L2 '+stamp(),new Date(Date.now()-2*3600000).toISOString());
  const l3=await makeTask('[OC:cr005-'+stamp()+'] CR005 UAT L3',new Date(Date.now()-26*3600000).toISOString());
  pass('sla-source-creation',{taskIds:[l1.id,l2.id,l3.id]});

  // Create action-queue claim/reassignment evidence.
  const dash=ok(await call('/operations/control-dashboard',{token:admin.token}),'operations dashboard');
  const candidate=(dash.rows||[]).find(x=>x.bookingId&&x.queueMutable);
  assert(candidate,'no claimable operations-control row');
  const claimed=ok(await call('/operations/control-dashboard/'+encodeURIComponent(candidate.id)+'/claim',{token:admin.token,method:'POST',body:{}}),'claim');
  const reassigned=ok(await call('/tasks/'+encodeURIComponent(claimed.id),{token:admin.token,method:'PATCH',body:{ownerId:'test.reassigned@ancline.invalid',status:'Acknowledged'}}),'reassign');
  assert(reassigned.ownerId==='test.reassigned@ancline.invalid','reassignment did not persist');
  pass('action-queue-claim-reassign',{taskId:claimed.id});

  // Create a synthetic failed provider event for live aggregation.
  const failureId='CR005-FAIL-'+stamp();
  await call('/integrations/ingest',{token:admin.token,method:'POST',body:{sourceSystem:'CR005_UAT_PROVIDER',eventType:'UNSUPPORTED_CR005_UAT',externalId:failureId,payload:{bookingId,bookingNo:'50001',synthetic:true}}});
  const integrations=ok(await call('/integrations',{token:admin.token}),'integrations');
  const failed=(integrations||[]).find(x=>x.sourceSystem==='CR005_UAT_PROVIDER'&&x.externalId===failureId);
  assert(failed&&['FAILED','RETRY_PENDING','DEAD_LETTER'].includes(String(failed.status)),'synthetic failed integration missing');
  pass('failed-integration-source',{eventId:failed.id,status:failed.status});

  ok(await call('/operations/notifications/scan',{token:admin.token,method:'POST',body:{}}),'risk scan');
  let center=ok(await call('/operations/communication-center',{token:admin.token}),'communication center');
  const items=()=>center.items||[];
  assert(Array.isArray(items())&&items().length>0,'unified center empty');
  assert(items().some(x=>x.source==='OPERATIONAL_RISK'),'operational risk source missing');
  assert(items().some(x=>x.kind==='ACTION_QUEUE'),'action queue source missing');
  for(const level of ['LEVEL_1','LEVEL_2','LEVEL_3'])assert(items().some(x=>x.escalationLevel===level),'SLA '+level+' missing from unified center');
  assert(items().some(x=>x.kind==='FAILED_INTEGRATION'),'failed integration source missing');
  assert(items().some(x=>x.kind==='DOCUMENT_BLOCK'),'document/release block source missing');
  assert(items().some(x=>x.kind==='FINANCE'||x.kind==='PAYMENT_RELEASE_BLOCK'),'payment/finance block source missing');
  assert(items().every(x=>typeof x.actionHref==='string'&&x.actionHref.startsWith('/')),'direct action link missing');
  assert(new Set(items().map(x=>x.id)).size===items().length,'duplicate item ids present');
  pass('source-consolidation',{total:items().length,sources:[...new Set(items().map(x=>x.source))]});

  // Read state.
  const unread=items().find(x=>String(x.id).startsWith('note:')&&x.status==='UNREAD');
  assert(unread,'no unread risk notification available');
  ok(await call('/operations/notifications/'+encodeURIComponent(String(unread.id).slice(5))+'/read',{token:admin.token,method:'POST',body:{}}),'mark read');
  center=ok(await call('/operations/communication-center',{token:admin.token}),'center after read');
  assert((center.items||[]).find(x=>x.id===unread.id)?.status==='READ','read state did not persist');
  pass('read-persistence',{itemId:unread.id});

  // Acknowledge state + audit-backed persistence.
  const ackTarget=(center.items||[]).find(x=>x.status!=='RESOLVED'&&!x.acknowledged);
  assert(ackTarget,'no acknowledgement target');
  ok(await call('/operations/communication-center/'+encodeURIComponent(ackTarget.id)+'/acknowledge',{token:admin.token,method:'POST',body:{}}),'acknowledge');
  center=ok(await call('/operations/communication-center',{token:admin.token}),'center after ack');
  assert((center.items||[]).find(x=>x.id===ackTarget.id)?.acknowledged===true,'acknowledgement did not persist');
  pass('acknowledge-persistence',{itemId:ackTarget.id});

  // Preferences: optional alerts can be muted but CRITICAL / LEVEL_3 must remain.
  const originalPrefs=ok(await call('/operations/communication-center/preferences',{token:admin.token}),'get preferences');
  const muted=ok(await call('/operations/communication-center/preferences',{token:admin.token,method:'PATCH',body:{...originalPrefs,muteOptional:true,severities:[]}}),'mute optional');
  assert(muted.mandatoryCritical===true,'mandatoryCritical preference not enforced');
  center=ok(await call('/operations/communication-center',{token:admin.token}),'center muted');
  assert((center.items||[]).some(x=>x.severity==='CRITICAL'||x.escalationLevel==='LEVEL_3'),'mandatory CRITICAL/LEVEL_3 was suppressed');
  assert(!(center.items||[]).some(x=>x.severity==='INFO'&&!x.mandatory),'optional INFO remained while muted');
  pass('preference-critical-override',{criticalVisible:(center.items||[]).filter(x=>x.severity==='CRITICAL'||x.escalationLevel==='LEVEL_3').length});
  ok(await call('/operations/communication-center/preferences',{token:admin.token,method:'PATCH',body:{...originalPrefs,muteOptional:false}}),'restore preferences');

  // Role/privacy boundaries.
  for(const p of [
    ['test.admin@ancline.invalid','GLOBAL_ADMIN',200],
    ['test.control@ancline.invalid','CONTROL_TOWER',200],
    ['test.ops@ancline.invalid','BRANCH_OPS',200],
    ['test.finance@ancline.invalid','FINANCE',200],
    ['test.customer.nl@ancline.invalid','CUSTOMER',403],
    ['test.agent.sg@ancline.invalid','AGENT',403],
    ['test.shipper.nl@ancline.invalid','SHIPPER',403]
  ]){
    const u=await login(p[0],p[1]);
    const r=await call('/operations/communication-center',{token:u.token});
    assert(r.status===p[2],p[1]+' expected '+p[2]+' got '+r.status);
    report.roles.push({role:p[1],expected:p[2],actual:r.status,status:'PASS'});
  }
  pass('role-privacy-boundaries',{roles:report.roles.length});

  // Rendered UI proof.
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  await page.goto(WEB_URL+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(({token,user})=>{localStorage.setItem('ancline_token',token);localStorage.setItem('ancline_user',JSON.stringify(user));},{token:admin.token,user:admin.user});
  const nav=await page.goto(WEB_URL+'/notifications',{waitUntil:'domcontentloaded',timeout:60000});
  assert(nav&&nav.status()<500,'notification center UI HTTP '+nav?.status());
  await page.waitForTimeout(1200);
  const body=await page.locator('body').innerText();
  assert(body.includes('Operations Notification + Communication Center'),'unified center title missing');
  assert(body.includes('Notification preferences'),'preference UI missing');
  assert(body.includes('Open action'),'direct action UI missing');
  const overflow=await page.evaluate(()=>({w:window.innerWidth,s:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));
  assert(overflow.s<=overflow.w+4,'notification center horizontal overflow '+JSON.stringify(overflow));
  await page.screenshot({path:OUT+'/notification-center.png',fullPage:true});
  await ctx.close();await browser.close();
  pass('rendered-ui',{desktopOverflow:'PASS'});

  report.status='PASS';
}catch(e){
  report.status='FAIL';report.error=String(e?.stack||e);process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();
  writeFileSync(OUT+'/ANCLINE_CR005_NOTIFICATION_CENTER_ACCEPTANCE.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
