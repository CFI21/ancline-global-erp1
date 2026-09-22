import {mkdirSync,writeFileSync} from 'node:fs';
const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const EXPECTED_API_COMMIT=(process.env.EXPECTED_API_COMMIT||'').trim();
const JOBS=['50001','50002','50003','50004','50005'];
const OUT='job-done-final-artifacts'; mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(x,m)=>{if(!x)throw new Error(m)};
async function call(path,opt={}){const headers={Accept:'application/json'};if(opt.token)headers.Authorization='Bearer '+opt.token;if(opt.body!==undefined)headers['Content-Type']='application/json';const r=await fetch(WEB_URL+'/api-proxy'+path,{method:opt.method||'GET',headers,body:opt.body===undefined?undefined:JSON.stringify(opt.body)});const raw=await r.text();let body;try{body=raw?JSON.parse(raw):null}catch{body=raw}return{ok:r.ok,status:r.status,body,raw}}
function ok(r,l){assert(r.ok,l+': HTTP '+r.status+' '+(typeof r.body==='string'?r.body:JSON.stringify(r.body)));return r.body}
function denied(r,l){assert([400,401,403,404,409,422].includes(r.status),l+': expected denial, got '+r.status)}
async function login(email,role){const b=ok(await call('/auth/login',{method:'POST',body:{email,role}}),'login '+email);return{token:b.accessToken,user:b.user}}
async function waitApi(){if(!EXPECTED_API_COMMIT)return;for(let i=0;i<90;i++){const h=await call('/health');if(h.ok&&String(h.body?.buildCommit||'')===EXPECTED_API_COMMIT)return;await sleep(5000)}throw new Error('Approved API runtime mismatch')}
const report={schema:'ANCLINE_JOB_DONE_FINAL_BUSINESS_DAY_V1',startedAt:new Date().toISOString(),expectedApiCommit:EXPECTED_API_COMMIT,roles:[],jobs:[],privacy:[],exceptions:[],reconciliation:{},status:'RUNNING'};
let admin;
try{
 await waitApi();
 admin=await login('test.admin@ancline.invalid','GLOBAL_ADMIN');
 const ops=await login('test.ops@ancline.invalid','BRANCH_OPS');
 const finance=await login('test.finance@ancline.invalid','FINANCE');
 const customer=await login('test.customer.nl@ancline.invalid','CUSTOMER');
 const agent=await login('test.agent.sg@ancline.invalid','AGENT');
 const shipper=await login('test.shipper.nl@ancline.invalid','SHIPPER');
 report.roles=[admin.user,ops.user,finance.user,customer.user,agent.user,shipper.user].map(x=>({role:x.role,email:x.email,status:'PASS'}));
 const seeded=ok(await call('/test-data/seed',{token:admin.token,method:'POST',body:{}}),'seed');
 assert(seeded?.summary?.bookings===5,'Expected 5 synthetic jobs');
 const sum=ok(await call('/test-data/summary',{token:admin.token}),'summary');
 const map=new Map((sum.bookings||[]).map(b=>[String(b.bookingNo),b]));
 denied(await call('/test-data/summary',{token:customer.token}),'customer admin summary');
 denied(await call('/finance/booking/'+map.get('50005').id,{token:agent.token}),'agent finance');
 denied(await call('/bookings/'+map.get('50004').id,{token:shipper.token}),'shipper out of scope');
 report.privacy.push({case:'role-scope-boundaries',status:'PASS'});
 for(const n of JOBS){
   const base=map.get(n); assert(base,n+' missing');
   const b=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' detail');
   const model=String(b.businessModel||'').toUpperCase();
   if(model==='FORWARDING')assert(b.rateQuoteId,n+': accepted quote link missing');
   else assert(model==='NVOCC',n+': unexpected model '+model);
   const financeLines=ok(await call('/finance/booking/'+base.id,{token:finance.token}),n+' finance');
   const revenues=financeLines.filter(x=>x.type==='REVENUE');
   assert(revenues.length>0,n+': revenue lines missing');
   for(const line of revenues)if(!line.invoiceReady)ok(await call('/finance/'+line.id+'/invoice-ready',{token:finance.token,method:'POST',body:{ready:true}}),n+' invoice ready');
   const stamp=Date.now().toString(36).toUpperCase()+n;
   const invoiceNo='FINAL-AR-'+n+'-'+stamp;
   const inv=ok(await call('/accounting/invoices',{token:finance.token,method:'POST',body:{bookingId:base.id,invoiceNo,invoiceType:'AR',lineIds:revenues.map(x=>x.id),reference:'JOB_DONE_FINAL_'+n}}),n+' invoice create');
   const issued=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/issue',{token:finance.token,method:'POST',body:{}}),n+' invoice issue');
   assert(Number(issued.totalAmount)>0,n+': invoice total not positive');
   const doc=ok(await call('/documents',{token:admin.token,method:'POST',body:{bookingId:base.id,documentNo:'FINAL-HBL-'+n+'-'+stamp,type:'HOUSE_BL',status:'Draft',releaseControl:'Clear'}}),n+' HBL create');
   ok(await call('/documents/'+doc.id+'/submit-review',{token:admin.token,method:'POST',body:{}}),n+' HBL review');
   ok(await call('/documents/'+doc.id+'/approve',{token:admin.token,method:'POST',body:{}}),n+' HBL approve');
   const secBefore=ok(await call('/portal/bookings/'+base.id+'/release-security',{token:admin.token}),n+' security before');
   let preReleaseBlocked=false;
   if(!secBefore.clear){const r=await call('/documents/'+doc.id+'/release',{token:admin.token,method:'POST',body:{}});denied(r,n+' pre-security release');preReleaseBlocked=true}
   const payRef='FINAL-PAY-'+n+'-'+stamp;
   const paid=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:issued.balanceAmount,currency:issued.currency,reference:payRef,method:'BANK_TRANSFER'}}),n+' payment');
   assert(String(paid.status)==='PAID'&&Number(paid.balanceAmount)<=0.005,n+': invoice not PAID');
   const dup=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo)+'/payments',{token:finance.token,method:'POST',body:{amount:issued.totalAmount,currency:issued.currency,reference:payRef,method:'BANK_TRANSFER'}}),n+' duplicate payment');
   assert(dup.duplicate===true,n+': duplicate payment not idempotent');
   const secAfter=ok(await call('/portal/bookings/'+base.id+'/release-security',{token:admin.token}),n+' security after');
   assert(secAfter.clear===true,n+': release security not clear after payment/credit '+JSON.stringify(secAfter));
   const released=ok(await call('/documents/'+doc.id+'/release',{token:admin.token,method:'POST',body:{}}),n+' HBL release');
   assert(String(released.status).toUpperCase()==='RELEASED',n+': HBL not released');
   const invFinal=ok(await call('/accounting/invoices/'+encodeURIComponent(invoiceNo),{token:finance.token}),n+' invoice reconcile');
   assert(Math.abs(Number(invFinal.totalAmount)-Number(invFinal.paidAmount))<0.01,n+': paid/total reconciliation mismatch');
   assert(Number(invFinal.balanceAmount)<=0.005,n+': balance remains');
   report.jobs.push({bookingNo:n,businessModel:model,quoteLinked:model==='FORWARDING',invoiceNo,total:Number(invFinal.totalAmount),paid:Number(invFinal.paidAmount),balance:Number(invFinal.balanceAmount),releaseMode:secAfter.mode,preReleaseBlocked,hblReleased:true,status:'PASS'});
 }
 const total=report.jobs.reduce((s,x)=>s+x.total,0),paid=report.jobs.reduce((s,x)=>s+x.paid,0),balance=report.jobs.reduce((s,x)=>s+x.balance,0);
 assert(Math.abs(total-paid)<0.01&&balance<=0.01,'portfolio reconciliation failed');
 report.reconciliation={jobs:5,totalInvoiced:Math.round(total*100)/100,totalPaid:Math.round(paid*100)/100,totalBalance:Math.round(balance*100)/100,status:'PASS'};
 report.status='PASS';report.finishedAt=new Date().toISOString();
}catch(e){report.status='FAIL';report.finishedAt=new Date().toISOString();report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1}
finally{if(admin?.token)try{const s=await call('/test-data/seed',{token:admin.token,method:'POST',body:{}});if(!s.ok){report.exceptions.push({case:'protective-reseed',status:'FAIL',http:s.status});report.status='FAIL';process.exitCode=1}else report.exceptions.push({case:'protective-reseed',status:'PASS'})}catch(e){report.exceptions.push({case:'protective-reseed',status:'FAIL',error:String(e)});report.status='FAIL';process.exitCode=1}writeFileSync(OUT+'/ANCLINE_JOB_DONE_BUSINESS_DAY.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
