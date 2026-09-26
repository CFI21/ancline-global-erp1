'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo?:string;businessModel?:string;status?:string;shipmentStatus?:string;origin?:string;destination?:string;createdAt?:string;updatedAt?:string;etd?:string;eta?:string};
type Task={id:string;bookingId?:string;status?:string;slaState?:string;dueAt?:string;createdAt?:string};
type ControlRow={id:string;bookingId?:string;bookingNo?:string;businessModel?:string;branch?:string;severity?:string;category?:string;taskStatus?:string;slaState?:string;due?:string;updatedAt?:string;actionHref?:string;actionLabel?:string;message?:string};
type OpsDashboard={generatedAt?:string;summary?:Record<string,number>;rows?:ControlRow[];filters?:{branches?:string[];businessModels?:string[]}};
type Approval={id:string;status?:string;type?:string;createdAt?:string};
type CreditDashboard={creditHoldCount?:number;collectionCount?:number;criticalCollectionCount?:number;promiseBreachedCount?:number;unreconciledBankCount?:number;reviewCount?:number};
type AccountingDashboard={openARCount?:number;openAPCount?:number;overdueCount?:number;disputedCount?:number;draftCount?:number};
type AutomationDashboard={summary?:{pendingTimers?:number;dueTimers?:number;pendingApprovals?:number;openTasks?:number;executionsWithErrors?:number}};

const terminalJob=new Set(['COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
const closedTask=(s?:string)=>String(s||'').toUpperCase()==='COMPLETED';
const financeCategories=new Set(['PAYMENT_RELEASE_BLOCK','RECONCILIATION_EXCEPTION']);

function inPeriod(v:string|undefined,days:string){
  if(days==='ALL'||!v)return true;
  const t=new Date(v).getTime();
  if(!Number.isFinite(t))return true;
  return t>=Date.now()-Number(days)*86400000;
}

export default function ManagementControlPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [ops,setOps]=useState<OpsDashboard>({summary:{},rows:[],filters:{}});
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [credit,setCredit]=useState<CreditDashboard>({});
  const [accounting,setAccounting]=useState<AccountingDashboard>({});
  const [automation,setAutomation]=useState<AutomationDashboard>({summary:{}});
  const [period,setPeriod]=useState('30');
  const [branch,setBranch]=useState('ALL');
  const [model,setModel]=useState('ALL');
  const [section,setSection]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const [b,ta,o,a,c,ac,w]=await Promise.all([
        api('/bookings',t),api('/tasks',t),api('/operations/control-dashboard',t),api('/approvals',t),
        api('/credit-control/dashboard',t),api('/accounting/dashboard',t),api('/workflow-automation/dashboard',t)
      ]);
      setBookings(Array.isArray(b)?b:[]);setTasks(Array.isArray(ta)?ta:[]);
      setOps(o&&typeof o==='object'?o:{summary:{},rows:[],filters:{}});
      setApprovals(Array.isArray(a)?a:[]);setCredit(c||{});setAccounting(ac||{});setAutomation(w||{summary:{}});
    }catch(e:any){setMessage(e?.message||'Unable to load Management Control.');}
    finally{setBusy(false);}
  }

  const rows=useMemo(()=>{
    return (ops.rows||[]).filter(r=>{
      const periodOk=inPeriod(r.updatedAt||r.due,period);
      const branchOk=branch==='ALL'||r.branch===branch;
      const modelOk=model==='ALL'||String(r.businessModel||'NVOCC').toUpperCase()===model;
      return periodOk&&branchOk&&modelOk;
    });
  },[ops,period,branch,model]);

  const bookingSet=useMemo(()=>new Set(rows.map(r=>r.bookingId).filter(Boolean)),[rows]);
  const scopedBookings=useMemo(()=>bookings.filter(b=>{
    const periodOk=inPeriod(b.updatedAt||b.createdAt||b.etd,period);
    const modelOk=model==='ALL'||String(b.businessModel||'NVOCC').toUpperCase()===model;
    const branchOk=branch==='ALL'||bookingSet.size===0||bookingSet.has(b.id);
    return periodOk&&modelOk&&branchOk;
  }),[bookings,period,model,branch,bookingSet]);
  const scopedTasks=useMemo(()=>tasks.filter(t=>{
    const periodOk=inPeriod(t.createdAt||t.dueAt,period);
    const branchOk=branch==='ALL'||!t.bookingId||bookingSet.size===0||bookingSet.has(t.bookingId);
    return periodOk&&branchOk;
  }),[tasks,period,branch,bookingSet]);

  const activeJobs=scopedBookings.filter(b=>!terminalJob.has(String(b.status||'').toUpperCase()));
  const completedJobs=scopedBookings.filter(b=>terminalJob.has(String(b.status||'').toUpperCase()));
  const openTasks=scopedTasks.filter(t=>!closedTask(t.status));
  const overdueTasks=openTasks.filter(t=>Boolean(t.dueAt&&new Date(t.dueAt).getTime()<Date.now()));
  const critical=rows.filter(r=>String(r.severity||'').toUpperCase()==='CRITICAL');
  const high=rows.filter(r=>String(r.severity||'').toUpperCase()==='HIGH');
  const financeAttention=rows.filter(r=>financeCategories.has(String(r.category||'').toUpperCase()));
  const slaBreaches=rows.filter(r=>/BREACH|OVERDUE|ESCALAT/i.test(String(r.slaState||'')+' '+String(r.taskStatus||''))||Boolean(r.due&&new Date(r.due).getTime()<Date.now()&&String(r.taskStatus||'').toUpperCase()!=='COMPLETED'));
  const pendingApprovals=approvals.filter(a=>String(a.status||'').toUpperCase()==='PENDING');
  const completionPct=scopedBookings.length?Math.round(completedJobs.length/scopedBookings.length*100):0;
  const overduePct=openTasks.length?Math.round(overdueTasks.length/openTasks.length*100):0;

  const branchOptions=Array.from(new Set([...(ops.filters?.branches||[]),...(ops.rows||[]).map(r=>r.branch||'')].filter(Boolean))).sort();
  const modelOptions=Array.from(new Set([...(ops.filters?.businessModels||[]),...bookings.map(b=>String(b.businessModel||'NVOCC').toUpperCase())].filter(Boolean))).sort();

  const kpis=[
    {group:'EXECUTIVE',label:'ACTIVE JOBS',value:activeJobs.length,detail:'Open NVOCC + Forwarding jobs',href:'/jobs'},
    {group:'EXECUTIVE',label:'JOB COMPLETION',value:completionPct+'%',detail:completedJobs.length+' completed in selected view',href:'/jobs'},
    {group:'OPERATIONS',label:'OPEN TASKS',value:openTasks.length,detail:'Operational work still open',href:'/operations-workbench'},
    {group:'OPERATIONS',label:'OVERDUE TASKS',value:overdueTasks.length,detail:overduePct+'% of open tasks',href:'/operations-workbench'},
    {group:'CONTROL',label:'CRITICAL EXCEPTIONS',value:critical.length,detail:high.length+' additional high priority',href:'/operations-workbench'},
    {group:'CONTROL',label:'SLA / ESCALATION',value:slaBreaches.length,detail:'Breached, overdue or escalated items',href:'/operations-workbench'},
    {group:'FINANCE',label:'FINANCE ATTENTION',value:financeAttention.length,detail:'Payment/release/reconciliation',href:'/finance-attention'},
    {group:'FINANCE',label:'PENDING APPROVALS',value:pendingApprovals.length,detail:'Maker-checker decisions outstanding',href:'/finance-attention'},
    {group:'FINANCE',label:'OPEN AR / AP',value:Number(accounting.openARCount||0)+' / '+Number(accounting.openAPCount||0),detail:'Outstanding accounting documents',href:'/accounting'},
    {group:'FINANCE',label:'OVERDUE / DISPUTED',value:Number(accounting.overdueCount||0)+' / '+Number(accounting.disputedCount||0),detail:'Finance collection attention',href:'/credit-control'},
    {group:'CONTROL',label:'CREDIT HOLDS',value:Number(credit.creditHoldCount||0),detail:Number(credit.reviewCount||0)+' credit reviews',href:'/credit-control'},
    {group:'CONTROL',label:'UNRECONCILED BANK',value:Number(credit.unreconciledBankCount||0),detail:Number(credit.promiseBreachedCount||0)+' breached promises',href:'/credit-control'}
  ];
  const visibleKpis=section==='ALL'?kpis:kpis.filter(k=>k.group===section);

  const categories=useMemo(()=>{
    const map=new Map<string,number>();
    for(const r of rows){const k=String(r.category||'ACTION_REQUIRED');map.set(k,(map.get(k)||0)+1);}
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  },[rows]);
  const slaStates=useMemo(()=>{
    const map=new Map<string,number>();
    for(const r of rows){const k=String(r.slaState||'NORMAL');map.set(k,(map.get(k)||0)+1);}
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  },[rows]);

  return <WorkspaceShell
    title="Management Control"
    subtitle="Executive KPIs · operations · finance · job performance · exceptions · SLA"
    active="/management-control"
    actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <label><span className="sub">Period</span><select aria-label="Management period" style={{...fieldStyle,width:145}} value={period} onChange={e=>setPeriod(e.target.value)}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="ALL">All available</option>
        </select></label>
        <label><span className="sub">Branch</span><select aria-label="Management branch" style={{...fieldStyle,width:180}} value={branch} onChange={e=>setBranch(e.target.value)}>
          <option value="ALL">All branches</option>{branchOptions.map(x=><option key={x}>{x}</option>)}
        </select></label>
        <label><span className="sub">Business model</span><select aria-label="Management business model" style={{...fieldStyle,width:175}} value={model} onChange={e=>setModel(e.target.value)}>
          <option value="ALL">All models</option>{modelOptions.map(x=><option key={x}>{x}</option>)}
        </select></label>
        <label><span className="sub">Section</span><select aria-label="Management section" style={{...fieldStyle,width:160}} value={section} onChange={e=>setSection(e.target.value)}>
          <option value="ALL">All sections</option><option value="EXECUTIVE">Executive</option><option value="OPERATIONS">Operations</option><option value="FINANCE">Finance</option><option value="CONTROL">Control</option>
        </select></label>
        <span className="status">Generated {ops.generatedAt?fmtDate(ops.generatedAt):'live'}</span>
      </div>
    </div>

    <div className="grid" style={{marginBottom:12}}>
      {visibleKpis.map(k=><a key={k.label} href={k.href} className="card" style={{textDecoration:'none',color:'inherit'}}>
        <div className="sub">{k.group} · {k.label}</div><div className="kpi">{k.value}</div><div className="sub">{k.detail}</div>
      </a>)}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:12,marginBottom:12}}>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3 style={{margin:'0 0 8px'}}>Exception Mix</h3><a href="/operations-workbench">Drill down</a></div>
        <table className="table"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>
          {categories.map(([k,v])=><tr key={k}><td>{k.replaceAll('_',' ')}</td><td><b>{v}</b></td></tr>)}
          {!categories.length&&<tr><td colSpan={2}>No exceptions in selected view.</td></tr>}
        </tbody></table>
      </div>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3 style={{margin:'0 0 8px'}}>SLA / Escalation States</h3><a href="/operations-workbench">Open workbench</a></div>
        <table className="table"><thead><tr><th>State</th><th>Count</th></tr></thead><tbody>
          {slaStates.map(([k,v])=><tr key={k}><td>{k.replaceAll('_',' ')}</td><td><b>{v}</b></td></tr>)}
          {!slaStates.length&&<tr><td colSpan={2}>No SLA states in selected view.</td></tr>}
        </tbody></table>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:12,marginBottom:12}}>
      <div className="card"><h3 style={{margin:'0 0 8px'}}>Automation Control</h3>
        <div className="grid">
          <div><div className="sub">DUE TIMERS</div><div className="kpi">{Number(automation.summary?.dueTimers||0)}</div></div>
          <div><div className="sub">PENDING TIMERS</div><div className="kpi">{Number(automation.summary?.pendingTimers||0)}</div></div>
          <div><div className="sub">EXECUTION ERRORS</div><div className="kpi">{Number(automation.summary?.executionsWithErrors||0)}</div></div>
        </div><div style={{marginTop:8}}><a href="/workflow-automation">Open Workflow Automation</a></div>
      </div>
      <div className="card"><h3 style={{margin:'0 0 8px'}}>Finance Control</h3>
        <div className="grid">
          <div><div className="sub">COLLECTION QUEUE</div><div className="kpi">{Number(credit.collectionCount||0)}</div></div>
          <div><div className="sub">CRITICAL COLLECTIONS</div><div className="kpi">{Number(credit.criticalCollectionCount||0)}</div></div>
          <div><div className="sub">DRAFT INVOICES</div><div className="kpi">{Number(accounting.draftCount||0)}</div></div>
        </div><div style={{marginTop:8}}><a href="/finance-attention">Open Finance Attention</a></div>
      </div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div><h3 style={{margin:'0 0 3px'}}>Critical / High Control Items</h3><div className="sub">Filtered management drill-down using approved Operations Control data.</div></div>
        <a href="/operations-workbench">Open Operations Workbench</a>
      </div>
      <div style={{overflowX:'auto',marginTop:8}}><table className="table">
        <thead><tr><th>Severity</th><th>Job</th><th>Model</th><th>Branch</th><th>Category</th><th>SLA</th><th>Attention</th><th>Action</th></tr></thead>
        <tbody>
          {rows.filter(r=>['CRITICAL','HIGH'].includes(String(r.severity||'').toUpperCase())).slice(0,20).map(r=><tr key={r.id}>
            <td><b>{r.severity||'—'}</b></td><td>{r.bookingId?<a href={'/bookings/'+r.bookingId}>{r.bookingNo||'Open Job'}</a>:(r.bookingNo||'General')}</td>
            <td>{r.businessModel||'NVOCC'}</td><td>{r.branch||'—'}</td><td>{String(r.category||'ACTION_REQUIRED').replaceAll('_',' ')}</td>
            <td>{r.slaState||'—'}</td><td style={{whiteSpace:'normal',minWidth:240}}>{r.message||'Attention required'}</td>
            <td><a className="btn" style={{textDecoration:'none'}} href={r.actionHref||'/operations-workbench'}>{r.actionLabel||'Open'}</a></td>
          </tr>)}
          {!rows.some(r=>['CRITICAL','HIGH'].includes(String(r.severity||'').toUpperCase()))&&<tr><td colSpan={8}>No critical/high items in selected view.</td></tr>}
        </tbody>
      </table></div>
    </div>
  </WorkspaceShell>;
}
