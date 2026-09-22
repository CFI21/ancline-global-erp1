const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const EXPECTED_API_COMMIT=(process.env.EXPECTED_API_COMMIT||'').trim();
const JOBS=['50001','50002','50003','50004','50005'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(x,m)=>{if(!x)throw new Error(m)};
const shortStamp=()=>Date.now().toString().slice(-8);

async function call(path,opt={}){
  const headers={Accept:'application/json'};
  if(opt.token)headers.Authorization='Bearer '+opt.token;
  if(opt.body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(WEB_URL+'/api-proxy'+path,{method:opt.method||'GET',headers,body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
  const raw=await r.text(); let body; try{body=raw?JSON.parse(raw):null}catch{body=raw}
  return {status:r.status,ok:r.ok,body,raw};
}
function ok(r,label){assert(r.ok,label+': HTTP '+r.status+' '+(typeof r.body==='string'?r.body:JSON.stringify(r.body)));return r.body}
async function login(email,role){
  const r=await call('/auth/login',{method:'POST',body:{email,role}});
  const b=ok(r,'login '+email);assert(b&&b.accessToken&&b.user,'login '+email+': missing token/user');
  return {token:b.accessToken,user:b.user};
}
async function waitForApi(){
  if(!EXPECTED_API_COMMIT)return;
  for(let i=0;i<90;i++){
    const r=await call('/health');
    if(r.ok&&String((r.body||{}).buildCommit||'')===EXPECTED_API_COMMIT)return;
    await sleep(10000);
  }
  throw new Error('Approved API did not converge to '+EXPECTED_API_COMMIT);
}
function expectDenied(r,label){assert([400,401,403,404,409].includes(r.status),label+': expected denial, got HTTP '+r.status);}
async function reseed(token){return ok(await call('/test-data/seed',{token,method:'POST',body:{}}),'synthetic reseed');}
async function summary(token){return ok(await call('/test-data/summary',{token}),'test-data summary');}

const report={schema:'ANCLINE_ECOM_TRANSACTION_MUTATION_UAT_V1',startedAt:new Date().toISOString(),expectedApiCommit:EXPECTED_API_COMMIT,roles:[],privacy:[],jobs:[],transactionalRunner:null,restore:null,status:'RUNNING'};
let admin=null;
try{
  await waitForApi();
  admin=await login('test.admin@ancline.invalid','GLOBAL_ADMIN');
  const ops=await login('test.ops@ancline.invalid','BRANCH_OPS');
  const finance=await login('test.finance@ancline.invalid','FINANCE');
  const customer=await login('test.customer.nl@ancline.invalid','CUSTOMER');
  const shipper=await login('test.shipper.nl@ancline.invalid','SHIPPER');
  const agent=await login('test.agent.sg@ancline.invalid','AGENT');
  report.roles=[admin.user,ops.user,finance.user,customer.user,shipper.user,agent.user].map(x=>({email:x.email,role:x.role,status:'AUTH_PASS'}));

  const seeded=await reseed(admin.token);
  assert(seeded&&seeded.summary&&seeded.summary.bookings===5,'Expected 5 seeded jobs after reseed');
  let s=await summary(admin.token);
  const byNo=new Map((s.bookings||[]).map(x=>[String(x.bookingNo),x]));
  for(const n of JOBS){
    const b=byNo.get(n);assert(b,'Missing seeded job '+n);
    for(const k of ['routingLegs','milestones','documents','financeLines','tasks','approvals','closeoutItems'])assert(Number(b[k])>0,n+': '+k+' missing before mutation');
  }

  expectDenied(await call('/test-data/seed',{token:customer.token,method:'POST',body:{}}),'CUSTOMER admin seed');
  expectDenied(await call('/bookings/'+byNo.get('50004').id,{token:shipper.token}),'SHIPPER out-of-scope booking');
  expectDenied(await call('/bookings/'+byNo.get('50001').id,{token:shipper.token,method:'PATCH',body:{notes:'ILLEGAL EXTERNAL MUTATION'}}),'SHIPPER internal mutation');
  expectDenied(await call('/finance/booking/'+byNo.get('50005').id,{token:agent.token}),'AGENT finance access');
  expectDenied(await call('/auth/login',{method:'POST',body:{email:'mutation.unmanaged.shipper@invalid.example',role:'SHIPPER'}}),'unmanaged SHIPPER');
  report.privacy.push({case:'role-and-scope-denials',status:'PASS'});

  const integrations=ok(await call('/operations/integrations',{token:admin.token}),'integration inventory');
  const providers=(Array.isArray(integrations)?integrations:[]).filter(x=>x.sourceSystem==='ANCLINE_RATE_PROCUREMENT'&&x.objectType==='CarrierRateProvider'&&x.eventType==='PROVIDER_PROFILE_SET');
  assert(providers.length>=3,'Expected synthetic carrier provider profiles');
  for(const e of providers){
    const d=(e.payload||{}).dataProtection||{};
    assert(d.customerKycOutbound===false&&d.customerReferenceOutbound===false&&d.houseBlOutbound===false&&d.housePartiesOutbound===false,'Carrier provider privacy flags are not fail-closed');
    const z=JSON.stringify(e.payload||{});
    assert(!z.includes('beneficialOwners')&&!z.includes('registeredAddress')&&!z.includes('contactPhone'),'Carrier provider payload contains KYC/private fields');
  }
  report.privacy.push({case:'carrier-provider-data-protection',profiles:providers.length,status:'PASS'});

  const carriers=ok(await call('/carrier-operations/carriers',{token:admin.token}),'carrier catalog');
  const schedules=ok(await call('/carrier-operations/schedules',{token:admin.token}),'schedule catalog');

  for(const n of JOBS){
    const base=byNo.get(n);
    let booking=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' booking detail');
    const row={bookingNo:n,businessModel:booking.businessModel,mutations:[],negatives:[],status:'RUNNING'};

    let cbs=ok(await call('/carrier-operations/carrier-bookings',{token:admin.token}),'carrier booking list');
    const activeCarrierControls=(Array.isArray(cbs)?cbs:[]).filter(x=>String(x.bookingId)===String(base.id)&&String(x.status).toUpperCase()!=='CANCELLED');
    for(const old of activeCarrierControls){
      ok(await call('/carrier-operations/carrier-bookings/'+old.carrierOperationNo+'/cancel',{token:admin.token,method:'POST',body:{reason:'ECOM mutation UAT baseline reset'}}),n+' cancel baseline carrier control '+old.carrierOperationNo);
    }
    booking=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' post-reset booking');
    const sched=(Array.isArray(schedules)?schedules:[]).find(x=>String(x.portOfLoading)===String(booking.portOfLoading)&&String(x.portOfDischarge)===String(booking.portOfDischarge)&&String(x.carrier)===String(booking.carrier))
      ||(Array.isArray(schedules)?schedules:[]).find(x=>String(x.portOfLoading)===String(booking.portOfLoading)&&String(x.portOfDischarge)===String(booking.portOfDischarge));
    assert(sched,n+': no matching synthetic sailing schedule');
    const carrier=(Array.isArray(carriers)?carriers:[]).find(x=>String(x.name)===String(sched.carrier))||(Array.isArray(carriers)?carriers[0]:null);
    assert(carrier,n+': no synthetic carrier');
    const cb=ok(await call('/carrier-operations/carrier-bookings',{token:admin.token,method:'POST',body:{bookingId:base.id,carrierId:carrier.id,scheduleId:sched.id,equipmentType:booking.equipment,quantity:booking.quantity,notes:'ECOM transaction mutation UAT'}}),n+' carrier request');
    ok(await call('/carrier-operations/carrier-bookings/'+cb.carrierOperationNo+'/confirm',{token:admin.token,method:'POST',body:{carrierBookingNo:'UAT-CB-'+n}}),n+' carrier confirm');
    ok(await call('/carrier-operations/carrier-bookings/'+cb.carrierOperationNo+'/allocate',{token:admin.token,method:'POST',body:{allocationRef:'UAT-ALLOC-'+n}}),n+' carrier allocate');
    ok(await call('/carrier-operations/carrier-bookings/'+cb.carrierOperationNo+'/equipment-release',{token:admin.token,method:'POST',body:{releaseOrderNo:'UAT-ERO-'+n,emptyDepot:'UAT TEST DEPOT',releaseValidUntil:new Date(Date.now()+7*86400000).toISOString()}}),n+' equipment release');
    row.mutations.push('carrier-request-confirm-allocate-release');

    booking=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' carrier-updated booking');
    assert(Array.isArray(booking.containers)&&booking.containers.length>0,n+': no containers');
    for(const ct of booking.containers)ok(await call('/container-movements',{token:admin.token,method:'POST',body:{bookingId:base.id,containerId:ct.id,eventCode:'LOADED',eventLabel:'Loaded for ECOM UAT',status:'LOADED',location:booking.portOfLoading||booking.origin,occurredAt:new Date().toISOString(),source:'ECOM_UAT',reference:'UAT-'+n}}),n+' load '+ct.containerNo);
    row.mutations.push('container-loaded');

    const consol=ok(await call('/shipment-control/consols',{token:admin.token,method:'POST',body:{consolNo:'ANC-TEST-UAT-'+n,mode:'SEA',carrier:booking.carrier,vessel:'UAT VESSEL '+n,voyage:'UAT'+n,origin:booking.origin,destination:booking.destination,portOfLoading:booking.portOfLoading||booking.origin,portOfDischarge:booking.portOfDischarge||booking.destination,etd:new Date(Date.now()+86400000).toISOString(),eta:new Date(Date.now()+10*86400000).toISOString(),remarks:'Synthetic mutation UAT only'}}),n+' create consol');
    ok(await call('/shipment-control/consols/'+consol.id+'/assign/'+base.id,{token:admin.token,method:'POST',body:{}}),n+' assign consol');
    ok(await call('/shipment-control/consols/'+consol.id+'/confirm',{token:admin.token,method:'POST',body:{}}),n+' confirm consol');
    ok(await call('/shipment-control/consols/'+consol.id+'/depart',{token:admin.token,method:'POST',body:{}}),n+' depart consol');
    ok(await call('/shipment-control/consols/'+consol.id+'/arrive',{token:admin.token,method:'POST',body:{}}),n+' arrive consol');
    ok(await call('/shipment-control/consols/'+consol.id+'/close',{token:admin.token,method:'POST',body:{}}),n+' close consol');
    row.mutations.push('shipment-consol-confirm-depart-arrive-close');

    const ms=ok(await call('/tracking',{token:admin.token,method:'POST',body:{bookingId:base.id,code:'UAT_'+n,label:'ECOM UAT mutation milestone',location:booking.destination,status:'PLANNED',source:'ECOM_UAT'}}),n+' create milestone');
    ok(await call('/tracking/'+ms.id+'/complete',{token:admin.token,method:'POST',body:{location:booking.destination,remarks:'ECOM mutation completed'}}),n+' complete milestone');
    row.mutations.push('tracking-milestone-complete');

    const doc=ok(await call('/documents',{token:admin.token,method:'POST',body:{bookingId:base.id,documentNo:'ANC-TEST-MUT-'+n+'-'+shortStamp(),type:'BOOKING_CONFIRMATION',status:'Draft',releaseControl:'Clear'}}),n+' document create');
    ok(await call('/documents/'+doc.id+'/submit-review',{token:admin.token,method:'POST',body:{}}),n+' document submit');
    ok(await call('/documents/'+doc.id+'/approve',{token:admin.token,method:'POST',body:{}}),n+' document approve');
    ok(await call('/documents/'+doc.id+'/release',{token:admin.token,method:'POST',body:{}}),n+' document release');
    expectDenied(await call('/documents/'+doc.id+'/release',{token:admin.token,method:'POST',body:{}}),n+' duplicate document release');
    row.mutations.push('document-draft-review-approve-release');row.negatives.push('duplicate-document-release-blocked');

    if(String(booking.businessModel).toUpperCase()==='FORWARDING'){
      ok(await call('/finance/booking/'+base.id+'/sync-quote',{token:finance.token,method:'POST',body:{}}),n+' quote finance handover');
      row.mutations.push('accepted-quote-finance-handover');
    }else{
      expectDenied(await call('/finance/booking/'+base.id+'/sync-quote',{token:finance.token,method:'POST',body:{}}),n+' NVOCC no-forwarding-quote');
      row.negatives.push('nvocc-forwarding-quote-handover-blocked');
    }

    const financeLines=ok(await call('/finance/booking/'+base.id,{token:finance.token}),n+' finance lines');
    assert(Array.isArray(financeLines)&&financeLines.some(x=>x.type==='REVENUE')&&financeLines.some(x=>x.type==='COST'),n+': revenue/cost lines missing');
    for(const line of financeLines){
      if(line.type==='REVENUE')ok(await call('/finance/'+line.id+'/invoice-ready',{token:finance.token,method:'POST',body:{ready:true,invoiceNo:'UAT-INV-'+n+'-'+line.id.slice(-4)}}),n+' invoice ready');
      ok(await call('/finance/'+line.id+'/status',{token:finance.token,method:'POST',body:{status:'FINAL'}}),n+' finance FINAL');
    }
    const fl=financeLines[0];
    expectDenied(await call('/finance/'+fl.id,{token:finance.token,method:'PATCH',body:{amount:Number(fl.amount||0)+1}}),n+' edit finalized finance');
    row.mutations.push('finance-final-and-invoice-ready');row.negatives.push('final-finance-edit-blocked');

    const taskRows=ok(await call('/tasks',{token:admin.token}),'tasks list').filter(x=>String(x.bookingId)===String(base.id));
    for(const t of taskRows)if(String(t.status).toUpperCase()!=='COMPLETED')ok(await call('/tasks/'+t.id+'/complete',{token:admin.token,method:'POST',body:{}}),n+' complete task');
    const approvalRows=ok(await call('/approvals',{token:admin.token}),'approvals list').filter(x=>String(x.bookingId)===String(base.id));
    for(const a of approvalRows)if(String(a.status).toUpperCase()==='PENDING')ok(await call('/approvals/'+a.id+'/approve',{token:admin.token,method:'POST',body:{}}),n+' approve checker item');
    row.mutations.push('tasks-complete','approvals-decided');

    ok(await call('/bookings/'+base.id,{token:admin.token,method:'PATCH',body:{creditStatus:'Passed'}}),n+' clear synthetic credit');
    for(let i=0;i<20;i++){
      booking=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' state read');
      if(['COMPLETED','FINANCIALLY_CLOSED'].includes(String(booking.status)))break;
      ok(await call('/bookings/'+base.id+'/advance',{token:admin.token,method:'POST',body:{}}),n+' advance '+booking.status);
    }
    booking=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' completed state read');
    assert(booking.status==='COMPLETED',n+': expected COMPLETED before financial close, got '+booking.status);
    row.mutations.push('booking-state-machine-to-completed');

    let checklist=ok(await call('/operations/closeout/'+base.id,{token:admin.token}),n+' closeout checklist');
    expectDenied(await call('/operations/closeout/'+base.id+'/finalize',{token:admin.token,method:'POST',body:{}}),n+' premature closeout');
    row.negatives.push('premature-closeout-blocked');

    ok(await call('/finance/booking/'+base.id+'/finalize',{token:finance.token,method:'POST',body:{}}),n+' finance finalize');
    checklist=ok(await call('/operations/closeout/'+base.id,{token:admin.token}),n+' closeout checklist refresh');
    for(const item of checklist)if(item.mandatory&&!item.completed)ok(await call('/operations/closeout/'+base.id+'/items/'+item.id+'/toggle',{token:admin.token,method:'POST',body:{}}),n+' closeout item '+item.itemCode);
    const closed=ok(await call('/operations/closeout/'+base.id+'/finalize',{token:admin.token,method:'POST',body:{}}),n+' closeout finalize');
    assert(closed.status==='FINANCIALLY_CLOSED',n+': financial close status '+closed.status);
    row.mutations.push('financial-closeout');

    const verify=ok(await call('/bookings/'+base.id,{token:admin.token}),n+' final verification');
    assert(verify.status==='FINANCIALLY_CLOSED',n+': final booking status '+verify.status);
    assert(verify.atd&&verify.ata,n+': ATD/ATA not populated by consol lifecycle');
    row.status='PASS';report.jobs.push(row);
  }

  const tx=ok(await call('/uat/run',{token:admin.token,method:'POST',body:{cleanup:true}}),'built-in transactional UAT');
  assert(String((tx||{}).status||(tx||{}).result||'').toUpperCase().includes('PASS')||(tx||{}).passed===true,'Built-in transactional UAT did not report PASS: '+JSON.stringify(tx));
  report.transactionalRunner={runId:(tx||{}).runId||null,status:'PASS'};

  const restored=await reseed(admin.token);assert(restored&&restored.summary&&restored.summary.bookings===5,'Restore reseed did not return five jobs');
  const finalSummary=await summary(admin.token);
  for(const b of finalSummary.bookings||[])if(JOBS.includes(String(b.bookingNo)))for(const k of ['routingLegs','milestones','documents','financeLines','tasks','approvals','closeoutItems'])assert(Number(b[k])>0,'Restored '+b.bookingNo+': '+k+' missing');
  report.restore={status:'PASS',bookings:finalSummary.summary&&finalSummary.summary.bookings,rolesCovered:finalSummary.summary&&finalSummary.summary.rolesCovered};
  report.status='PASS';report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));
}catch(e){
  report.status='FAIL';report.finishedAt=new Date().toISOString();report.error=String(e&&e.stack||e);console.error(JSON.stringify(report,null,2));process.exitCode=1;
}finally{
  if(admin&&admin.token)try{await reseed(admin.token)}catch(e){console.error('Final protective reseed failed:',String(e&&e.stack||e));process.exitCode=1}
}
