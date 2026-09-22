import {writeFileSync} from 'node:fs';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const EXPECTED_API_COMMIT=(process.env.EXPECTED_API_COMMIT||'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(x,m)=>{if(!x)throw new Error(m)};
const stamp=()=>Date.now().toString(36).toUpperCase();

async function call(path,opt={}){
  const headers={Accept:'application/json',...(opt.headers||{})};
  if(opt.token)headers.Authorization='Bearer '+opt.token;
  if(opt.body!==undefined)headers['Content-Type']='application/json';
  const started=Date.now();
  const r=await fetch(WEB_URL+'/api-proxy'+path,{method:opt.method||'GET',headers,body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
  const raw=await r.text();let body;try{body=raw?JSON.parse(raw):null}catch{body=raw}
  return {status:r.status,ok:r.ok,body,raw,ms:Date.now()-started,headers:r.headers};
}
function ok(r,label){assert(r.ok,label+': HTTP '+r.status+' '+(typeof r.body==='string'?r.body:JSON.stringify(r.body)));return r.body}
function denied(r,label){assert([400,401,403,404,409,422].includes(r.status),label+': expected denial, got HTTP '+r.status);}
async function login(email,role){const b=ok(await call('/auth/login',{method:'POST',body:{email,role}}),'login '+email);return {token:b.accessToken,user:b.user};}
async function waitForApi(){
  if(!EXPECTED_API_COMMIT)return;
  for(let i=0;i<100;i++){
    const r=await call('/health');
    if(r.ok&&String(r.body?.buildCommit||'')===EXPECTED_API_COMMIT)return;
    await sleep(10000);
  }
  throw new Error('Approved API did not converge to '+EXPECTED_API_COMMIT);
}
function p95(values){const v=[...values].sort((a,b)=>a-b);return v[Math.max(0,Math.ceil(v.length*.95)-1)]||0;}
async function burst(path,total,concurrency,opt={}){
  const times=[];let failures=0,next=0;
  async function worker(){
    while(true){
      const i=next++;if(i>=total)return;
      try{const r=await call(path,opt);times.push(r.ms);if(!r.ok)failures++;}catch{failures++;}
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,total)},()=>worker()));
  return {total,concurrency,failures,p95Ms:p95(times),maxMs:times.length?Math.max(...times):0};
}

const report={schema:'ANCLINE_ECOM_FINAL_HARDENING_V1',startedAt:new Date().toISOString(),expectedApiCommit:EXPECTED_API_COMMIT,concurrency:null,callbacks:null,providerFailure:null,paymentFailure:null,security:null,load:null,drPrecheck:null,status:'RUNNING'};
let admin;
try{
  await waitForApi();
  admin=await login('test.admin@ancline.invalid','GLOBAL_ADMIN');
  const finance=await login('test.finance@ancline.invalid','FINANCE');
  const customer=await login('test.customer.nl@ancline.invalid','CUSTOMER');
  const seeded=ok(await call('/test-data/seed',{token:admin.token,method:'POST',body:{}}),'hardening reseed');
  assert(seeded?.summary?.bookings===5,'Expected five synthetic bookings');

  // 1) Concurrent workflow idempotency: exactly one execution, all other requests are duplicates.
  const idemKey='HARDENING-IDEM-'+stamp();
  const triggerBody={process:'HARDENING',trigger:'CONCURRENCY_IDEMPOTENCY',idempotencyKey:idemKey,objectType:'HardeningProbe',objectId:idemKey,context:{synthetic:true}};
  const idemResults=await Promise.all(Array.from({length:24},()=>call('/workflow-automation/trigger',{token:admin.token,method:'POST',body:triggerBody})));
  assert(idemResults.every(r=>r.ok),'Concurrent idempotency requests did not all complete successfully');
  const duplicates=idemResults.filter(r=>r.body?.duplicate===true).length;
  assert(duplicates===23,'Expected 23 duplicate workflow responses, got '+duplicates);
  const dash=ok(await call('/workflow-automation/dashboard',{token:admin.token}),'workflow dashboard');
  const runs=(dash.runs||[]).filter(x=>x.idempotencyKey===idemKey);
  assert(runs.length===1,'Expected one AutomationRun for shared idempotency key, got '+runs.length);
  report.concurrency={requests:24,primary:1,duplicates,runs:runs.length,status:'PASS'};

  // 2) Duplicate carrier/provider callback under concurrency.
  const callbackId='HARD-CALLBACK-'+stamp();
  const callbackBody={sourceSystem:'HARDENING_CARRIER',eventType:'IFTSTA',externalId:callbackId,payload:{bookingNo:'50001',code:'HARDENING_CALLBACK',label:'Hardening duplicate callback',location:'NLRTM',occurredAt:new Date().toISOString(),source:'HARDENING_TEST'}};
  const callbacks=await Promise.all(Array.from({length:16},()=>call('/integrations/ingest',{token:admin.token,method:'POST',body:callbackBody})));
  assert(callbacks.every(r=>r.ok),'Concurrent provider callbacks did not all resolve successfully');
  const cbDuplicates=callbacks.filter(r=>r.body?.duplicate===true).length;
  const responseIds=callbacks.map(r=>r.body?.id).filter(Boolean);
  const uniqueResponseIds=[...new Set(responseIds)];
  assert(responseIds.length===16,'Every provider callback response must identify the persisted integration event');
  assert(uniqueResponseIds.length===1,'Concurrent callbacks referenced more than one integration event: '+uniqueResponseIds.join(','));
  const integrationRows=ok(await call('/integrations',{token:admin.token}),'integration list');
  const callbackRows=(integrationRows||[]).filter(x=>x.sourceSystem==='HARDENING_CARRIER'&&x.externalId===callbackId);
  assert(callbackRows.length===1,'Expected exactly one persisted callback event, got '+callbackRows.length);
  assert(callbackRows[0].id===uniqueResponseIds[0],'Persisted callback id does not match concurrent response id');
  assert(cbDuplicates>=14,'Expected duplicate responses for all concurrent losers; got '+cbDuplicates);
  report.callbacks={requests:16,primaryEventId:uniqueResponseIds[0],duplicateFlags:cbDuplicates,persisted:callbackRows.length,status:'PASS'};

  // 3) Provider failure -> exponential retry metadata -> dead letter at the configured limit.
  const failureId='HARD-FAIL-'+stamp();
  const failed=await call('/integrations/ingest',{token:admin.token,method:'POST',body:{sourceSystem:'HARDENING_PROVIDER',eventType:'UNSUPPORTED_HARDENING',externalId:failureId,payload:{bookingNo:'50001',synthetic:true}}});
  assert(failed.status>=200&&failed.status<500,'Provider failure ingest returned unexpected transport status '+failed.status);
  let rows=ok(await call('/integrations',{token:admin.token}),'provider failure inventory');
  let event=(rows||[]).find(x=>x.sourceSystem==='HARDENING_PROVIDER'&&x.externalId===failureId);
  assert(event&&event.status==='FAILED'&&event.attemptCount===1,'Provider failure did not persist FAILED attempt 1');
  assert(event.payload?._processing?.nextRetryAt,'Provider failure did not persist nextRetryAt');
  for(let attempt=2;attempt<=5;attempt++){
    const rr=await call('/integrations/'+event.id+'/retry',{token:admin.token,method:'POST',body:{}});
    assert(rr.status>=200&&rr.status<500,'Provider retry '+attempt+' returned unexpected transport status '+rr.status);
    event=ok(await call('/integrations/'+event.id,{token:admin.token}),'provider event '+attempt);
    assert(event.attemptCount===attempt,'Provider retry count expected '+attempt+', got '+event.attemptCount);
    if(attempt<5){
      assert(event.status==='FAILED','Provider retry '+attempt+' should remain FAILED, got '+event.status);
      assert(event.payload?._processing?.nextRetryAt,'Provider retry '+attempt+' did not persist nextRetryAt');
    }
  }
  assert(event.status==='DEAD_LETTER','Provider event did not enter DEAD_LETTER after max attempts');
  assert(event.payload?._processing?.deadLetteredAt,'Dead-letter timestamp missing');
  denied(await call('/integrations/'+event.id+'/retry',{token:admin.token,method:'POST',body:{}}),'dead-letter retry denial');
  report.providerFailure={eventId:event.id,attempts:event.attemptCount,status:event.status,backoffRecorded:true,deadLettered:true,result:'PASS'};

  // 4) Payment failure and concurrent duplicate payment reference protection.
  const summary=ok(await call('/test-data/summary',{token:admin.token}),'hardening summary');
  const b50001=(summary.bookings||[]).find(x=>String(x.bookingNo)==='50001');
  assert(b50001,'50001 missing');
  const invoiceNo='HARD-AR-'+stamp();
  const inv=ok(await call('/accounting/invoices',{token:finance.token,method:'POST',body:{bookingId:b50001.id,invoiceNo,invoiceType:'AR',reference:'FINAL_HARDENING'}}),'create hardening invoice');
  const issued=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/issue',{token:finance.token,method:'POST',body:{}}),'issue hardening invoice');
  denied(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:Number(issued.totalAmount)+1,currency:issued.currency,reference:'HARD-OVERPAY-'+stamp()}}),'overpayment denial');
  const wrongCurrency=issued.currency==='EUR'?'USD':'EUR';
  denied(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:1,currency:wrongCurrency,reference:'HARD-WRONGCUR-'+stamp()}}),'wrong-currency payment denial');
  const payRef='HARD-PAY-'+stamp(),payAmount=Math.min(10,Math.max(1,Number(issued.totalAmount)/4));
  const pays=await Promise.all(Array.from({length:12},()=>call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:payAmount,currency:issued.currency,reference:payRef,method:'BANK_TRANSFER'}})));
  assert(pays.every(r=>r.ok),'Concurrent payment reference calls did not all resolve successfully');
  const payDuplicates=pays.filter(r=>r.body?.duplicate===true).length;
  assert(payDuplicates===11,'Expected 11 duplicate payment responses, got '+payDuplicates);
  const paid=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo),{token:finance.token}),'paid invoice');
  assert(Math.abs(Number(paid.paidAmount)-payAmount)<0.01,'Duplicate payment reference changed paid amount more than once');
  denied(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:payAmount+1,currency:issued.currency,reference:payRef}}),'conflicting duplicate payment denial');
  report.paymentFailure={overpaymentBlocked:true,currencyMismatchBlocked:true,concurrentRequests:12,duplicates:payDuplicates,appliedAmount:paid.paidAmount,status:'PASS'};

  // 5) Security boundary and live security-header acceptance.
  const anon=await call('/bookings');
  assert(anon.status===401,'Protected API allowed anonymous booking access: '+anon.status);
  const badToken=await call('/bookings',{headers:{Authorization:'Bearer definitely-invalid-token'}});
  assert(badToken.status===401,'Protected API accepted invalid token: '+badToken.status);
  assert((await call('/integrations',{token:customer.token})).status===403,'Customer could access integration control');
  assert((await call('/workflow-automation/dashboard',{token:customer.token})).status===403,'Customer could access workflow automation');
  const web=await fetch(WEB_URL+'/',{redirect:'follow'});
  const csp=web.headers.get('content-security-policy')||'';
  assert(web.headers.get('x-frame-options')==='DENY','X-Frame-Options is not DENY');
  assert((web.headers.get('x-content-type-options')||'').toLowerCase()==='nosniff','X-Content-Type-Options missing nosniff');
  assert(csp.includes("object-src 'none'")&&csp.includes("frame-ancestors 'none'"),'CSP missing object/frame restrictions');
  assert(!csp.includes("'unsafe-eval'"),'CSP enables unsafe-eval');
  report.security={anonymousBlocked:true,invalidTokenBlocked:true,externalRoleBlocked:true,headers:{xFrameOptions:'DENY',nosniff:true,cspNoEval:true},status:'PASS'};

  // 6) Bounded staging micro-load (not a production capacity benchmark).
  for(let i=0;i<5;i++)ok(await call('/health'),'health warmup '+i);
  const healthLoad=await burst('/health',120,20,{});
  const bookingLoad=await burst('/bookings',80,10,{token:admin.token});
  assert(healthLoad.failures===0,'Health load failures: '+healthLoad.failures);
  assert(bookingLoad.failures===0,'Authenticated booking load failures: '+bookingLoad.failures);
  assert(healthLoad.p95Ms<8000,'Health p95 too high for staging acceptance: '+healthLoad.p95Ms+'ms');
  assert(bookingLoad.p95Ms<10000,'Booking p95 too high for staging acceptance: '+bookingLoad.p95Ms+'ms');
  report.load={health:healthLoad,bookings:bookingLoad,scope:'BOUNDED_STAGING_MICRO_LOAD',status:'PASS'};

  // 7) DR precheck: application UAT state is accessible; exact-image rollback is exercised separately after this run.
  const uat=ok(await call('/uat/status',{token:admin.token}),'UAT status');
  report.drPrecheck={uatStatusAvailable:true,lastRunId:uat?.lastRunId||uat?.runId||null,rollbackDrillRequired:true,status:'PASS'};

  report.status='PASS';report.finishedAt=new Date().toISOString();
  writeFileSync('ANCLINE_FINAL_HARDENING_REPORT.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(e){
  report.status='FAIL';report.finishedAt=new Date().toISOString();report.error=String(e?.stack||e);
  writeFileSync('ANCLINE_FINAL_HARDENING_REPORT.json',JSON.stringify(report,null,2)+'\n');
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
}finally{
  if(admin?.token)try{await call('/test-data/seed',{token:admin.token,method:'POST',body:{}})}catch(e){console.error('Protective reseed failed',String(e));process.exitCode=1}
}
