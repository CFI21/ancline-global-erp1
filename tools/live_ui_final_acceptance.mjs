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

const report={schema:'ANCLINE_SIMPLE_SECURE_UI_FINAL_ACCEPTANCE_V1',startedAt:new Date().toISOString(),webUrl:WEB_URL,roles:[],jobs:[],navigation:[],forms:[],grids:[],popups:[],privacy:[],operationsControl:[],actionQueue:[],slaAutomation:[],exceptions:[],status:'RUNNING'};
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


  // OPERATIONS CONTROL — explicit CR-20260923-001 end-to-end dashboard acceptance.
  {
    const profiles=[
      {name:'desktop',viewport:{width:1440,height:1000}},
      {name:'tablet',viewport:{width:820,height:1180}},
      {name:'mobile',viewport:{width:390,height:844}}
    ];
    const categoryLabels=['Action Required','Cut-off Risk','Document Gaps','Payment / Release','Failed Events','Milestone Delays','Reconciliation'];
    const summaryKeys=['ACTION_REQUIRED','CUT_OFF_RISK','DOCUMENT_GAP','PAYMENT_RELEASE_BLOCK','FAILED_EVENT','LATE_MILESTONE','RECONCILIATION_EXCEPTION'];
    for(const p of profiles){
      const ctx=await browser.newContext({viewport:p.viewport}); const page=await ctx.newPage();
      const user=await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN'); assert(user.role==='GLOBAL_ADMIN',p.name+': operations-control admin role mismatch');
      await safeGoto(page,'/exceptions');
      const dash=await api(page,'/operations/control-dashboard');
      assert(dash.status===200,p.name+': operations-control endpoint HTTP '+dash.status);
      assert(dash.body&&Array.isArray(dash.body.rows)&&dash.body.summary,p.name+': malformed operations-control payload');
      const rows=dash.body.rows;
      assert(new Set(rows.map(x=>String(x.id))).size===rows.length,p.name+': duplicate operations-control row ids');
      assert(Number(dash.body.summary.open)===rows.length,p.name+': operations-control summary/open mismatch');
      for(const key of summaryKeys)assert(Number.isFinite(Number(dash.body.summary[key])),p.name+': missing summary '+key);

      const body=await page.locator('body').innerText();
      assert(body.includes('Operations Control + Exception Dashboard'),p.name+': operations-control title missing');
      for(const label of categoryLabels)assert(body.includes(label),p.name+': operations-control surface missing '+label);
      for(const label of ['Severity','Category','Owner','Business model'])assert(await page.locator('select[aria-label="'+label+'"]').count()===1,p.name+': filter missing '+label);

      if(rows.length){
        const first=String(rows[0].actionHref||'');
        assert(first,p.name+': first operations-control row has no action link');
        await page.waitForFunction(href=>Array.from(document.querySelectorAll('a[href]')).some(a=>a.getAttribute('href')===href),first,{timeout:10000});
        const hrefs=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
        for(const row of rows.slice(0,10))assert(hrefs.includes(String(row.actionHref)),p.name+': rendered action link missing '+row.actionHref);
      }

      const layout=await page.evaluate(()=>({innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth}));
      assert(Math.max(layout.scrollWidth,layout.bodyScrollWidth)<=layout.innerWidth+4,p.name+': operations-control horizontal page overflow '+JSON.stringify(layout));
      if(p.name==='desktop')await shot(page,'operations-control-dashboard');
      report.operationsControl.push({profile:p.name,rows:rows.length,summaryOpen:dash.body.summary.open,endpoint:'PASS',filters:'PASS',actions:rows.length?'PASS':'NO_ROWS_TO_ACTION',layout:'PASS',status:'PASS'});
      await ctx.close();
    }
  }


  // OPERATIONS ACTION QUEUE — explicit CR-20260923-003 end-to-end acceptance.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN'); assert(user.role==='GLOBAL_ADMIN','action-queue admin role mismatch');
    await safeGoto(page,'/exceptions');
    await reseed(page);
    await page.reload({waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(800);

    let dash=await api(page,'/operations/control-dashboard');
    assert(dash.status===200&&Array.isArray(dash.body?.rows),'action queue dashboard unavailable');
    let candidate=dash.body.rows.find(x=>x.bookingId&&x.queueMutable);
    assert(candidate,'no booking-bound queue candidate available');

    const firstClaim=await api(page,'/operations/control-dashboard/'+encodeURIComponent(candidate.id)+'/claim',{method:'POST',body:'{}'});
    assert(firstClaim.ok&&firstClaim.body?.id,'first queue claim failed '+firstClaim.status);
    const secondClaim=await api(page,'/operations/control-dashboard/'+encodeURIComponent(candidate.id)+'/claim',{method:'POST',body:'{}'});
    assert(secondClaim.ok&&secondClaim.body?.id===firstClaim.body.id,'duplicate claim created a different task');
    const taskId=String(firstClaim.body.id);

    const reassigned='test.reassigned@ancline.invalid';
    let upd=await api(page,'/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({ownerId:reassigned,status:'Acknowledged'})});
    assert(upd.ok&&upd.body?.ownerId===reassigned&&upd.body?.status==='Acknowledged','assign/acknowledge failed');

    const overdue=new Date(Date.now()-24*3600000).toISOString().slice(0,10);
    upd=await api(page,'/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({status:'In Progress',dueAt:overdue})});
    assert(upd.ok&&upd.body?.status==='In Progress'&&String(upd.body?.slaState).toUpperCase()==='OVERDUE','in-progress/overdue SLA failed');

    dash=await api(page,'/operations/control-dashboard');
    let persisted=dash.body.rows.find(x=>String(x.id)===String(candidate.id));
    assert(persisted&&String(persisted.taskId)===taskId,'queue task linkage did not persist');
    assert(persisted.owner===reassigned,'queue owner did not persist');
    assert(String(persisted.slaState).toUpperCase()==='OVERDUE','queue SLA did not persist');

    await page.reload({waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(900);
    const ownerInput=page.locator('input[aria-label="Owner '+candidate.bookingNo+'"]').first();
    assert(await ownerInput.count()===1,'queue owner input missing after refresh');
    assert(await ownerInput.inputValue()===reassigned,'queue owner UI lost persistence after refresh');
    const statusSelect=page.locator('select[aria-label="Task status '+candidate.bookingNo+'"]').first();
    assert(await statusSelect.count()===1,'queue status control missing after refresh');
    assert(await statusSelect.inputValue()==='In Progress','queue status UI lost persistence after refresh');

    upd=await api(page,'/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({status:'Completed'})});
    assert(upd.ok&&upd.body?.status==='Completed'&&String(upd.body?.slaState).toUpperCase()==='MET','complete/Met SLA failed');

    const booking=await api(page,'/bookings/'+encodeURIComponent(candidate.bookingId));
    assert(booking.ok&&Array.isArray(booking.body?.auditEvents),'booking audit history unavailable');
    const actions=booking.body.auditEvents.map(x=>String(x.action));
    assert(actions.includes('OPERATIONS_CONTROL_CLAIM'),'claim audit missing');
    assert(actions.includes('TASK_ACTION_QUEUE_UPDATE'),'queue update audit missing');

    await shot(page,'operations-action-queue');
    report.actionQueue.push({role:'GLOBAL_ADMIN',case:'claim-reassign-acknowledge-in-progress-due-sla-complete-audit-refresh-duplicate-claim',taskId,status:'PASS'});
    await ctx.close();
  }

  // CR-003 role boundaries: internal visibility and external denial.
  {
    for(const profile of [
      {email:'test.control@ancline.invalid',role:'CONTROL_TOWER',expect:200},
      {email:'test.ops@ancline.invalid',role:'BRANCH_OPS',expect:200},
      {email:'test.finance@ancline.invalid',role:'FINANCE',expect:200},
      {email:'test.customer.nl@ancline.invalid',role:'CUSTOMER',expect:403},
      {email:'test.agent.sg@ancline.invalid',role:'AGENT',expect:403},
      {email:'test.shipper.nl@ancline.invalid',role:'SHIPPER',expect:403}
    ]){
      const ctx=await browser.newContext(); const page=await ctx.newPage();
      const user=await establish(page,profile.email,profile.role); assert(user.role===profile.role,profile.role+': managed role mismatch');
      const r=await api(page,'/operations/control-dashboard');
      assert(r.status===profile.expect,profile.role+': operations-control boundary expected '+profile.expect+' got '+r.status);
      if(profile.expect===200)assert(Array.isArray(r.body?.rows),profile.role+': internal queue payload malformed');
      report.actionQueue.push({role:profile.role,case:profile.expect===200?'internal-queue-access':'external-queue-denial',status:'PASS'});
      await ctx.close();
    }
  }


  // SLA AUTOMATION + ESCALATION — explicit CR-20260923-004 end-to-end acceptance.
  {
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
    const user=await establish(page,'test.admin@ancline.invalid','GLOBAL_ADMIN'); assert(user.role==='GLOBAL_ADMIN','sla-automation admin role mismatch');
    await safeGoto(page,'/exceptions');
    await reseed(page);

    const summary=(await api(page,'/test-data/summary')).body;
    const booking=(summary.bookings||[]).find(x=>String(x.bookingNo)==='50001');
    assert(booking?.id,'SLA automation requires seeded booking 50001');
    const bookingId=String(booking.id);

    // LEVEL 1: task due shortly -> owner reminder + deterministic timer.
    const l1=await api(page,'/tasks',{method:'POST',body:JSON.stringify({
      bookingId,title:'CR004 E2E L1 owner reminder',ownerId:'test.ops@ancline.invalid',
      dueAt:new Date(Date.now()+60000).toISOString(),status:'In Progress'
    })});
    assert(l1.ok&&l1.body?.id,'LEVEL_1 task creation failed '+l1.status);

    // LEVEL 2: overdue task -> owner + Operations Manager escalation.
    const l2=await api(page,'/tasks',{method:'POST',body:JSON.stringify({
      bookingId,title:'CR004 E2E L2 overdue',ownerId:'test.ops@ancline.invalid',
      dueAt:new Date(Date.now()-2*3600000).toISOString(),status:'In Progress'
    })});
    assert(l2.ok&&l2.body?.id,'LEVEL_2 task creation failed '+l2.status);

    // LEVEL 3: persistent critical OC-style task >24h overdue -> CONTROL_TOWER escalation, no further timer.
    const l3=await api(page,'/tasks',{method:'POST',body:JSON.stringify({
      bookingId,title:'[OC:cr004-e2e-critical] CR004 E2E L3 persistent critical',ownerId:'test.ops@ancline.invalid',
      dueAt:new Date(Date.now()-26*3600000).toISOString(),status:'In Progress'
    })});
    assert(l3.ok&&l3.body?.id,'LEVEL_3 task creation failed '+l3.status);

    let wa=await api(page,'/workflow-automation/dashboard');
    assert(wa.status===200&&wa.body,'workflow automation dashboard unavailable');
    const notifications=wa.body.notifications||[];
    const timers=wa.body.timers||[];
    const n1=notifications.find(x=>String(x.taskId)===String(l1.body.id)&&x.level==='LEVEL_1');
    const n2=notifications.find(x=>String(x.taskId)===String(l2.body.id)&&x.level==='LEVEL_2');
    const n3=notifications.find(x=>String(x.taskId)===String(l3.body.id)&&x.level==='LEVEL_3');
    assert(n1&&Array.isArray(n1.recipients)&&n1.recipients.includes('test.ops@ancline.invalid'),'LEVEL_1 owner reminder missing');
    assert(n2&&Array.isArray(n2.recipients)&&n2.recipients.includes('Operations Manager'),'LEVEL_2 Operations Manager escalation missing');
    assert(n3&&Array.isArray(n3.recipients)&&n3.recipients.includes('CONTROL_TOWER'),'LEVEL_3 CONTROL_TOWER escalation missing');
    const t1=timers.find(x=>String(x.sourceResult?.taskId)===String(l1.body.id));
    const t2=timers.find(x=>String(x.sourceResult?.taskId)===String(l2.body.id)&&x.status==='PENDING');
    const t3=timers.find(x=>String(x.sourceResult?.taskId)===String(l3.body.id)&&x.status==='PENDING');
    assert(t1&&['PENDING','EXECUTED'].includes(String(t1.status)),'LEVEL_1 escalation timer missing');
    assert(t2,'LEVEL_2 escalation timer missing');
    assert(!t3,'LEVEL_3 must not create another escalation timer');

    // Repeating the same SLA state must not duplicate stage notification/timer.
    const repeat=await api(page,'/tasks/'+encodeURIComponent(String(l2.body.id)),{method:'PATCH',body:JSON.stringify({ownerId:'test.ops@ancline.invalid'})});
    assert(repeat.ok,'LEVEL_2 repeat update failed');
    wa=await api(page,'/workflow-automation/dashboard');
    const l2Notifications=(wa.body.notifications||[]).filter(x=>String(x.taskId)===String(l2.body.id)&&x.level==='LEVEL_2');
    const l2Timers=(wa.body.timers||[]).filter(x=>String(x.sourceResult?.taskId)===String(l2.body.id));
    assert(l2Notifications.length===1,'LEVEL_2 duplicate notification created');
    assert(l2Timers.length===1,'LEVEL_2 duplicate timer created');

    // Action Queue API + rendered UI must persist escalation level / notification state.
    let dash=await api(page,'/operations/control-dashboard');
    const row2=(dash.body?.rows||[]).find(x=>String(x.taskId)===String(l2.body.id));
    const row3=(dash.body?.rows||[]).find(x=>String(x.taskId)===String(l3.body.id));
    assert(row2?.escalationLevel==='LEVEL_2'&&row2?.escalationNotificationId,'LEVEL_2 queue escalation metadata missing');
    assert(row3?.escalationLevel==='LEVEL_3'&&row3?.escalationNotificationId,'LEVEL_3 queue escalation metadata missing');
    await page.reload({waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(900);
    const body=await page.locator('body').innerText();
    assert(body.includes('LEVEL_2')&&body.includes('LEVEL_3'),'Action Queue UI did not render persisted escalation levels');

    // Create a dedicated near-due Level-1 timer, then race two run-due executions.
    const raceTask=await api(page,'/tasks',{method:'POST',body:JSON.stringify({
      bookingId,title:'CR004 E2E concurrent run-due',ownerId:'test.ops@ancline.invalid',
      dueAt:new Date(Date.now()+3000).toISOString(),status:'In Progress'
    })});
    assert(raceTask.ok&&raceTask.body?.id,'concurrent run-due task creation failed');
    await sleep(3800);
    const tasksBefore=await api(page,'/tasks');
    const beforeEsc=(Array.isArray(tasksBefore.body)?tasksBefore.body:[]).filter(x=>String(x.title||'').includes('Escalation: OPERATIONS_ACTION_QUEUE · TASK_SLA_ESCALATION')).length;
    const raced=await page.evaluate(async ()=>{
      const token=localStorage.getItem('ancline_token');
      const call=async()=>{const r=await fetch('/api-proxy/workflow-automation/run-due',{method:'POST',headers:{Authorization:'Bearer '+token}});const raw=await r.text();let body;try{body=raw?JSON.parse(raw):null}catch{body=raw}return {status:r.status,body};};
      return Promise.all([call(),call()]);
    });
    assert(raced.every(x=>x.status===200),'concurrent run-due request failed');
    const executed=raced.reduce((n,x)=>n+Number(x.body?.executed||0),0);
    assert(executed<=1,'concurrent run-due executed the same due timer more than once: '+JSON.stringify(raced.map(x=>x.body)));
    const tasksAfter=await api(page,'/tasks');
    const afterEsc=(Array.isArray(tasksAfter.body)?tasksAfter.body:[]).filter(x=>String(x.title||'').includes('Escalation: OPERATIONS_ACTION_QUEUE · TASK_SLA_ESCALATION')).length;
    assert(afterEsc-beforeEsc<=1,'concurrent run-due created duplicate escalation tasks');
    wa=await api(page,'/workflow-automation/dashboard');
    const raceTimers=(wa.body.timers||[]).filter(x=>String(x.sourceResult?.taskId)===String(raceTask.body.id));
    assert(raceTimers.length===1,'concurrent run-due duplicated or lost the race timer');

    // Audit trace back to the booking/task.
    const detail=await api(page,'/bookings/'+encodeURIComponent(bookingId));
    assert(detail.ok&&Array.isArray(detail.body?.auditEvents),'SLA booking audit unavailable');
    const actions=detail.body.auditEvents.map(x=>String(x.action));
    assert(actions.includes('TASK_SLA_AUTOMATION'),'TASK_SLA_AUTOMATION audit trace missing');
    assert(actions.includes('AUTOMATION_NOTIFICATION_CREATED'),'notification audit trace missing');

    await shot(page,'sla-automation-escalation');
    report.slaAutomation.push({
      role:'GLOBAL_ADMIN',
      case:'level1-level2-level3-notifications-timers-idempotency-concurrent-run-due-audit-queue-persistence',
      level1TaskId:String(l1.body.id),level2TaskId:String(l2.body.id),level3TaskId:String(l3.body.id),status:'PASS'
    });
    await ctx.close();
  }

  // CR-004 workflow-automation role/privacy boundary acceptance.
  {
    for(const profile of [
      {email:'test.admin@ancline.invalid',role:'GLOBAL_ADMIN',expect:200},
      {email:'test.control@ancline.invalid',role:'CONTROL_TOWER',expect:200},
      {email:'test.ops@ancline.invalid',role:'BRANCH_OPS',expect:200},
      {email:'test.finance@ancline.invalid',role:'FINANCE',expect:200},
      {email:'test.customer.nl@ancline.invalid',role:'CUSTOMER',expect:403},
      {email:'test.agent.sg@ancline.invalid',role:'AGENT',expect:403},
      {email:'test.shipper.nl@ancline.invalid',role:'SHIPPER',expect:403}
    ]){
      const ctx=await browser.newContext(); const page=await ctx.newPage();
      const user=await establish(page,profile.email,profile.role); assert(user.role===profile.role,profile.role+': SLA role mismatch');
      const r=await api(page,'/workflow-automation/dashboard');
      assert(r.status===profile.expect,profile.role+': workflow automation boundary expected '+profile.expect+' got '+r.status);
      report.slaAutomation.push({role:profile.role,case:profile.expect===200?'internal-automation-access':'external-automation-denial',status:'PASS'});
      await ctx.close();
    }
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
    const internalControl=await api(page,'/operations/control-dashboard'); assert(internalControl.status===403,'CUSTOMER reached internal operations-control endpoint');
    report.privacy.push({role:'CUSTOMER',case:'operations-control-denied',status:'PASS'});
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
    const internalControl=await api(page,'/operations/control-dashboard'); assert(internalControl.status===403,'AGENT reached internal operations-control endpoint');
    report.privacy.push({role:'AGENT',case:'operations-control-denied',status:'PASS'});
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
    const internalControl=await api(page,'/operations/control-dashboard'); assert(internalControl.status===403,'SHIPPER reached internal operations-control endpoint');
    report.privacy.push({role:'SHIPPER',case:'operations-control-denied',status:'PASS'});
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
